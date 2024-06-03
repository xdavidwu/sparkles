package main

import (
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

func main() {
	js.Global().Set("configConnection", js.FuncOf(configConnection))
	<-make(chan bool)
}
