// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ResizeGrip } from '../src/renderer/src/components/ResizeGrip'

const calls: { kind: string; width: number; height: number }[] = []

function mountApi(): void {
  Object.defineProperty(window, 'counter', {
    configurable: true,
    value: {
      resizeOverlay: (kind: string, size: { width: number; height: number }) => {
        calls.push({ kind, ...size })
        return Promise.resolve()
      }
    }
  })
}

afterEach(() => {
  cleanup()
  calls.length = 0
})

describe('ResizeGrip', () => {
  it('envia o tamanho alvo a partir das coordenadas de tela', () => {
    mountApi()
    // A janela ocupa a tela de (100, 50) até (332, 200) no screen space.
    window.screenX = 100
    window.screenY = 50
    render(<ResizeGrip kind="count" />)

    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    fireEvent.mouseDown(grip, { screenX: 332, screenY: 200 })
    fireEvent.mouseMove(window, { screenX: 432, screenY: 260 })

    expect(calls).toEqual([{ kind: 'count', width: 332, height: 210 }])
  })

  it('para de enviar depois do mouseup', () => {
    mountApi()
    window.screenX = 0
    window.screenY = 0
    render(<ResizeGrip kind="strategy" />)

    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    fireEvent.mouseDown(grip, { screenX: 200, screenY: 150 })
    fireEvent.mouseUp(window, { screenX: 200, screenY: 150 })
    fireEvent.mouseMove(window, { screenX: 400, screenY: 300 })

    expect(calls).toEqual([])
  })

  /**
   * Sem no-drag a alça cai dentro da região app-drag do overlay e o mousedown
   * vira arrasto de janela: o usuário tenta redimensionar e move.
   */
  it('está fora da região de arrasto da janela', () => {
    mountApi()
    render(<ResizeGrip kind="count" />)
    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    expect(grip.className).toContain('app-no-drag')
  })
})
