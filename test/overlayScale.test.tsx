// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useWindowSize } from '../src/renderer/src/useWindowSize'

function Probe() {
  const { width, height } = useWindowSize()
  return <span data-testid="size">{`${width}x${height}`}</span>
}

function resizeTo(width: number, height: number): void {
  window.innerWidth = width
  window.innerHeight = height
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

afterEach(cleanup)

describe('useWindowSize', () => {
  it('mede a janela no primeiro render', () => {
    resizeTo(232, 150)
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('size').textContent).toBe('232x150')
  })

  /**
   * É o que faz a escala do conteúdo acompanhar o arrasto da alça em tempo
   * real, sem passar por IPC.
   */
  it('acompanha o resize da janela', () => {
    resizeTo(232, 150)
    const { getByTestId } = render(<Probe />)
    resizeTo(400, 260)
    expect(getByTestId('size').textContent).toBe('400x260')
  })
})
