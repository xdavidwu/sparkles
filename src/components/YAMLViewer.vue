<script lang="ts" setup>
import { computed } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { StreamLanguage } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { indentFold } from '@/utils/CodeMirror';
import { stringify } from 'yaml';

const props = defineProps({
  data: Object,
});

const extensions = [ oneDark, StreamLanguage.define(yaml), indentFold ];

const dataAsYAML = computed(() => stringify(props.data));
</script>

<template>
  <Codemirror v-model="dataAsYAML" :extensions="extensions" disabled />
</template>
