package main

import (
	"encoding/json"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage/driver"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"syscall/js"
)

// TODO read from js
var config = rest.Config{
	Host: "http://localhost:8000",
}

var client *kubernetes.Clientset

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

func prepareConfig() {
	if client == nil {
		client = kubernetes.NewForConfigOrDie(&config)
	}
}

func listReleasesForNamespaceAsPromise(this js.Value, args []js.Value) any {
	prepareConfig()
	namespace := args[0].String()
	handler := js.FuncOf(func(this js.Value, args []js.Value) any {
		resolve := args[0]
		reject := args[1]
		go func() {
			d := driver.NewSecrets(client.CoreV1().Secrets(namespace))
			res, err := d.List(func(_ *release.Release) bool {
				return true
			})
			if err != nil {
				reject.Invoke(jsError(err.Error()))
				return
			}
			// TODO is there a better way?
			data, _ := json.Marshal(res)
			resolve.Invoke(string(data))
		}()

		return nil
	})
	return js.Global().Get("Promise").New(handler)
}

func main() {
	js.Global().Set("configConnection", js.FuncOf(configConnection))
	js.Global().Set("listReleasesForNamespace",
		js.FuncOf(listReleasesForNamespaceAsPromise))
	<-make(chan bool)
}
