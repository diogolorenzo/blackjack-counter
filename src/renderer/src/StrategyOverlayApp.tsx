import { useEffect } from 'react'

import { STRATEGY_HAND_CANVAS, STRATEGY_OVERLAY_CARD_BORDER } from '@shared/defaults'

import { HandRound } from '@/components/HandRound'
import { ResizeGrip } from '@/components/ResizeGrip'
import { useCounterState } from '@/useCounterState'
import { useWindowSize } from '@/useWindowSize'

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
  const { locked, opacity } = settings.strategyOverlay

  // A borda de 1px do cartão fica fora do elemento com zoom, então o espaço de
  // desenho é a janela menos 2px em cada eixo.
  const availableWidth = Math.max(1, windowSize.width - STRATEGY_OVERLAY_CARD_BORDER)
  const availableHeight = Math.max(1, windowSize.height - STRATEGY_OVERLAY_CARD_BORDER)

  // Layout de proporção fixa: escala pela menor dimensão, senão corta.
  const scale = Math.min(
    availableWidth / STRATEGY_HAND_CANVAS.width,
    availableHeight / STRATEGY_HAND_CANVAS.height
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

      <div className="p-2" style={{ width: STRATEGY_HAND_CANVAS.width, zoom: scale }}>
        <HandRound
          system={settings.shoe.system}
          decisionCount={derived.decisionCount}
          surrender={settings.shoe.surrender}
          insuranceOn={derived.insuranceOn}
          dealerFirst={settings.strategyOverlay.dealerFirst}
          showReason={settings.strategyOverlay.showReason}
          autoResetSeconds={settings.strategyOverlay.autoResetSeconds}
          keypadDensity={settings.strategyOverlay.keypadDensity}
          language={settings.decisionLanguage}
        />
      </div>

      {!locked && <ResizeGrip kind="strategy" />}
    </div>
  )
}
