# Sparkles

[WIP] Web Interface for Kubernetes

Client-side only, with WebAssembly for Helm support

## Requirements

- NodeJS
- Go 1.21
- Kubernetes cluster
  - Kubernetes features and API versions in [KUBERNETES\_FEATURES.md](KUBERNETES_FEATURES.md)

## Development/ Local setup

```sh
echo VITE_KUBERNETES_API=http://localhost:8000/ > .env
# rejects endpoints like exec by default, reset it
kubectl proxy --reject-paths=
npm run dev
```

## Production setup

TODO may works but lacks documentation

Ideas for Kubernetes API authentication:

- OIDC
  - Friendly with reverse proxies
- Tokens
- TLS client certificates pre-configured in browsers
  - Untested
