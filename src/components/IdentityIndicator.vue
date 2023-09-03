<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { AuthenticationV1Api, AuthenticationV1beta1Api } from '@/kubernetes-api/src';
import { errorIsTypeUnsupported } from '@/utils/api';

const username = ref('');
const groups = ref<Array<string>>([]);
const groupsText = computed(() => `Groups: ${groups.value.join(', ')}`);

onMounted(async () => {
  const config = await useApiConfig().getConfig();
  const v1Api = new AuthenticationV1Api(config);
  try {
    const v1Review = await v1Api.createSelfSubjectReview({ body: {} });
    username.value = v1Review.status!.userInfo!.username!;
    groups.value = v1Review.status!.userInfo!.groups!;
  } catch (err) {
    if (await errorIsTypeUnsupported(err)) {
      const v1beta1Api = new AuthenticationV1beta1Api(config);
      try {
        const v1beta1Review = await v1beta1Api.createSelfSubjectReview({ body: {} });
        username.value = v1beta1Review.status!.userInfo!.username!;
        groups.value = v1beta1Review.status!.userInfo!.groups!;
      } catch (err) {
        if (await errorIsTypeUnsupported(err)) {
          console.log('No SelfSubjectReview support, cannot identify ourselves');
        } else {
          throw err;
        }
      }
    } else {
      throw err;
    }
  }
});
</script>

<template>
  <span :title="groupsText">{{ username }}</span>
</template>
