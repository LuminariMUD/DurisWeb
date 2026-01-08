<script lang="ts" setup>
import { Toaster as SonnerToaster } from 'vue-sonner'

defineOptions({
  name: 'SonnerToast'
})
</script>

<template>
  <SonnerToaster
    position="top-right"
    theme="dark"
    :rich-colors="true"
    :close-button="true"
  />
</template>
