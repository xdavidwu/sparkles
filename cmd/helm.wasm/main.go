package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"syscall/js"

	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/chartutil"
	"helm.sh/helm/v3/pkg/engine"
	discoveryv2 "k8s.io/api/apidiscovery/v2"
	kubeerrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

var (
	errorClass      = js.Global().Get("Error")
	uint8ArrayClass = js.Global().Get("Uint8Array")
	promiseClass    = js.Global().Get("Promise")
)

func consoleLog(args ...any) {
	js.Global().Get("console").Call("log", args...)
}

func jsError(e error) js.Value {
	msg := e.Error()
	asError := errorClass.New(msg)
	// XXX directly using it (for console.log, promise reject, etc.)
	// seems not to work on firefox 130.0
	stack := asError.Get("stack").String()
	return js.ValueOf(msg + "\n" + stack)
}

func goError(e js.Value) error {
	return errors.New(e.Call("toString").String())
}

// blocking, meant to be run in catch() with gorountine
func parseErrorFromCodegen(e js.Value, out chan error, verb string) {
	if e.Get("name").String() == "ResponseError" {
		var catch, then js.Func
		releaseFuncs := func() {
			catch.Release()
			then.Release()
		}
		catch = js.FuncOf(func(this js.Value, args []js.Value) any {
			releaseFuncs()
			out <- goError(args[0])
			return nil
		})
		then = js.FuncOf(func(this js.Value, args []js.Value) any {
			releaseFuncs()

			typedArray := uint8ArrayClass.New(args[0])
			bytes := make([]byte, typedArray.Length())
			js.CopyBytesToGo(bytes, typedArray)
			status := metav1.Status{}
			err := json.Unmarshal(bytes, &status)
			if err != nil || status.APIVersion != "v1" || status.Kind != "Status" {
				out <- kubeerrors.NewGenericServerResponse(
					e.Get("response").Get("status").Int(),
					verb, schema.GroupResource{}, "", "", 0, true,
				)
				return nil
			}
			out <- kubeerrors.FromObject(&status)
			return nil
		})
		e.Get("response").Call("arrayBuffer").Call("then", then, catch)
	} else {
		out <- goError(e)
	}
}

// for helm.sh/helm/v3/pkg/engine.newLookupFunction
type jsClient struct {
	class           js.Value
	group           js.Value // undefined for core
	version, plural string
	namespace       string
}

func (c *jsClient) Namespace(ns string) dynamic.ResourceInterface {
	n := *c
	n.namespace = ns
	return &n
}

