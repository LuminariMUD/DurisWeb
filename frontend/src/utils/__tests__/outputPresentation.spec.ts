import { describe, expect, it } from 'vitest'
import {
  outputPresentationLines,
  parseBodyPresentation,
  parseOutputPresentation,
} from '../outputPresentation.js'
import fixtures from '../../components/mud/__tests__/fixtures/output-presentation-v1.json'

describe('output snapshots from the production server harness', () => {
  it('validates real text/chat payloads and rebases Unicode positions per line', () => {
    const packet = fixtures[0]!
    const parsed = parseOutputPresentation(packet.presentation)
    expect(parsed?.links?.[0]).toMatchObject({ start: 3, end: 10, target: 'help weather' })
    const lines = outputPresentationLines(packet.presentation, packet.data!)
    expect(lines).toHaveLength(3)
    expect(lines?.[1]?.links?.[0]).toMatchObject({ start: 2, end: 9, target: 'help weather' })
    expect(lines?.[1]?.text).toContain('&name=two')
    expect(lines?.[2]?.links).toBeUndefined()
    expect(parseBodyPresentation(fixtures[2]!.bodyPresentation)?.links?.[0]?.kind).toBe('url')
    expect(outputPresentationLines(packet.presentation, 'mismatched text')).toBeUndefined()
  })

  it('rejects malformed data and unsafe targets before rendering or history use', () => {
    const original = parseOutputPresentation(fixtures[0]!.presentation)!
    const help = original.links![0]!
    const invalid: unknown[] = [
      null,
      {},
      { ...original, version: 2 },
      { ...original, underline: 'yes' },
      { ...original, text: '\x1b[1z<SEND>' },
      { ...original, runs: [[0, 1, 15, 0]] },
      { ...original, runs: [[1, 2, 0, 0]] },
      ...['quit', 'help a;quit', 'help a|quit', 'help a\nquit'].map((target) => ({
        ...original,
        links: [{ ...help, target }],
      })),
      ...[
        'javascript:alert(1)',
        'data:text/html,x',
        'https:///missing',
        'https://a b',
        'https://a\n.test',
      ].map((target) => ({ ...original, links: [{ ...help, kind: 'url', target }] })),
      { ...original, links: [{ ...help, start: -1 }] },
      { ...original, links: [{ ...help, end: 999999 }] },
      { ...original, links: [{ ...help, kind: 'eval' }] },
      { ...original, links: [help, help] },
    ]
    for (const value of invalid) expect(parseOutputPresentation(value)).toBeUndefined()
    expect(parseBodyPresentation(original)).toBeUndefined()
    expect(parseOutputPresentation({ ...original, style: 'unsafe' })).not.toHaveProperty('style')
  })

  it('clips links across lines while retaining the complete target and color coverage', () => {
    const value = {
      version: 1,
      text: 'one\ntwo',
      underline: false,
      runs: [[0, 7, 20, 0]],
      links: [{ start: 0, end: 7, kind: 'command', target: 'help complete' }],
    }
    const lines = outputPresentationLines(value, 'one\r\ntwo')!
    expect(lines.map((line) => line.links?.[0])).toEqual([
      { start: 0, end: 3, kind: 'command', target: 'help complete' },
      { start: 0, end: 3, kind: 'command', target: 'help complete' },
    ])
    expect(lines.map((line) => line.runs)).toEqual([[[0, 3, 20, 0]], [[0, 3, 20, 0]]])
  })
})
