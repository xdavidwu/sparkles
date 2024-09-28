<script setup lang="ts">
import { ref } from 'vue';
import { VTextField, VSwitch } from 'vuetify/components';
import type { JSONSchema4 } from 'json-schema';

const props = defineProps<{
  schema: JSONSchema4;
  modelValue: any;
}>();

const emit = defineEmits<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (e: 'update:modelValue', v: any): void;
}>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const model = ref<any>(props.modelValue ?? {});

const set = (key: string | number, value: unknown) => {
  console.log('set', key, value);
  if (typeof model.value == 'undefined') {
    model.value = {};
  }
  if (typeof value === 'undefined' ||
      value === '' ||
      (typeof value === 'object' && !Object.keys(value as object).length)) {
    delete model.value[key];
  } else {
    model.value[key] = value;
  }
  emit('update:modelValue', model.value);
};

console.log(props.schema);
</script>

<template>
  <div>
    <pre class="text-caption">{{ JSON.stringify(model, undefined, 2) }}</pre>
    <template v-for="p, k in schema.properties" :key="k">
      <div v-if="p.type == 'object'">
        <div class="text-subtitle-1">{{ p.title ?? `${k}` }}</div>
        <SchemaForm class="ms-2 ps-4 my-4 border-left" :schema="p"
          :model-value="model[k]" @update:modelValue="(v) => set(k, v)" />
      </div>
      <VTextField v-if="p.type == 'string'" :model-value="model[k]"
        :label="p.title ?? `${k}`" :placeholder="p.description"
        :persistent-placeholder="!!p.description"
        @update:modelValue="(v) => set(k, v)" />
      <VTextField v-if="p.type == 'integer'" type="number"
        :model-value="model[k]"
        :label="p.title ?? `${k}`" :placeholder="p.description"
        :persistent-placeholder="!!p.description"
        @update:modelValue="(v) => set(k, v)"/>
      <!-- TODO unfilled -->
      <VSwitch v-if="p.type == 'boolean'" :label="p.title ?? `${k}`"
        :model-value="!!model[k]"
        hide-details
        @update:modelValue="(v) => set(k, v)" />
    </template>
  </div>
</template>

<style scoped>
.border-left {
  border-left: solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
}
</style>
