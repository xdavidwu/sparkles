import { shallowRef, computed, type Ref } from 'vue';

export const nonNullableRef = <T>(d: T): Ref<T> => {
  const v = shallowRef(d);
  return computed({
    get: () => v.value,
    set: (n) => {
      if (n !== null) {
        v.value = n;
      }
    },
  });
};
