// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyOverlayApp } from '../src/renderer/src/StrategyOverlayApp'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { snapshot, stubApi } from './reactHelpers'

afterEach(cleanup)

const pick = (rank: string) => fireEvent.click(screen.getByRole('button', { name: `carta ${rank}` }))

describe('StrategyOverlayApp', () => {
  it('abre pedindo a mão do jogador', async () => {
    stubApi(snapshot({ strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true } }))
    render(<StrategyOverlayApp />)
    expect(await screen.findByText('Sua mão')).toBeTruthy()
  })

  /**
   * A invariante central do projeto, na fiação: os índices publicados são de
   * Hi-Lo e a escala do KO é outra. `countAware` sai de `system === 'hilo'`;
   * trocado, um jogador de KO veria 16 vs 10 mandando parar — conselho errado
   * com cara de certo. Sem rendição, a básica de 16 vs 10 é pedir, o oposto
   * exato do desvio do Illustrious 18.
   */
  it('em KO mostra a básica, não o desvio de Hi-Lo', async () => {
    stubApi(
      snapshot(
        {
          shoe: { ...DEFAULT_SETTINGS.shoe, system: 'ko', surrender: false },
          strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true }
        },
        // 21 cartas altas contra o IRC de -20 de 6 baralhos põem o
        // decisionCount em +1, onde o desvio estaria ativo se a fiação
        // estivesse invertida.
        21
      )
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Sua mão')
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('Pedir')
  })

  /*
    Nada é desenhado antes do primeiro snapshot: cair em DEFAULT_SETTINGS
    significaria `system: 'hilo'`, e um jogador de KO veria um frame com
    desvios de Hi-Lo.
  */
  it('não desenha nada antes do primeiro snapshot', () => {
    stubApi(snapshot())
    const { container } = render(<StrategyOverlayApp />)
    expect(container.firstChild).toBe(null)
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
    await screen.findByText('Sua mão')
    expect(screen.queryByRole('slider', { name: /redimensionar/i })).toBeNull()
  })

  it('destravado mostra a alça', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: false }
      })
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Sua mão')
    expect(screen.getByRole('slider', { name: /redimensionar/i })).toBeTruthy()
  })
})
