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
   * A invariante central do projeto, na fiação: os índices publicados são de
   * Hi-Lo, e a escala do KO é outra. `countAware` tem que sair de
   * `system === 'hilo'` e não do contrário — trocado, um jogador de KO veria
   * 16 vs 10 mandando parar, que é conselho errado com cara de certo.
   */
  it('em KO a matriz mostra a básica, não o desvio de Hi-Lo', async () => {
    stubApi(
      snapshot(
        {
          // Sem rendição na mesa a básica de 16 vs 10 é pedir, o oposto exato
          // do desvio do Illustrious 18 (parar) — com rendição as duas seriam
          // render.
          shoe: { ...DEFAULT_SETTINGS.shoe, system: 'ko', surrender: false },
          strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, layout: 'matrix', locked: true }
        },
        // 21 cartas altas contra o IRC de -20 de 6 baralhos põem o
        // decisionCount em +1. Sem isso o teste não discrimina nada: em -20
        // nenhum índice do Illustrious 18 estaria ativo e a grade mostraria a
        // básica de qualquer jeito, mesmo com a fiação invertida.
        21
      )
    )
    render(<StrategyOverlayApp />)
    const cell = await screen.findByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('pedir')
  })

  /**
   * Antes do primeiro snapshot não existe settings real, e cair em
   * DEFAULT_SETTINGS (Hi-Lo) entregaria um frame de desvios de Hi-Lo a quem
   * joga KO. Janela vazia por um frame é melhor que conselho errado.
   */
  it('não desenha nada antes do primeiro snapshot', () => {
    stubApi(snapshot())
    const { container } = render(<StrategyOverlayApp />)
    expect(container.innerHTML).toBe('')
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
