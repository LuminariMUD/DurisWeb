import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseViteEnvironment } from '../../../config/environment'

function parseExample(content: string): Record<string, string> {
  return Object.fromEntries(
    content
      .split('\n')
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

describe('frontend environment example', () => {
  it('documents every key and forces placeholder replacement', () => {
    const content = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8')
    expect(() => parseViteEnvironment(parseExample(content))).toThrow(/example placeholder/)
    expect(() =>
      parseViteEnvironment(parseExample(content.split('change-me').join('configured'))),
    ).not.toThrow()
  })
})
