<!-- With a actually rendered tag for scoped attr -->
<template>
  <div>
    <slot />
  </div>
</template>

<style scoped>
:deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6), :deep(p), :deep(table) {
  margin-top: 0.4lh;
  margin-bottom: 0.2lh;
}

:deep(li) {
  margin-left: 16px;
  margin-top: 2px;
}

:deep(code) {
  padding: 0 2px;
  background: black;
}

:deep(pre > code) {
  padding: 4px;
  display: block;
  background: #282c34;
  color: #abb2bf;
}

:deep(table) {
  border-collapse: collapse;
}

:deep(th), :deep(td) {
  border: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 4px 8px;
}
</style>
