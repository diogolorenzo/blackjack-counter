import { useEffect } from 'react'

import { DEFAULT_SETTINGS, STRATEGY_MATRIX_CANVAS } from '@shared/defaults'

import { ResizeGrip } from '@/components/ResizeGrip'
import { StrategyGrid } from '@/components/StrategyGrid'
import { StrategyGuide } from '@/components/StrategyGuide'
import { useCounterState } from '@/useCounterState'
import { useWindowSize } from '@/useWindowSize'

/** Canvas de desenho do guia, escalado por `zoom` até caber na janela real. */
const GUIDE_WIDTH = 220
/** Altura consumida por cabeçalho, seguro e linha do "próximo". */
const GUIDE_CHROME = 74
const GUIDE_ROW_HEIGHT = 15

/**
 * A moldura arredondada tem 1px de borda de cada lado, e ela fica FORA do
 * elemento com `zoom`: o espaço de desenho é a janela menos 2px em cada eixo.
 * Sem descontar, o preset `medium` da matriz — que é o canvas em escala 1,0 —
 * transbordaria exatamente a espessura da borda.
 */
const CARD_BORDER = 2

export function StrategyOverlayApp() {
  const { snapshot } = useCounterState()
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS
  const derived = snapshot?.derived ?? null
  const { locked, opacity, layout } = settings.strategyOverlay
  const windowSize = useWindowSize()

  useEffect(() => {
    document.body.dataset.palette = settings.palette
  }, [settings.palette])

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
            decisionCount={derived?.decisionCount ?? 0}
            surrender={settings.shoe.surrender}
            countAware={settings.shoe.system === 'hilo'}
            compact
          />
        ) : (
          <StrategyGuide
            system={settings.shoe.system}
            decisionCount={derived?.decisionCount ?? 0}
            insuranceOn={derived?.insuranceOn ?? false}
            surrender={settings.shoe.surrender}
            maxRows={maxRows}
          />
        )}
      </div>

      {!locked && <ResizeGrip kind="strategy" />}
    </div>
  )
}
