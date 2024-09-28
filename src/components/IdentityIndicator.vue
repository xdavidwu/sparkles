<script setup lang="ts">
import HoverTooltip from '@/components/HoverTooltip.vue';
import { computed, ref, onMounted } from 'vue';
import { useApiConfig } from '@/stores/apiConfig';
import { errorIsKindUnsupported, doSelfSubjectReview } from '@/utils/api';

const username = ref('');
const groups = ref<Array<string>>([]);
const groupsText = computed(() => `Groups: ${groups.value.join(', ')}`);

onMounted(async () => {
  const config = await useApiConfig().getConfig();
  try {
    const review = await doSelfSubjectReview(config);
    username.value = review.status!.userInfo!.username!;
    groups.value = review.status!.userInfo!.groups!;
  } catch (err) {
    if (await errorIsKindUnsupported(err)) {
      console.log('No SelfSubjectReview support, cannot identify ourselves');
    } else {
      throw err;
    }
  }
});
</script>

<template>
  <span>
    {{ username }}
    <HoverTooltip :text="groupsText" activator="parent" />
  </span>
</template>
