<script setup lang="ts">
import { useHead } from '@unhead/vue'
import TheWelcome from '../components/TheWelcome.vue'

useHead({
  title: 'DurisMUD | Home'
})
</script>

<template>
  <main>
    <TheWelcome />
  </main>
</template>