func (*jsClient) Create(context.Context, *unstructured.Unstructured, metav1.CreateOptions, ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Update(context.Context, *unstructured.Unstructured, metav1.UpdateOptions, ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) UpdateStatus(context.Context, *unstructured.Unstructured, metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Delete(context.Context, string, metav1.DeleteOptions, ...string) error {
	panic("unimplemented")
}

func (*jsClient) DeleteCollection(context.Context, metav1.DeleteOptions, metav1.ListOptions) error {
	panic("unimplemented")
}

func (c *jsClient) Get(_ context.Context, name string, _ metav1.GetOptions, subresources ...string) (*unstructured.Unstructured, error) {
	if len(subresources) != 0 {
		panic("unimplemented")
	}
	args := map[string]interface{}{
		"group":     c.group,
		"version":   c.version,
		"plural":    c.plural,
		"namespace": c.namespace,
		"name":      name,
	}
	fn := "getNamespacedCustomObjectRaw"
	if c.namespace == "" {
		fn = "getClusterCustomObjectRaw"
	}

	resChan := make(chan *unstructured.Unstructured)
	errChan := make(chan error)
	var catch, then js.Func
	catch = js.FuncOf(func(this js.Value, args []js.Value) any {
		then.Release()
		catch.Release()
		go parseErrorFromCodegen(args[0], errChan, "GET")
		return nil
	})
	then = js.FuncOf(func(this js.Value, args []js.Value) any {
		then.Release()
		then = js.FuncOf(func(this js.Value, args []js.Value) any {
			then.Release()
			catch.Release()

			typedArray := uint8ArrayClass.New(args[0])
			bytes := make([]byte, typedArray.Length())
			js.CopyBytesToGo(bytes, typedArray)
			obj, err := runtime.Decode(unstructured.UnstructuredJSONScheme, bytes)
			if err != nil {
				errChan <- err
				return nil
			}
			resChan <- obj.(*unstructured.Unstructured)
			return nil
		})
		args[0].Get("raw").Call("arrayBuffer").Call("then", then, catch)
		return nil
	})
	c.class.Call(fn, args).Call("then", then, catch)

	select {
	case res := <-resChan:
		return res, nil
	case err := <-errChan:
		return nil, err
	}
}

func (c *jsClient) List(_ context.Context, _ metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	args := map[string]interface{}{
		"group":     c.group,
		"version":   c.version,
		"plural":    c.plural,
		"namespace": c.namespace,
	}
	fn := "listNamespacedCustomObjectRaw"
	if c.namespace == "" {
		fn = "listClusterCustomObjectRaw"
	}

	resChan := make(chan *unstructured.UnstructuredList)
	errChan := make(chan error)
	var catch, then js.Func
	catch = js.FuncOf(func(this js.Value, args []js.Value) any {
		then.Release()
		catch.Release()
		go parseErrorFromCodegen(args[0], errChan, "GET")
		return nil
	})
	then = js.FuncOf(func(this js.Value, args []js.Value) any {
		then.Release()
		then = js.FuncOf(func(this js.Value, args []js.Value) any {
			then.Release()
			catch.Release()

			typedArray := uint8ArrayClass.New(args[0])
			bytes := make([]byte, typedArray.Length())
			js.CopyBytesToGo(bytes, typedArray)
			obj, err := runtime.Decode(unstructured.UnstructuredJSONScheme, bytes)
			if err != nil {
				errChan <- err
				return nil
			}
			resChan <- obj.(*unstructured.UnstructuredList)
			return nil
		})
		args[0].Get("raw").Call("arrayBuffer").Call("then", then, catch)
		return nil
	})
	c.class.Call(fn, args).Call("then", then, catch)

	select {
	case res := <-resChan:
		return res, nil
	case err := <-errChan:
		return nil, err
	}
}

func (*jsClient) Watch(context.Context, metav1.ListOptions) (watch.Interface, error) {
	panic("unimplemented")
}

func (*jsClient) Patch(context.Context, string, types.PatchType, []byte, metav1.PatchOptions, ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Apply(context.Context, string, *unstructured.Unstructured, metav1.ApplyOptions, ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) ApplyStatus(context.Context, string, *unstructured.Unstructured, metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

type jsClientProvider struct {
	class  js.Value
	groups []discoveryv2.APIGroupDiscovery
}

func (p *jsClientProvider) GetClientFor(apiVersion, kind string) (dynamic.NamespaceableResourceInterface, bool, error) {
	parts := strings.Split(apiVersion, "/")
	if len(parts) > 2 {
		return nil, false, fmt.Errorf("invalid apiVersion: %v", apiVersion)
	}
	var (
		group, version string
		jsGroup        js.Value
	)
	if len(parts) == 1 {
		group = ""
		version = parts[0]
		jsGroup = js.Undefined()
	} else {
		group = parts[0]
		version = parts[1]
		jsGroup = js.ValueOf(group)
	}

	plural := ""
	namespaced := false

	for _, g := range p.groups {
		if g.ObjectMeta.Name != group {
			continue
		}
		for _, v := range g.Versions {
			if v.Version != version {
				continue
			}
			for _, r := range v.Resources {
				if r.ResponseKind.Kind != kind {
					continue
				}
				plural = r.Resource
				namespaced = r.Scope == discoveryv2.ScopeNamespace
			}
		}
	}

	if plural == "" {
		return nil, namespaced, fmt.Errorf("kind unsupported by cluster: %v %v", apiVersion, kind)
	}

	return &jsClient{
		class:   p.class,
		group:   jsGroup,
		version: version,
		plural:  plural,
	}, namespaced, nil
}

type DiscoveryData struct {
	chartutil.Capabilities
	Groups []discoveryv2.APIGroupDiscovery
}

func panicToPromiseReject(msg string, reject js.Value) {
	if e := recover(); e != nil {
		var err error
		switch e.(type) {
		case error:
			err = e.(error)
		default:
			err = fmt.Errorf("%s: %v", msg, e)
		}
		reject.Invoke(jsError(err))
	}
}

// engine may uses networking (lookup function)
func renderTemplate(this js.Value, args []js.Value) any {
	chartJSONs := args[0]
	valuesJSON := args[1]
	optsJSON := args[2]
	dataJSON := args[3]
	anyApiClass := args[4]

	var executor js.Func
	executor = js.FuncOf(func(this js.Value, args []js.Value) any {
		executor.Release()
		resolve := args[0]
		reject := args[1]
		must := func(e error) {
			if e != nil {
				panic(e)
			}
		}
		defer panicToPromiseReject("cannot render template", reject)

		c := chart.Chart{}
		must(json.Unmarshal([]byte(chartJSONs.Index(0).String()), &c))
		for i := 1; i < chartJSONs.Length(); i += 1 {
			subchart := chart.Chart{}
			must(json.Unmarshal([]byte(chartJSONs.Index(i).String()), &subchart))
			c.AddDependency(&subchart)
		}

		values := map[string]interface{}{}
		must(json.Unmarshal([]byte(valuesJSON.String()), &values))

		must(chartutil.ProcessDependenciesWithMerge(&c, values))

		opts := chartutil.ReleaseOptions{}
		must(json.Unmarshal([]byte(optsJSON.String()), &opts))

		data := DiscoveryData{}
		must(json.Unmarshal([]byte(dataJSON.String()), &data))

		data.Capabilities.HelmVersion = chartutil.DefaultCapabilities.HelmVersion

		clientProvider := jsClientProvider{class: anyApiClass, groups: data.Groups}

		v, err := chartutil.ToRenderValues(&c, values, opts, &data.Capabilities)
		must(err)

		crds := c.CRDObjects()
		crdBytes, err := json.Marshal(crds)
		must(err)

		cbytes, err := json.Marshal(c)
		must(err)

		go func() {
			defer panicToPromiseReject("cannot render template", reject)

			res, err := engine.RenderWithClientProvider(&c, v, &clientProvider)
			must(err)

			// syscall/js.ValueOf
			files := map[string]interface{}{}

			for k, v := range res {
				// helm.sh/helm/v3/pkg/engine.Engine.Render trims partials, but not empty files
				trimmed := strings.TrimSpace(v)
				if trimmed != "" {
					// take this opportunity to save bits
					// files are notes or yamls, which should be fine
					files[k] = trimmed
				}
			}

			resolve.Invoke(map[string]interface{}{
				"files": files,
				"chart": string(cbytes),
				"crds":  string(crdBytes),
			})
		}()
		return nil
	})
	return promiseClass.New(executor)
}

func main() {
	js.Global().Set("_helm_renderTemplate", js.FuncOf(renderTemplate))
	<-make(chan bool)
}
