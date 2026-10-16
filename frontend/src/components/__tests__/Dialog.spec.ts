import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import BattleDialog from '@/components/ui/Dialog.vue'

let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

describe('battle dialogs', () => {
  it('announces its title, closes with Escape, and restores focus to its opener', async () => {
    wrapper = mount(
      defineComponent({
        components: { BattleDialog },
        setup: () => ({ open: ref(false) }),
        template:
          '<button @click="open = true">Equipment</button><BattleDialog v-model:open="open" title="Equipment"><p>Fixture sword</p></BattleDialog>',
      }),
      { attachTo: document.body },
    )
    const opener = wrapper.get('button')
    ;(opener.element as HTMLButtonElement).focus()
    await opener.trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('Fixture sword')
    expect(document.getElementById(dialog!.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Equipment',
    )
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener.element)
  })
})
