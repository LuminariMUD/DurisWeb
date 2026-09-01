<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useMudConnection } from '@/composables/useMudConnection'
import { useAliases } from '@/composables/useAliases'
import { useMudStore } from '@/stores/mudStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send } from 'lucide-vue-next'

const { sendGameCommand } = useMudConnection()
const { expandCommand, echoExpansion, echoCommands } = useAliases()
const store = useMudStore()

const command = ref('')
const inputRef = ref<InstanceType<typeof Input> | null>(null)
const commandHistory = ref<string[]>([])
const historyIndex = ref(-1)
const maxHistory = 100

const sendCommand = () => {
  const cmd = command.value.trim()

  // Split by semicolons first (supports "drink fountain;look;scan")
  const inputParts = cmd
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // Process each part through alias expansion
  for (const part of inputParts) {
    const result = expandCommand(part)

    // Echo expansion to activity log if enabled and alias was matched
    if (result.matched && echoExpansion.value) {
      const echoText = `&+L[Alias: ${part} -> ${result.commands.join('; ')}]&n`
      store.addLogEntry('system', echoText)
    }

    // Send each command (may be multiple for chained aliases like "prep" -> "cast a;cast b")
    for (const expandedCmd of result.commands) {
      // Echo command to activity log if enabled
      if (echoCommands.value) {
        store.addLogEntry('system', `&+L> ${expandedCmd}&n`)
      }
      sendGameCommand(expandedCmd)
    }
  }

  // Add ORIGINAL command to history (not expanded) - avoid duplicates and empty commands
  if (cmd && commandHistory.value[commandHistory.value.length - 1] !== cmd) {
    commandHistory.value.push(cmd)
    if (commandHistory.value.length > maxHistory) {
      commandHistory.value.shift()
    }
  }

  // Select all text for easy re-send (Mudlet-style spam support)
  historyIndex.value = -1
  nextTick(() => {
    const inputEl = (inputRef.value?.$el?.querySelector('input') ||
      inputRef.value?.$el) as HTMLInputElement | null
    if (inputEl) {
      inputEl.focus()
      inputEl.select()
    }
  })
}

const handleKeyDown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'Enter':
      sendCommand()
      break

    case 'ArrowUp':
      event.preventDefault()
      navigateHistory(1)
      break

    case 'ArrowDown':
      event.preventDefault()
      navigateHistory(-1)
      break

    case 'Escape':
      command.value = ''
      historyIndex.value = -1
      break
  }
}

const navigateHistory = (direction: number) => {
  if (commandHistory.value.length === 0) return

  const newIndex = historyIndex.value + direction

  if (newIndex < 0) {
    // Going forward past the end - clear input
    historyIndex.value = -1
    command.value = ''
  } else if (newIndex < commandHistory.value.length) {
    // Navigate within history
    historyIndex.value = newIndex
    const historyEntry = commandHistory.value[commandHistory.value.length - 1 - newIndex]
    command.value = historyEntry ?? ''
  }
  // Don't go past the beginning of history
}

// Focus input when pressing any key (if not already focused on an input)
const handleGlobalKeyDown = (event: KeyboardEvent) => {
  // Ignore if user is typing in another input
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return
  }

  // Ignore modifier keys and function keys
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return
  }

  // Ignore navigation and special keys
  const ignoreKeys = [
    'Tab',
    'Escape',
    'CapsLock',
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight', // Movement keys handled by keypad bindings
    'PageUp',
    'PageDown',
    'Home',
    'End', // Scroll keys handled by keypad bindings
  ]
  if (ignoreKeys.includes(event.key) || event.key.startsWith('F')) {
    return
  }

  // Ignore numpad keys (handled by keypad bindings)
  if (event.code.startsWith('Numpad')) {
    return
  }

  // Focus the input and let the key be typed
  focusInput()
}

const focusInput = () => {
  const inputEl = inputRef.value?.$el?.querySelector('input') || inputRef.value?.$el
  if (inputEl?.focus) {
    inputEl.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown)
  // Auto-focus on mount
  nextTick(() => {
    focusInput()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown)
})

// Expose focus method for parent components
defineExpose({
  focus: focusInput,
})
</script>

<template>
  <div class="flex items-center gap-2 p-2 border-t bg-background">
    <Input
      ref="inputRef"
      v-model="command"
      type="text"
      placeholder="Enter command..."
      class="flex-1 font-mono"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      @keydown="handleKeyDown"
    />
    <Button size="icon" @click="sendCommand">
      <Send class="h-4 w-4" />
    </Button>
  </div>
</template>
