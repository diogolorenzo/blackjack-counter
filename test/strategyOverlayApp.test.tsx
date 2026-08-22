// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyOverlayApp } from '../src/renderer/src/StrategyOverlayApp'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { snapshot, stubApi } from './reactHelpers'

afterEach(cleanup)

describe('StrategyOverlayApp', () => {
  it('no modo guia mostra a lista de desvios', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, layout: 'guide', locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    expect(await screen.findByText('Jogada')).toBeTruthy()
  })

  it('no modo matriz mostra a grade', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, layout: 'matrix', locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    // Célula de leitura é span com role="img": botão desabilitado tiraria o
    // arrasto da janela pela regra .app-drag button { no-drag }.
    expect(await screen.findByRole('img', { name: /^16 contra 10:/ })).toBeTruthy()
  })

  /**
   * Travado o overlay é click-through: qualquer área que capture o mouse
   * roubaria clique do jogo.
   */
  it('travado não mostra a alça de redimensionar', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Jogada')
    expect(screen.queryByRole('slider', { name: /redimensionar/i })).toBeNull()
  })

  it('destravado mostra a alça', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: false }
      })
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Jogada')
    expect(screen.getByRole('slider', { name: /redimensionar/i })).toBeTruthy()
  })
})
