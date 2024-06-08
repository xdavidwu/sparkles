package main

import (
	"encoding/json"
	"syscall/js"

	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chartutil"
	"helm.sh/helm/v3/pkg/engine"
	"k8s.io/client-go/rest"
)

var (
	config = rest.Config{
		Host: "http://localhost:8000",
	}
)

func consoleLog(m string) any {
	return js.Global().Get("console").Call("log", m)
}

func jsError(e any) any {
	return js.Global().Get("Error").New(e)
}

func configConnection(this js.Value, args []js.Value) any {
	host := args[0].Get("basePath")
	config.Host = host.String()
	token := args[0].Get("accessToken")
	if token.Truthy() {
		config.BearerToken = token.String()
	}
	impersonation := args[0].Get("impersonation")
	user := impersonation.Get("asUser")
	if user.Truthy() {
		config.Impersonate = rest.ImpersonationConfig{
			UserName: user.String(),
		}
		group := impersonation.Get("asGroup")
		if !group.IsUndefined() && !group.IsNull() {
			config.Impersonate.Groups = []string{group.String()}
		}
	}
	return nil
}

func renderTemplate(this js.Value, args []js.Value) any {
	must := func(e error) {
		if e != nil {
			panic(e)
		}
	}

	c := chart.Chart{}
	must(json.Unmarshal([]byte(args[0].Index(0).String()), &c))
	for i := 1; i < args[0].Length(); i += 1 {
		subchart := chart.Chart{}
		must(json.Unmarshal([]byte(args[0].Index(i).String()), &subchart))
		c.AddDependency(&subchart)
	}

	values := map[string]interface{}{}
	must(json.Unmarshal([]byte(args[1].String()), &values))

	opts := chartutil.ReleaseOptions{}
	must(json.Unmarshal([]byte(args[2].String()), &opts))

	caps := chartutil.Capabilities{}
	must(json.Unmarshal([]byte(args[3].String()), &caps))

	caps.HelmVersion = chartutil.DefaultCapabilities.HelmVersion

	v, err := chartutil.ToRenderValues(&c, values, opts, &caps)
	must(err)
	e := engine.New(&config)
	// engine may uses networking (lookup function)
	handler := js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve := args[0]
		reject := args[1]
		go func() {
			must := func(e error) {
				if e != nil {
					reject.Invoke(jsError(e))
					return
				}
			}

			res, err := e.Render(&c, v)
			must(err)

			b, err := json.Marshal(res)
			must(err)

			resolve.Invoke(string(b))
		}()
		must(err)
		return nil
	})

	return js.Global().Get("Promise").New(handler)
}

func main() {
	js.Global().Set("_helm_configConnection", js.FuncOf(configConnection))
	js.Global().Set("_helm_renderTemplate", js.FuncOf(renderTemplate))
	<-make(chan bool)
}
