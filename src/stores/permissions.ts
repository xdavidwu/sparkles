import { defineStore } from 'pinia';
import { useApiConfig } from '@/stores/apiConfig';
import { AuthorizationV1Api, type V1SubjectRulesReviewStatus } from '@xdavidwu/kubernetes-client-typescript-fetch';

export enum PermissionStatus {
  Allowed = "allowed",
  Denied = "denied",
  Unknown = "unknown",
}

export const usePermissions = defineStore('permission', () => {
  const reviews: Map<string, V1SubjectRulesReviewStatus> = new Map();

  const _doReview = async (namespace: string) => {
    const config = await useApiConfig().getConfig();
    const api = new AuthorizationV1Api(config);

    const res = await api.createSelfSubjectRulesReview({
      body: { spec: { namespace } },
    });
    if (res.status!.evaluationError) {
      console.log(`SelfSubjectRulesReview evaluation error at namespace ${namespace}: ${res.status!.evaluationError}`);
    }
    return res.status!;
  };

  // checks are likely fired in parallel, make them wait on same result
  const loadReview = async (namespace: string) => {
    if (!reviews.has(namespace)) {
      reviews.set(namespace, await _doReview(namespace));
    }
    return reviews.get(namespace)!;
  };

  const check = (namespace: string, group: string, resource: string,
      name: string, verb: string) => {
    const review = reviews.get(namespace);
    if (!review) {
      throw new Error('permission check before loading review');
    }

    const ruleMatch = review.resourceRules.some((rule) => {
      const wildcardMatch = (v: string, t: string) => v === '*' || v === t;
      if (!rule.verbs.some((v) => wildcardMatch(v, verb))) {
        return false;
      }

      if (rule.apiGroups?.length && !rule.apiGroups.some((g) => wildcardMatch(g, group))) {
        return false;
      }

      if (rule.resources?.length && !rule.resources.some((r) => {
            if (wildcardMatch(r, resource)) {
              return true;
            }

            // "/foo" represents the subresource 'foo' for all resources in the specified apiGroups.
            const slash = resource.indexOf('/');
            if (slash !== -1 && r === resource.slice(slash)) {
              return true;
            }
            return false;
          })) {
        return false;
      }

      if (rule.resourceNames?.length && !rule.resourceNames.some((n) => wildcardMatch(n, name))) {
        return false;
      }
      return true;
    });

    if (ruleMatch) {
      return PermissionStatus.Allowed;
    }
    if (!review.incomplete) {
      return PermissionStatus.Denied;
    }

    return PermissionStatus.Unknown;
  };

  const fullCheck = async (namespace: string, group: string, resource: string,
      name: string, verb: string) => {
    const fast = check(namespace, group, resource, name, verb);
    if (fast != PermissionStatus.Unknown) {
      return fast;
    }

    const parts = resource.split('/');
    const resourceParam = parts.length === 1 ? { resource } :
      { resource: parts[0], subresource: parts[1] };
    const config = await useApiConfig().getConfig();
    const response = await (new AuthorizationV1Api(config)).createSelfSubjectAccessReview({
      body: {
        spec: {
          resourceAttributes: {
            namespace,
            name,
            verb,
            group,
            version: '*', // XXX: should we support versioning?
            ...resourceParam,
          },
        },
      },
    });
    if (response.status!.evaluationError) {
      console.log(`SelfSubjectAccessReview evaluation error: ${response.status!.evaluationError}`);
    }
    return response.status!.allowed ? PermissionStatus.Allowed :
        (response.status!.denied ? PermissionStatus.Denied : PermissionStatus.Unknown);
  };

  const mayAllows = (namespace: string, group: string, resource: string,
      name: string, verb: string, costy: boolean = false) => {
    const res = check(namespace, group, resource, name, verb);
    return res === PermissionStatus.Allowed || res === PermissionStatus.Unknown;
  }

  return {
    loadReview,
    check,
    fullCheck,
    mayAllows,
  };
});
