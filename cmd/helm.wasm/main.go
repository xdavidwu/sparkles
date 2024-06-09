package main

import (
	"context"
	"encoding/json"
	"errors"
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
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
)

func consoleLog(m string) any {
	return js.Global().Get("console").Call("log", m)
}

func jsError(e error) any {
	return js.Global().Get("Error").New(e.Error())
}

func goError(e js.Value) error {
	return errors.New(e.Call("toString").String())
}

func goErrorFromOpenAPICodegen(e js.Value) error {
	if e.Get("name").String() == "ResponseError" {
		errChan := make(chan error)
		catch := js.FuncOf(func(this js.Value, args []js.Value) any {
			errChan <- goError(args[0])
			return nil
		})
		textThen := js.FuncOf(func(this js.Value, args []js.Value) any {
			// TODO content-type negotiator a la client-go?
			status := metav1.Status{}
			// TODO perhaps use bytes
			err := json.Unmarshal([]byte(args[0].String()), &status)
			if err != nil {
				errChan <- err
				return nil
			}
			errChan <- kubeerrors.FromObject(&status)
			return nil
		})
		e.Get("response").Call("text").Call("then", textThen, catch)
		return <-errChan
	} else {
		return goError(e)
	}
}

// for helm.sh/helm/v3/pkg/engine.newLookupFunction
type jsClient struct {
	class                  js.Value
	group, version, plural js.Value
	namespace              string
}

func (c *jsClient) Namespace(ns string) dynamic.ResourceInterface {
	n := *c
	n.namespace = ns
	return &n
}

func (*jsClient) Create(ctx context.Context, obj *unstructured.Unstructured, options metav1.CreateOptions, subresources ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Update(ctx context.Context, obj *unstructured.Unstructured, options metav1.UpdateOptions, subresources ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) UpdateStatus(ctx context.Context, obj *unstructured.Unstructured, options metav1.UpdateOptions) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Delete(ctx context.Context, name string, options metav1.DeleteOptions, subresources ...string) error {
	panic("unimplemented")
}

func (*jsClient) DeleteCollection(ctx context.Context, options metav1.DeleteOptions, listOptions metav1.ListOptions) error {
	panic("unimplemented")
}

func (c *jsClient) Get(ctx context.Context, name string, options metav1.GetOptions, subresources ...string) (*unstructured.Unstructured, error) {
	if len(subresources) != 0 {
		panic("unimplemented")
	}
	args := js.ValueOf(map[string]interface{}{
		"group":     c.group,
		"version":   c.version,
		"plural":    c.plural,
		"namespace": js.ValueOf(c.namespace),
		"name":      js.ValueOf(name),
	})
	fn := "getNamespacedCustomObjectRaw"
	if c.namespace == "" {
		fn = "getClusterCustomObjectRaw"
	}

	resChan := make(chan *unstructured.Unstructured)
	errChan := make(chan error)
	catch := js.FuncOf(func(this js.Value, args []js.Value) any {
		go func() {
			// possible await
			errChan <- goErrorFromOpenAPICodegen(args[0])
		}()
		return nil
	})
	then := js.FuncOf(func(this js.Value, args []js.Value) any {
		textThen := js.FuncOf(func(this js.Value, args []js.Value) any {
			// TODO perhaps use bytes
			json := args[0].String()
			obj, err := runtime.Decode(unstructured.UnstructuredJSONScheme, []byte(json))
			if err != nil {
				errChan <- err
				return nil
			}
			resChan <- obj.(*unstructured.Unstructured)
			return nil
		})
		args[0].Get("raw").Call("text").Call("then", textThen, catch)
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

func (c *jsClient) List(ctx context.Context, opts metav1.ListOptions) (*unstructured.UnstructuredList, error) {
	args := js.ValueOf(map[string]interface{}{
		"group":     c.group,
		"version":   c.version,
		"plural":    c.plural,
		"namespace": js.ValueOf(c.namespace),
	})
	fn := "listNamespacedCustomObjectRaw"
	if c.namespace == "" {
		fn = "listClusterCustomObjectRaw"
	}

	resChan := make(chan *unstructured.UnstructuredList)
	errChan := make(chan error)
	catch := js.FuncOf(func(this js.Value, args []js.Value) any {
		go func() {
			// possible await
			errChan <- goErrorFromOpenAPICodegen(args[0])
		}()
		return nil
	})
	then := js.FuncOf(func(this js.Value, args []js.Value) any {
		textThen := js.FuncOf(func(this js.Value, args []js.Value) any {
			// TODO perhaps use bytes
			json := args[0].String()
			obj, err := runtime.Decode(unstructured.UnstructuredJSONScheme, []byte(json))
			if err != nil {
				errChan <- err
				return nil
			}
			resChan <- obj.(*unstructured.UnstructuredList)
			return nil
		})
		args[0].Get("raw").Call("text").Call("then", textThen, catch)
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

func (*jsClient) Watch(ctx context.Context, opts metav1.ListOptions) (watch.Interface, error) {
	panic("unimplemented")
}

func (*jsClient) Patch(ctx context.Context, name string, pt types.PatchType, data []byte, options metav1.PatchOptions, subresources ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) Apply(ctx context.Context, name string, obj *unstructured.Unstructured, options metav1.ApplyOptions, subresources ...string) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

func (*jsClient) ApplyStatus(ctx context.Context, name string, obj *unstructured.Unstructured, options metav1.ApplyOptions) (*unstructured.Unstructured, error) {
	panic("unimplemented")
}

type jsClientProvider struct {
	class  js.Value
	groups []discoveryv2.APIGroupDiscovery
}

func (p *jsClientProvider) GetClientFor(apiVersion, kind string) (dynamic.NamespaceableResourceInterface, bool, error) {
	parts := strings.Split(apiVersion, "/")
	if len(parts) > 2 {
		return nil, false, errors.New("invalid apiVersion")
	}
	var (
		group, version     string
		jsGroup, jsVersion js.Value
	)
	if len(parts) == 1 {
		group = ""
		version = parts[0]
		jsGroup = js.Undefined()
		jsVersion = js.ValueOf(version)
	} else {
		group = parts[0]
		version = parts[1]
		jsGroup = js.ValueOf(group)
		jsVersion = js.ValueOf(version)
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

	return &jsClient{
		class:   p.class,
		group:   jsGroup,
		version: jsVersion,
		plural:  js.ValueOf(plural),
	}, namespaced, nil
}

type DiscoveryData struct {
	chartutil.Capabilities
	Groups []discoveryv2.APIGroupDiscovery
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

	data := DiscoveryData{}
	must(json.Unmarshal([]byte(args[3].String()), &data))

	data.Capabilities.HelmVersion = chartutil.DefaultCapabilities.HelmVersion

	clientProvider := jsClientProvider{class: args[4], groups: data.Groups}

	v, err := chartutil.ToRenderValues(&c, values, opts, &data.Capabilities)
	must(err)
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

			res, err := engine.RenderWithClientProvider(&c, v, &clientProvider)
			must(err)

			b, err := json.Marshal(res)
			must(err)

			resolve.Invoke(string(b))
		}()
		return nil
	})

	return js.Global().Get("Promise").New(handler)
}

func main() {
	js.Global().Set("_helm_renderTemplate", js.FuncOf(renderTemplate))
	<-make(chan bool)
}
