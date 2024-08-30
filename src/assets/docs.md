## Sparkles

[Sparkles](https://github.com/xdavidwu/sparkles) is a web-based Kubernetes client, runs completely on client-side without an additional backend besides Kubernetes itself.

### Notes and limitations of specific page

#### Pods

The `Phase` field of the pods is `status.phase` from the [API](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.31/#podstatus-v1-core) and is different from `STATUS` of `kubectl get pods`. `Running` may not mean the same as what you expect.

#### Helm

Parses Helm release histories stored in Secrets. ConfigMap-backed releases are currently not supported.

Supports installing, upgrading, rolling-back and unintalling Helm releases. Installing and upgrading requires manual set-up of a Helm repository by instance admin, see the project README for more information.

#### Tokens

Manages Kubernetes ServiceAccount tokens with expiration and note support. It creates a ServiceAccount with edit permission of current namespace, and manages tokens derived from it. Each token is bound to a Secret to support revocation, and store note for the token. The Secret does not store the actual token. Once it is deleted, the bounded token is revoked.

Edit permission is chosen instead of admin, specifically making it unable to manage Roles and RoleBindings. This is to ensure that the token cannot be used to set up other authorization means, so that revocation and expiration are more likely to work as desired.

#### kubectl

`kubectl` shells, runs a Pod per session to provide a shell with `kubectl` as admin of current namespace. Since it creates workload on the cluster, restriction like quota may applies.

#### Resource Explorer

Support operations on typical Kubernetes resources. Subresources are currently not supported.

The table view is formatted by Kubernetes API. We detect a few field types and try to improve it futher.

For image fields, we try provide links to web page about the image (see [Container image link generation](#container-image-link-generation)).

For duration fields (e.g. `Age`), if we are able to obtain its timestamp (e.g. `metadata.creationTimestamp`) efficiently without requesting the whole object from Kubernetes, we provide the precise timestamp along with updated duration to current time. Duration field which timestamp cannot be efficiently obtained (or simply is not detected as such) currently shows raw duration from API relative to when the residing row is updated, which may be imprecise regarding to current time.

### Notes and limitations of specific feature

### Container image link generation

Image registries serve web pages about images in different path formats. This is currently detected case-by-case, and fallbacks to raw manifest URLs of OCI distribution spec.
