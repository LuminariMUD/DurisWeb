import { parseOutputPresentation, type OutputPresentation } from './outputPresentation.js'

/** A full recipient-approved terminal line for the existing adopted channels. */
export interface ChatPresentation extends OutputPresentation {
  channelId: number
  channel: string
  policy: 'preserve' | 'static' | 'animated'
}

const channels: Record<string, readonly [number, string]> = {
  say: [11, 'chat.say'],
  tell: [12, 'chat.tell'],
  gcc: [18, 'chat.guild'],
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseChatPresentation(
  value: unknown,
  legacyChannel: string,
): ChatPresentation | undefined {
  const expected = Object.prototype.hasOwnProperty.call(channels, legacyChannel)
    ? channels[legacyChannel]
    : undefined
  if (
    !expected ||
    !record(value) ||
    value.channelId !== expected[0] ||
    value.channel !== expected[1] ||
    (value.policy !== 'preserve' && value.policy !== 'static' && value.policy !== 'animated')
  )
    return undefined
  const parsed = parseOutputPresentation(value, 16384)
  if (!parsed || parsed.links?.some((link) => link.kind === 'command')) return undefined
  return { ...parsed, channelId: expected[0], channel: expected[1], policy: value.policy }
}

/** Reject malformed legacy chat fields before triggers or rendering see them. */
export function validChatContent(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.channel === 'string' &&
    !['__proto__', 'constructor', 'prototype'].includes(value.channel) &&
    value.channel.length <= 64 &&
    typeof value.sender === 'string' &&
    value.sender.length <= 65536 &&
    typeof value.text === 'string' &&
    value.text.length <= 65536
  )
}
