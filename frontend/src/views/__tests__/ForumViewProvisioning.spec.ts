import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/views/ForumView.vue'), 'utf8')

describe('forum empty-state provisioning contract', () => {
  it('offers administrators a direct first-category action', () => {
    expect(source).toContain('Set up the first category')
    expect(source).toContain('@click="startInitialSetup"')
    expect(source).toContain('editMode.value = true')
    expect(source).toContain('startCreating()')
  })

  it('does not imply that normal users can fix unavailable forum data', () => {
    expect(source).toContain(
      'The forum is temporarily unavailable while an administrator completes setup.',
    )
  })
})
