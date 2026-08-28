import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMe } = vi.hoisted(() => ({
  mockGetMe: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  authApi: {
    getMe: mockGetMe,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    checkAuth: vi.fn(),
  },
}))

import { useAuth } from '../useAuth'

describe('useAuth anonymous session restore', () => {
  beforeEach(() => {
    mockGetMe.mockReset()
    sessionStorage.clear()
  })

  it('treats an explicit null user response as anonymous without an error', async () => {
    mockGetMe.mockResolvedValue(null)

    const auth = useAuth()
    const loaded = await auth.loadUser()

    expect(loaded).toBe(false)
    expect(auth.user.value).toBeNull()
    expect(auth.error.value).toBeNull()
    expect(auth.isLoading.value).toBe(false)
  })
})
