<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { AuthenticationV1Api } from '@/kubernetes-api/src';

const username = ref('');
const groups = ref<Array<string>>([]);
const groupsText = computed(() => `Groups: ${groups.value.join(', ')}`);

onMounted(async () => {
  const config = await useApiConfig().getConfig();
  const v1Api = new AuthenticationV1Api(config);
  const v1Review = await v1Api.createSelfSubjectReview({ body: {} });
  username.value = v1Review.status!.userInfo!.username!;
  groups.value = v1Review.status!.userInfo!.groups!;
});
</script>

<template>
  <span :title="groupsText">{{ username }}</span>
</template>
