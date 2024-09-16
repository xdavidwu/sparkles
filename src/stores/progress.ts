import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useProgress = defineStore('progress', () => ({
  active: ref(false),
  title: ref(''),
  text: ref(''),
}));
