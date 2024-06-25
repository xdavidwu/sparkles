# Sparkles

[WIP] Web Interface for Kubernetes

Client-side only, with WebAssembly for Helm support

## Requirements

- NodeJS
- Go 1.21
- Kubernetes cluster
  - With feature gates and extension APIs in [KUBERNETES\_FEATURES.md](KUBERNETES_FEATURES.md)

## Deployment strategy

For the application to be able to talk with Kubernetes API, we need to deal with API authentication and CORS.

For authentication, possible ways are:

- OpenID Connect (OIDC)
- Static token
- None (handled elsewhere via a proxy)
- mTLS pre-configured on browser

To extract TLS client certificate from kubeconfig, `.users[].user.client-certificate-data` and `.users[].user.client-certificate-data` are base64-encoded PEM of certificate and key. Base64-decode them and `openssl pkcs12 -export -in cert.pem -inkey key.pem -export -out cert.p12` to export as PKCS#12 format.

There are a few tools that may aid in authentication or CORS:

### `kubectl proxy`

Handles authentication via a proxy.

Although it is possible to serve static file with it, for an SPA architecture, we need to serve the entrypoint on every routes or as a fallback page, which is not implemented by its built-in static file server. An additional web server is still needed.

Note that `kubectl proxy` rejects endpoints like exec and attach by default, `--reject-paths=` can be used to reset the reject pattern list.

### Vite proxy

When using Vite, its built-in proxy can be used to eliminate need of CORS.

In combination with `kubectl proxy`, this creates a local development setup that should work on most cases.

Our Vite config is pre-configured for default port of `kubectl proxy`, to start development:

```sh
cp .env.development .env
kubectl proxy --reject-paths=
npm run dev
```

### kube-apiserver proxy

Kubernetes API includes built-in proxy to nodes, pods or services, under a path like `/api/v1/namespaces/<namespace>/pods/<pod>:<port>/proxy/`. Accessing web server via this proxy eliminates the need of CORS, but requires more permission.

Accessing the proxy already requires Kubernetes API access, additional authentication handling at application is not needed.

The `Containerfile` provided by default builds a container image suitable for being accessed behind kube-apiserver proxy. Combined with `kubectl proxy`, this creates a setup that only requires working kubectl at client side, making it easy to try the application out.

```sh
kubectl create deployment --image ghcr.io/xdavidwu/sparkles sparkles
# not required, but using a service make proxy endpoint path stable
kubectl create service clusterip sparkles --tcp=8000:8000
kubectl proxy --reject-paths=
# access http://127.0.0.1:8001/api/v1/namespaces/default/services/sparkles:8000/proxy/
```

## Common setup combinations

- Vite HMR server + vite proxy + `kubectl proxy`
  - Typical development setup, see above
- Production bundle + kube-apiserver proxy + `kubectl proxy`
  - Easy to share with existing cluster users
- Production bundle + kube-apiserver proxy + mTLS
  - Like above but without client side tooling
- Production bundle + OIDC
  - No configuration or tooling needed at client side

## Helm support

Helm is re-implemented in TypeScript, except templating, which is ported to WebAssembly.

For Helm repositories, due to cross-origin limitations, currently only a repository hosting under `/charts/` is supported.

`utils/helm-repo-mirror.sh` helps to mirror a HTTP-based Helm repository.

```sh
# ./utils/helm-repo-mirror.sh REPO_URL DESTINATION HOSTED_AT
./utils/helm-repo-mirror.sh https://charts.bitnami.com/bitnami ./public/charts/ http://localhost:5173/charts/
```
