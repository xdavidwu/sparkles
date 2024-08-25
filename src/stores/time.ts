import { defineStore } from 'pinia';
import { useNow } from '@vueuse/core';

export const useTime = defineStore('time', () => ({
  now: useNow({ interval: 1000 }),
}));
