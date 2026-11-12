import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import FragLeaderboardTable from '../FragLeaderboardTable.vue'

describe('frag leaderboard rows', () => {
  it('open the public character page and never show an account (issue #181)', async () => {
    // An older API response may still carry the account; it must not reach the page.
    const row = {
      rank: 1,
      char_name: 'Fixture',
      account_name: 'Secretaccount',
      total_frags: 12.5,
      racewar: 1,
      race: 'Human',
      class: 'Warrior',
      level: 50,
      last_updated: '2026-01-01T00:00:00Z',
    }
    const view = mount(FragLeaderboardTable, { props: { entries: [row] } })
    expect(view.text()).toContain('Fixture')
    expect(view.html()).not.toContain('Secretaccount')
    await view.get('tbody tr').trigger('click')
    expect(push).toHaveBeenCalledWith({
      name: 'character-profile',
      params: { characterName: 'Fixture' },
    })
  })
})
