import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OutputPresentation from '../OutputPresentation.vue'
import fixtures from './fixtures/output-presentation-v1.json'
import { outputPresentationLines } from '../../../utils/outputPresentation.js'

it('renders escaped literal labels and safe links without executing on receipt', async () => {
  const packet = fixtures[0]!
  const presentation = outputPresentationLines(packet.presentation, packet.data!)![1]!
  const command = vi.fn()
  const wrapper = mount(OutputPresentation, { props: { presentation, onCommand: command } })
  expect(wrapper.text()).toBe(presentation.text)
  expect(wrapper.find('literal').exists()).toBe(false)
  expect(command).not.toHaveBeenCalled()
  const button = wrapper.get('button')
  expect(button.text()).toBe('weather')
  await button.trigger('click')
  expect(command).toHaveBeenCalledExactlyOnceWith('help weather')
  const anchor = wrapper.get('a')
  expect(anchor.attributes('href')).toBe('https://example.test/?x=1&name=two')
  expect(anchor.attributes('rel')).toBe('noopener noreferrer')
  expect(anchor.attributes('target')).toBe('_blank')
  wrapper.unmount()
})

it('groups a link across colors into one keyboard target and contains game hotkeys', async () => {
  const presentation = {
    version: 1,
    text: 'weather',
    underline: false,
    runs: [
      [0, 2, 19, 0],
      [2, 7, 27, 0],
    ],
    links: [{ start: 0, end: 7, kind: 'command', target: 'help weather' }],
  }
  const wrapper = mount(OutputPresentation, { props: { presentation }, attachTo: document.body })
  expect(wrapper.findAll('button')).toHaveLength(1)
  expect(wrapper.get('button').findAll('span')).toHaveLength(2)
  const globalKey = vi.fn()
  document.addEventListener('keydown', globalKey)
  await wrapper.get('button').trigger('keydown', { key: 'ArrowUp', code: 'ArrowUp' })
  expect(globalKey).not.toHaveBeenCalled()
  document.removeEventListener('keydown', globalKey)
  wrapper.unmount()
})

it('uses the supplied fallback when stored metadata is invalid', () => {
  const wrapper = mount(OutputPresentation, {
    props: { presentation: { version: 2 } },
    slots: { default: 'Readable legacy text' },
  })
  expect(wrapper.text()).toBe('Readable legacy text')
  expect(wrapper.find('button').exists()).toBe(false)
  wrapper.unmount()
})
