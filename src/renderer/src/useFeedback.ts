import { useEffect, useRef, useState } from 'react'

import type { AppSnapshot } from '@shared/types'

import { playBucketTick } from '@/audio'

const PULSE_MS = 220

export interface FeedbackOptions {
  /** Só uma janela toca o som; a outra fica só com o pulso, senão o tick vem dobrado. */
  playSound: boolean
}

/**
 * Confirmação de que a tecla registrou.
 *
 * É o único retorno que existe quando o jogo está em foco: sem ele, uma tecla
 * perdida corrompe o shoe inteiro sem nenhum sinal. Dispara pelo `applyTick` do
 * snapshot, que muda a cada carta aplicada — inclusive as vindas de hotkey
 * global, que o renderer nunca vê como evento de teclado.
 */
export function useFeedback(
  snapshot: AppSnapshot | null,
  options: FeedbackOptions
): { pulsing: boolean } {
  const [pulsing, setPulsing] = useState(false)
  const lastTick = useRef<number | null>(null)

  const tick = snapshot?.applyTick ?? 0
  const bucket = snapshot?.lastBucket ?? null
  const feedback = snapshot?.settings.feedback
  const playSound = options.playSound

  useEffect(() => {
    // O primeiro snapshot não é uma carta nova: sem esta guarda, abrir a janela
    // no meio de um shoe dispararia som e pulso do nada.
    if (lastTick.current === null) {
      lastTick.current = tick
      return
    }
    if (tick === lastTick.current) return
    lastTick.current = tick
    if (bucket === null || feedback === undefined) return

    if (feedback.sound && playSound) playBucketTick(bucket, feedback.volume)
    if (!feedback.flash) return

    setPulsing(true)
    const timer = window.setTimeout(() => setPulsing(false), PULSE_MS)
    return () => window.clearTimeout(timer)
  }, [tick, bucket, feedback, playSound])

  return { pulsing }
}
