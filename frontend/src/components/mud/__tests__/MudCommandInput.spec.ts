import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import MudCommandInput from '../MudCommandInput.vue'
import { useMudStore } from '../../../stores/mudStore.js'
import { useAliases } from '../../../composables/useAliases.js'

const { sendGameCommand } = vi.hoisted(() => ({
  sendGameCommand: vi.fn<(command: string) => boolean>(() => true),
}))

vi.mock('@/composables/useMudConnection', () => ({
  useMudConnection: () => ({ sendGameCommand }),
}))
vi.mock('@/composables/useGroups', () => ({
  useGroups: () => ({ isGroupEffectivelyEnabled: () => true }),
}))

// Keep the real alias account watcher alive across component mounts.
setActivePinia(createPinia())
const store = useMudStore()
const aliases = useAliases()
let wrapper: VueWrapper

beforeEach(async () => {
  vi.clearAllMocks()
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  store.reset()
  await nextTick()
  store.setAccount('PagerFixture', [])
  await nextTick()
  wrapper = mount(MudCommandInput, { attachTo: document.body })
  await nextTick()
})

afterEach(() => {
  wrapper.unmount()
  vi.unstubAllGlobals()
})

function sentCommands() {
  return sendGameCommand.mock.calls.map(([command]) => command)
}

describe('game command input and pager continuation', () => {
  it.each(['', '   '])('sends one blank Enter for %j without echo or history', async (value) => {
    const input = wrapper.get('input')
    await input.setValue(value)
    await input.trigger('keydown', { key: 'Enter' })

    expect(sentCommands()).toEqual([''])
    expect(store.activityLog).toHaveLength(0)
    expect(input.element.value).toBe('')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(input.element.value).toBe('')
  })

  it.each(['', '   '])('sends one blank Send click for %j and restores focus', async (value) => {
    const input = wrapper.get('input')
    await input.setValue(value)
    await wrapper.get('button').trigger('click')

    expect(sentCommands()).toEqual([''])
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('')
  })

  it('clears a selected help command so successive Enter presses send only continuations', async () => {
    const input = wrapper.get('input')
    await input.setValue('help combat')
    input.element.select()
    await input.trigger('keydown', { key: 'Enter' })

    expect(input.element.value).toBe('')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual(['help combat', '', ''])
  })

  it('sends a continuation after Escape clears an edited command', async () => {
    const input = wrapper.get('input')
    await input.setValue('look')
    await input.trigger('keydown', { key: 'Escape' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual([''])
  })

  it('repeats commands explicitly with Up then Enter and excludes blanks and duplicate history', async () => {
    const input = wrapper.get('input')
    for (const command of ['look', 'score']) {
      await input.setValue(command)
      await input.trigger('keydown', { key: 'Enter' })
    }
    await input.trigger('keydown', { key: 'Enter' })
    await wrapper.get('button').trigger('click')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(input.element.value).toBe('score')
    await input.trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual(['look', 'score', '', '', 'score'])
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(input.element.value).toBe('score')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(input.element.value).toBe('look')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.element.value).toBe('score')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(input.element.value).toBe('')
  })

  it('sends page numbers and q/r/b once each, clearing the input after each action', async () => {
    const input = wrapper.get('input')
    for (const command of ['2', 'r', 'b', 'q']) {
      await input.setValue(command)
      await input.trigger('keydown', { key: 'Enter' })
      expect(input.element.value).toBe('')
    }
    expect(sentCommands()).toEqual(['2', 'r', 'b', 'q'])
  })

  it('expands real aliases and command chains without turning empty segments into continuations', async () => {
    expect(
      aliases.addAlias({
        trigger: 'prep',
        expansion: '; look; ; scan; ',
        enabled: true,
        scope: 'global',
        characterName: null,
        groupId: null,
      }),
    ).not.toBeNull()
    const input = wrapper.get('input')
    await input.setValue('; prep; ; score;')
    await input.trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual(['look', 'scan', 'score'])
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(input.element.value).toBe('; prep; ; score;')
    await input.trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual(['look', 'scan', 'score', 'look', 'scan', 'score'])
  })

  it('does not treat a separator-only command as a blank continuation', async () => {
    await wrapper.get('input').setValue(' ; ; ')
    await wrapper.get('input').trigger('keydown', { key: 'Enter' })
    expect(sentCommands()).toEqual([])
  })

  it('ignores held Enter and IME confirmation without sending or clearing the command', async () => {
    const input = wrapper.get('input')
    await input.setValue('help combat')
    await input.trigger('keydown', { key: 'Enter', repeat: true })
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(sentCommands()).toEqual([])
    expect(input.element.value).toBe('help combat')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('keydown', { key: 'Enter', repeat: true })
    expect(sentCommands()).toEqual(['help combat'])
  })
})
