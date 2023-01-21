package main

import (
	"encoding/json"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage/driver"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/kubernetes"
	"syscall/js"
)

// TODO read from js
var config = rest.Config {
	Host: "http://localhost:8000",
}

var client *kubernetes.Clientset

func jsError(e any) any {
	return js.Global().Get("Error").New(e)
}

func listReleasesForNamespaceAsPromise(this js.Value, args []js.Value) any {
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
	client = kubernetes.NewForConfigOrDie(&config)
	js.Global().Set("listReleasesForNamespace",
		js.FuncOf(listReleasesForNamespaceAsPromise))
	<-make(chan bool)
}
