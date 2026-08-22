import { KO_PIVOT } from '@shared/domain/system'
import { formatSigned, formatTrueCount } from '@shared/format'
import type { Derived } from '@shared/types'

export interface SecondaryCount {
  label: string
  value: string
  /** Número usado para colorir; não é o texto. */
  tone: number
}

/**
 * O segundo número do display, que muda de significado com o sistema.
 *
 * No Hi-Lo é o true count — o número que decide tudo. No KO não existe true
 * count (`trueCountExact` vem null), e repetir o running count nos dois cantos
 * seria pior que inútil: mostra-se a distância até o pivô (+4), que é onde a
 * vantagem vira.
 *
 * Fica fora dos componentes para que janela principal e overlay não possam
 * discordar sobre o que estão exibindo.
 */
export function secondaryCount(derived: Derived): SecondaryCount {
  if (derived.trueCountExact !== null) {
    return {
      label: 'True',
      value: formatTrueCount(derived.trueCountExact),
      tone: derived.trueCountExact
    }
  }

  const distance = derived.runningCount - KO_PIVOT
  return {
    label: 'Pivô',
    value: formatSigned(distance),
    tone: distance
  }
}
