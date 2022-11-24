<script lang="ts" setup>
import { Codemirror } from 'vue-codemirror';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { StreamLanguage } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';

const extensions = [ oneDark, StreamLanguage.define(yaml) ];
</script>

<template>
  <Codemirror v-model="dataAsYAML" :extensions="extensions" disabled />
</template>

<script lang="ts">
import { stringify } from 'yaml';

export default {
  props: {
    data: Object,
  },
  computed: {
    dataAsYAML() {
      return stringify(this.data);
    },
  },
};
</script>
