import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { BattleDetail, PvPParticipant } from '@/types'
import Select from '@/components/ui/Select.vue'
import { extractPlayerName } from '@/utils/pvpParticipant'

const data = ref<BattleDetail>()
const route = { params: { id: '1' }, query: {} as Record<string, string>, hash: '' }
const replace = vi.fn()
const accounts = vi.fn(async (names: string[]) =>
  Object.fromEntries(names.map((name) => [name, 'fixture-account'])),
)
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace, push: vi.fn() }),
}))
vi.mock('@/composables/usePvPEvents', () => ({
  useBattleDetail: () => ({ data, isLoading: ref(false), isError: ref(false), error: ref(null) }),
}))
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/composables/useAuth', () => ({ useAuth: () => ({ permissions: ref(null) }) }))
vi.mock('@/services/api', () => ({
  profileApi: { getCharacterAccountsBatch: (names: string[]) => accounts(names) },
  pvpApi: {
    getBattleStats: async () => ({
      likeCount: 0,
      commentCount: 0,
      userLiked: false,
      userFavorited: false,
    }),
  },
  adminApi: {},
}))
import BattleDetailView from '../BattleDetailView.vue'

function participant(
  id: number,
  description: string,
  overrides: Partial<PvPParticipant> = {},
): PvPParticipant {
  return {
    id,
    pid: id,
    event_id: 1,
    level: 56,
    pk_type: 'KILLER',
    player_description: description,
    log: '',
    equip: '',
    inroom: true,
    leader: false,
    ...overrides,
  }
}

let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(BattleDetailView, {
    global: {
      stubs: {
        BattleCommentSection: true,
        BattleLikeButton: true,
        BattleFavoriteButton: true,
        Dialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
      },
    },
  })
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  route.query = {}
  data.value = {
    event: {
      id: 1,
      stamp: '2020-01-01 00:00:00',
      room_name: 'Fixture room',
      room_vnum: 1,
      tweeted: false,
    },
    participants: [
      participant(1, 'Fixture', { equip: null }),
      participant(2, 'Other', { pk_type: 'VICTIM', equip: '<held> a shield' }),
    ],
  }
})
afterEach(() => wrapper?.unmount())

describe('battle participants with incomplete historical snapshots', () => {
  it.each([
    ['Fixture', 'Fixture'],
    ['&+RFixture&n', 'Fixture'],
    ['[ 5 &+RWarrior&n] Fixture (Human)', 'Fixture'],
    ['', null],
  ])('accepts both participant description formats: %s', (description, name) => {
    expect(extractPlayerName(description)).toBe(name)
  })

  it('selects a participant even without logs and explains unavailable content', async () => {
    const view = render()
    await flushPromises()
    expect(view.text()).toContain('No combat log was captured for this participant.')
    expect(view.text()).not.toContain('Select a participant to view their combat log')
    expect(view.text()).toContain('(Level 56)')
    expect(accounts).toHaveBeenCalledWith(['Fixture', 'Other'])
    expect(view.findAllComponents(Select)[0]!.get('button').text()).toContain('Fixture')
    await view.get('button[title="View equipment"]').trigger('click')
    expect(view.text()).toContain('Equipment is hidden by player privacy settings.')
    expect(view.text()).not.toContain('a shield')
  })

  it('lets the mobile equipment tab select an equipment-only participant from a hidden one', async () => {
    const view = render()
    await flushPromises()
    const tab = view
      .findAll('button')
      .find((button) => button.text() === 'Equipment' && !button.attributes('title'))
    expect(tab).toBeDefined()
    await tab!.trigger('click')
    const select = view.findAllComponents(Select)[0]!
    await select.get('button').trigger('click')
    const option = select
      .findAll('button')
      .find((button) => button.text().includes('VICTIM: Other'))
    expect(option).toBeDefined()
    await option!.trigger('click')
    expect(view.text()).toContain('<held> a shield')
    expect(replace).toHaveBeenLastCalledWith({ query: { pov: 'Other' } })
  })

  it('honors a name-only POV link even when that participant has no log', async () => {
    route.query = { pov: 'other' }
    const view = render()
    await flushPromises()
    await view.get('button[title="View equipment"]').trigger('click')
    expect(view.text()).toContain('<held> a shield')
  })

  it('prefers an available log and preserves rich descriptions and log rendering', async () => {
    data.value!.participants[1] = participant(2, '[56 &+RCleric&n] Other (Orc)', {
      pk_type: 'VICTIM',
      log: 'You strike.\n&+RThe foe falls.&n',
    })
    const view = render()
    await flushPromises()
    expect(view.text()).toContain('You strike.')
    expect(view.text()).toContain('The foe falls.')
    expect(view.text()).toContain('[56 Cleric] Other (Orc)')
    await view.get('button[title="View equipment"]').trigger('click')
    expect(view.text()).toContain('No equipment snapshot was captured for this participant.')
  })
})
