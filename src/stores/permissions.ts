import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { AuthorizationV1Api, type V1SubjectRulesReviewStatus } from '@/kubernetes-api/src';

export enum PermissionStatus {
  Allowed = "allowed",
  Denied = "denied",
  Unknown = "unknown",
}

export const usePermissions = defineStore('permission', () => {
  const reviews = ref<Map<string, Promise<V1SubjectRulesReviewStatus>>>(new Map());

  const getReview = async (namespace: string) => {
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
  const ensureReview = (namespace: string) => {
    if (!reviews.value.has(namespace)) {
      const p = getReview(namespace);
      reviews.value.set(namespace, p);
    }
    return reviews.value.get(namespace)!;
  };

  const check = async (namespace: string, group: string, resource: string,
      name: string, verb: string) => {
    const review = await ensureReview(namespace);

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

    // TODO fallback to selfsubjectaccessreview
    console.log('incomplete rules');
    return PermissionStatus.Unknown;
  };

  const mayAllows = async (namespace: string, group: string, resource: string,
      name: string, verb: string) => {
    const res = await check(namespace, group, resource, name, verb);
    return res === PermissionStatus.Allowed || res === PermissionStatus.Unknown;
  }

  return {
    check,
    mayAllows,
  };
});
