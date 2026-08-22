import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

/**
 * Estado da pílula de atualização. Segue o mesmo padrão de useCounterState:
 * assina o broadcast antes do get inicial para não perder uma mudança durante
 * o await, e usa `broadcasted` para que uma resposta lenta do get não
 * sobrescreva um broadcast mais novo.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let live = true
    let broadcasted = false

    // Assina ANTES do get para não perder uma mudança durante o await.
    const unsubscribe = window.counter.onUpdateStatus((next) => {
      broadcasted = true
      if (live) setStatus(next)
    })

    window.counter
      .getUpdateStatus()
      .then((initial) => {
        if (live && !broadcasted) setStatus(initial)
      })
      .catch(() => {
        // Sem estado inicial o próximo broadcast recupera a pílula.
      })

    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  return status
}
