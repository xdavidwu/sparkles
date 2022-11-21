<template>
  <pre>{{ yaml }}</pre>
</template>

<script lang="ts">
import { stringify } from 'yaml';

export default {
  props: {
    data: Object,
  },
  computed: {
    yaml() {
      return stringify(this.data);
    },
  },
};
</script>
