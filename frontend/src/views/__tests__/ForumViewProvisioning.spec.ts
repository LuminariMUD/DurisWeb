import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  authenticated: false,
  level: 1,
  canModerate: false,
  login: vi.fn(),
}))
const routerPush = vi.hoisted(() => vi.fn())
const invalidateQueries = vi.hoisted(() => vi.fn())

vi.mock('@/composables/useAuth', async () => {
  const { computed } = await vi.importActual<typeof import('vue')>('vue')
  return {
    useAuth: () => ({
      isAuthenticated: computed(() => authState.authenticated),
      login: authState.login,
      user: computed(() =>
        authState.authenticated
          ? {
              characters: [{ level: authState.level }],
              permissions: { canModerate: authState.canModerate },
            }
          : null,
      ),
    }),
  }
})
vi.mock('@/composables/useCategories', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  return {
    useCategories: () => ({
      data: ref([]),
      isLoading: ref(false),
      error: ref(null),
    }),
  }
})
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/services/api', () => ({
  adminApi: {},
  forumApi: {},
}))
vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ invalidateQueries, setQueryData: vi.fn() }),
}))
vi.mock('@unhead/vue', () => ({ useHead: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))
vi.mock('sortablejs', () => ({
  default: class {
    destroy() {}
  },
}))

import ForumView from '../ForumView.vue'

const SlotStub = defineComponent({ template: '<div><slot /></div>' })
const ButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
})

/** Mount the forum with slot-preserving primitives so its empty states are observable. */
function mountForum(): VueWrapper {
  return shallowMount(ForumView, {
    global: {
      stubs: {
        Alert: SlotStub,
        AlertDescription: SlotStub,
        Badge: SlotStub,
        Button: ButtonStub,
        Card: SlotStub,
        CardContent: SlotStub,
        CardDescription: SlotStub,
        CardHeader: SlotStub,
        CardTitle: SlotStub,
        Input: SlotStub,
        Label: SlotStub,
        Select: SlotStub,
        SelectContent: SlotStub,
        SelectItem: SlotStub,
        SelectTrigger: SlotStub,
        SelectValue: SlotStub,
        Switch: SlotStub,
        Textarea: SlotStub,
      },
    },
  })
}

describe('forum empty-state provisioning contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.authenticated = false
    authState.level = 1
    authState.canModerate = false
  })

  it('offers an authorized level 57 administrator a working first-category action', async () => {
    authState.authenticated = true
    authState.level = 57
    authState.canModerate = true
    const wrapper = mountForum()

    const setupAction = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Set up the first category'))
    expect(setupAction).toBeDefined()
    expect(wrapper.text()).not.toContain('temporarily unavailable')

    await setupAction?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('New Category')
    expect(wrapper.text()).not.toContain('Set up the first category')
    wrapper.unmount()
  })

  it('shows normal users an unavailable state without a setup action', () => {
    authState.authenticated = true
    authState.level = 56
    const wrapper = mountForum()

    expect(wrapper.text()).toContain(
      'The forum is temporarily unavailable while an administrator completes setup.',
    )
    expect(wrapper.text()).not.toContain('Set up the first category')
    expect(wrapper.text()).not.toContain('New Category')
    wrapper.unmount()
  })

  it('does not grant category management from character level alone', () => {
    authState.authenticated = true
    authState.level = 62
    authState.canModerate = false
    const wrapper = mountForum()

    expect(wrapper.text()).toContain('temporarily unavailable')
    expect(wrapper.text()).not.toContain('Set up the first category')
    wrapper.unmount()
  })
})
