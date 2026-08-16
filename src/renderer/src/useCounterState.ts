import { useEffect, useState } from 'react'
import type { AppSnapshot } from '@shared/types'

/**
 * Estado das duas janelas. O main é dono da verdade: aqui só se lê o snapshot
 * inicial e se assina o broadcast.
 */
export function useCounterState(): { snapshot: AppSnapshot | null } {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)

  useEffect(() => {
    let live = true
    let broadcasted = false

    // Assina ANTES do getState para não perder uma mudança durante o await.
    const unsubscribe = window.counter.onStateChanged((next) => {
      broadcasted = true
      if (live) setSnapshot(next)
    })

    window.counter
      .getState()
      .then((initial) => {
        // Broadcast chegado no meio do await é mais novo que esta resposta.
        if (live && !broadcasted) setSnapshot(initial)
      })
      .catch(() => {
        // Sem estado inicial o próximo broadcast recupera a janela.
      })

    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  return { snapshot }
}
