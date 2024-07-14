<script setup lang="ts">
import { VBtn } from 'vuetify/components';
</script>

<template>
  <div class="d-flex justify-center align-center flex-column h-100">
    <div class="text-body-1">
      <h3 class="text-h3 mb-2">404 Not Found</h3>
      Make sure the address is correct.<br>
      <VBtn class="mt-4" color="primary" variant="outlined" :to="{ name: 'home' }">Home</VBtn>
    </div>
  </div>
</template>
