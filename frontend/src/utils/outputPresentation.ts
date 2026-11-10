export interface OutputLink {
  start: number
  end: number
  kind: 'command' | 'url'
  target: string
}

export interface OutputPresentation {
  version: 1
  text: string
  underline: boolean
  runs: [number, number, number, number][]
  links?: OutputLink[]
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function color(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (value === 0 || (value >= 16 && value <= 31))
  )
}

/** Decode only bounded literal text, numeric colors and explicit safe targets. */
export function parseOutputPresentation(
  value: unknown,
  maximum = 1048576,
): OutputPresentation | undefined {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.text !== 'string' ||
    value.text.length > maximum * 2 ||
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u.test(value.text) ||
    typeof value.underline !== 'boolean' ||
    !Array.isArray(value.runs) ||
    value.runs.length > 4096
  )
    return undefined
  const length = Array.from(value.text).length
  if (length > maximum) return undefined
  const runs: OutputPresentation['runs'] = []
  let offset = 0
  for (const run of value.runs) {
    if (
      !Array.isArray(run) ||
      run.length !== 4 ||
      run[0] !== offset ||
      !Number.isInteger(run[1]) ||
      run[1] <= offset ||
      run[1] > length ||
      !color(run[2]) ||
      !color(run[3])
    )
      return undefined
    runs.push([offset, run[1], run[2], run[3]])
    offset = run[1]
  }
  if (offset !== length) return undefined
  const links: OutputLink[] = []
  let bytes = 0
  offset = 0
  if (value.links !== undefined) {
    if (!Array.isArray(value.links) || value.links.length > 128) return undefined
    for (const link of value.links) {
      if (
        !record(link) ||
        typeof link.start !== 'number' ||
        !Number.isInteger(link.start) ||
        typeof link.end !== 'number' ||
        !Number.isInteger(link.end) ||
        link.start < offset ||
        link.end <= link.start ||
        link.end > length ||
        typeof link.target !== 'string' ||
        link.target.length > 2048 ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(link.target)
      )
        return undefined
      const size = new TextEncoder().encode(link.target).length
      bytes += size
      if (bytes > 32768) return undefined
      if (link.kind === 'command') {
        if (
          !link.target.startsWith('help ') ||
          !link.target.slice(5).trim() ||
          /[;|]/u.test(link.target) ||
          size >= 1024
        )
          return undefined
      } else if (link.kind === 'url') {
        if (size > 2048 || !/^https?:\/\/[^/?#]/iu.test(link.target) || link.target.includes(' '))
          return undefined
        try {
          const url = new URL(link.target)
          if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return undefined
        } catch {
          return undefined
        }
      } else return undefined
      links.push({ start: link.start, end: link.end, kind: link.kind, target: link.target })
      offset = link.end
    }
  }
  return {
    version: 1,
    text: value.text,
    underline: value.underline,
    runs,
    ...(links.length ? { links } : {}),
  }
}

export function parseBodyPresentation(value: unknown): OutputPresentation | undefined {
  const parsed = parseOutputPresentation(value, 65536)
  return parsed?.links?.some((link) => link.kind === 'command') ? undefined : parsed
}

/** Keep metadata paired with exact terminal text, then clip it alongside lines. */
export function outputPresentationLines(
  value: unknown,
  terminal: string,
): OutputPresentation[] | undefined {
  const parsed = parseOutputPresentation(value)
  if (!parsed || terminal.replace(/\x1b\[[0-9;]*m/gu, '').replace(/\r/gu, '') !== parsed.text)
    return undefined
  const result: OutputPresentation[] = []
  let offset = 0,
    runIndex = 0,
    linkIndex = 0
  for (const text of parsed.text.split('\n')) {
    const end = offset + Array.from(text).length
    while (runIndex < parsed.runs.length && parsed.runs[runIndex]![1] <= offset) runIndex++
    while (linkIndex < (parsed.links?.length ?? 0) && parsed.links![linkIndex]!.end <= offset)
      linkIndex++
    const runs: OutputPresentation['runs'] = []
    const links: OutputLink[] = []
    for (let i = runIndex; i < parsed.runs.length && parsed.runs[i]![0] < end; i++) {
      const run = parsed.runs[i]!
      runs.push([Math.max(offset, run[0]) - offset, Math.min(end, run[1]) - offset, run[2], run[3]])
    }
    for (let i = linkIndex; i < (parsed.links?.length ?? 0) && parsed.links![i]!.start < end; i++) {
      const link = parsed.links![i]!
      links.push({
        ...link,
        start: Math.max(offset, link.start) - offset,
        end: Math.min(end, link.end) - offset,
      })
    }
    result.push({
      version: 1,
      text,
      underline: parsed.underline,
      runs,
      ...(links.length ? { links } : {}),
    })
    offset = end + 1
  }
  return result
}
