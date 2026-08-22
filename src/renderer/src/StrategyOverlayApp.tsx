import { useEffect } from 'react'

import { STRATEGY_MATRIX_CANVAS } from '@shared/defaults'

import { ResizeGrip } from '@/components/ResizeGrip'
import { StrategyGrid } from '@/components/StrategyGrid'
import { StrategyGuide } from '@/components/StrategyGuide'
import { useCounterState } from '@/useCounterState'
import { useWindowSize } from '@/useWindowSize'

/** Canvas de desenho do guia, escalado por `zoom` até caber na janela real. */
const GUIDE_WIDTH = 220

/**
 * Altura que o guia gasta fora da lista, em px de canvas. MEDIDA em Chromium
 * sobre o CSS compilado, parcela por parcela:
 *
 *   p-2 do wrapper .......... 16      (entra aqui porque a divisão é feita
 *   cabeçalho ............... 16,5     contra a caixa COM padding)
 *   seguro .................. 23
 *   linha do "próximo" ...... 13,75
 *   3 x gap-1.5 ............. 18
 *   ------------------------------
 *                             87,25
 *
 * Subestimar aqui não aparece como texto cortado pela metade: o bloco
 * "próximo" é o último a desenhar, então é ele que some inteiro dentro do
 * overflow-hidden — justo uma das duas coisas que o modo guia existe para
 * mostrar.
 */
const GUIDE_CHROME = 87.25

/** Passo de uma linha de desvio: o li mede 16,5 e o gap-[3px] da lista soma 3. */
const GUIDE_ROW_HEIGHT = 19.5

/**
 * A moldura arredondada tem 1px de borda de cada lado, e ela fica FORA do
 * elemento com `zoom`: o espaço de desenho é a janela menos 2px em cada eixo.
 * Sem descontar, o preset `medium` da matriz — que é o canvas em escala 1,0 —
 * transbordaria exatamente a espessura da borda.
 */
const CARD_BORDER = 2

export function StrategyOverlayApp() {
  const { snapshot } = useCounterState()
  const windowSize = useWindowSize()
  const palette = snapshot?.settings.palette

  useEffect(() => {
    if (palette === undefined) return
    document.body.dataset.palette = palette
  }, [palette])

  /*
    Nada é desenhado antes do primeiro snapshot.

    Cair em DEFAULT_SETTINGS aqui significaria `system: 'hilo'`, e um jogador
    de KO abrindo o guia veria um frame com desvios de Hi-Lo (16 vs 10 →
    parar). É um frame só, mas seria o único lugar da base onde um índice de
    Hi-Lo alcança um usuário de KO, e essa é a invariante central do projeto.
    Janela vazia por um frame é melhor que conselho errado por um frame — ao
    contrário do overlay de contagem, que pode mostrar zeros sem mentir.
  */
  if (snapshot === null) return null

  const { settings, derived } = snapshot
  const { locked, opacity, layout } = settings.strategyOverlay

  const availableWidth = Math.max(1, windowSize.width - CARD_BORDER)
  const availableHeight = Math.max(1, windowSize.height - CARD_BORDER)

  const matrix = layout === 'matrix'
  const designWidth = matrix ? STRATEGY_MATRIX_CANVAS.width : GUIDE_WIDTH
  const scale = matrix
    ? Math.min(
        availableWidth / STRATEGY_MATRIX_CANVAS.width,
        availableHeight / STRATEGY_MATRIX_CANVAS.height
      )
    : availableWidth / GUIDE_WIDTH

  // Quantas linhas cabem sai da altura REAL, não do preset: uma regra só serve
  // aos três presets e a qualquer tamanho arrastado.
  const maxRows = Math.max(
    1,
    Math.floor((availableHeight / scale - GUIDE_CHROME) / GUIDE_ROW_HEIGHT)
  )

  return (
    <div
      style={{ ['--overlay-alpha' as string]: String(opacity) }}
      className={`relative flex h-full w-full items-start justify-center overflow-hidden rounded-[10px] border border-border/70 bg-overlay backdrop-blur-md ${
        locked ? '' : 'app-drag cursor-move'
      }`}
    >
      {!locked && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-fg/40"
        />
      )}

      <div className="p-2" style={{ width: designWidth, zoom: scale }}>
        {matrix ? (
          <StrategyGrid
            decisionCount={derived.decisionCount}
            surrender={settings.shoe.surrender}
            countAware={settings.shoe.system === 'hilo'}
            compact
          />
        ) : (
          <StrategyGuide
            system={settings.shoe.system}
            decisionCount={derived.decisionCount}
            insuranceOn={derived.insuranceOn}
            surrender={settings.shoe.surrender}
            maxRows={maxRows}
          />
        )}
      </div>

      {!locked && <ResizeGrip kind="strategy" />}
    </div>
  )
}
