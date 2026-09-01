import { VueRenderer } from '@tiptap/vue-3'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import MentionList from './MentionList.vue'
import { builderApi } from '@/services/api'

export interface MentionItem {
  id: string
  label: string
}

// Create the mention extension with suggestion configuration
export const BuilderMention = Mention.configure({
  HTMLAttributes: {
    class: 'mention-highlight',
  },
  suggestion: {
    items: async ({ query }): Promise<MentionItem[]> => {
      if (query.length < 1) {
        return []
      }

      try {
        const accounts = await builderApi.searchAccounts(query, 10)
        return accounts.map((name) => ({
          id: name,
          label: name,
        }))
      } catch (error) {
        console.error('Failed to search accounts:', error)
        return []
      }
    },

    render: () => {
      let component: VueRenderer | null = null
      let popup: TippyInstance | null = null

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          component = new VueRenderer(MentionList, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) {
            return
          }

          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect as () => DOMRect,
            appendTo: () => document.body,
            content: component.element as Element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          })
        },

        onUpdate(props: SuggestionProps<MentionItem>) {
          component?.updateProps(props)

          if (!props.clientRect) {
            return
          }

          popup?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          })
        },

        onKeyDown(props: SuggestionKeyDownProps) {
          if (props.event.key === 'Escape') {
            popup?.hide()
            return true
          }

          return (component?.ref as any)?.onKeyDown?.(props) ?? false
        },

        onExit() {
          if (popup) {
            popup.destroy()
            popup = null
          }
          if (component) {
            component.destroy()
            component = null
          }
        },
      }
    },
  },
})

export default BuilderMention
