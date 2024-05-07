# Used Kubernetes Features

Notes:

- [KEP 3136](https://github.com/kubernetes/enhancements/issues/3136) Since 1.24, beta APIs are disabled by default

## Required

- User should always have permission as in `system:discovery` ClusterRoleBinding (default behavior of Kubernetes)
- [KEP 3352](https://github.com/kubernetes/enhancements/issues/3352) Aggregated Discovery
  - Alpha (v2beta1): 1.26
  - Beta (v2beta1): 1.27
  - GA (v2): 1.30

## Optional

- metrics.k8s.io v1beta1
- [KEP 2896](https://github.com/kubernetes/enhancements/issues/2896) OpenAPI v3
  - Alpha: 1.23
  - Beta: 1.24
  - GA: 1.27
- [KEP 3325](https://github.com/kubernetes/enhancements/issues/3325) authentication.k8s.io SelfSubjectReview
  - GA (v1): 1.28
  - Beta (v1beta1): 1.27
- [KEP 4006](https://github.com/kubernetes/enhancements/issues/4006) v5.channel.k8s.io streaming protocol (TranslateStreamCloseWebsocketRequests)
  - Alpha: 1.29
  - Beta: 1.30 (enabled by default)
