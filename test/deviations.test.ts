import { describe, expect, it } from 'vitest'

import {
  DEVIATIONS,
  PLAY_LABELS,
  currentPlay,
  deviationsForSystem,
  isDeviationActive,
  sortForCount
} from '../src/shared/domain/deviations'
import type { PlayAction } from '../src/shared/domain/deviations'

function byId(id: string) {
  const found = DEVIATIONS.find((deviation) => deviation.id === id)
  if (found === undefined) throw new Error(`desvio ${id} não existe`)
  return found
}

describe('tabela de desvios', () => {
  it('tem os 18 do Illustrious e os 4 do Fab', () => {
    expect(DEVIATIONS.filter((d) => d.group === 'i18')).toHaveLength(18)
    expect(DEVIATIONS.filter((d) => d.group === 'fab4')).toHaveLength(4)
  })

  it('não repete id', () => {
    expect(new Set(DEVIATIONS.map((d) => d.id)).size).toBe(DEVIATIONS.length)
  })

  it('a jogada abaixo do índice nunca é igual à do desvio', () => {
    for (const deviation of DEVIATIONS) {
      expect(deviation.basic).not.toBe(deviation.deviation)
    }
  })
})

describe('ativação por count', () => {
  it('16 vs 10 vira "parar" a partir de zero', () => {
    const play = byId('16v10')
    expect(currentPlay(play, -1)).toBe('hit')
    expect(currentPlay(play, 0)).toBe('stand')
    expect(currentPlay(play, 5)).toBe('stand')
  })

  it('índice negativo: 12 vs 5 volta a "pedir" só abaixo de -2', () => {
    const play = byId('12v5')
    expect(currentPlay(play, 0)).toBe('stand')
    expect(currentPlay(play, -2)).toBe('stand')
    expect(currentPlay(play, -3)).toBe('hit')
  })

  it('seguro acompanha o mesmo índice usado pelo derivado (+3)', () => {
    const insurance = byId('ins')
    expect(insurance.index).toBe(3)
    expect(isDeviationActive(insurance, 2)).toBe(false)
    expect(isDeviationActive(insurance, 3)).toBe(true)
  })
})

describe('ordenação para leitura ao vivo', () => {
  it('coloca os que estão valendo na frente, do índice mais alto para o mais baixo', () => {
    const sorted = sortForCount(DEVIATIONS, 3)
    const active = sorted.filter((d) => isDeviationActive(d, 3))

    expect(sorted.slice(0, active.length)).toEqual(active)
    for (let i = 1; i < active.length; i++) {
      const previous = active[i - 1]
      const current = active[i]
      if (previous === undefined || current === undefined) continue
      expect(previous.index).toBeGreaterThanOrEqual(current.index)
    }
  })

  it('depois vêm os inativos, do mais perto de ativar ao mais longe', () => {
    const sorted = sortForCount(DEVIATIONS, 0)
    const inactive = sorted.filter((d) => !isDeviationActive(d, 0))

    for (let i = 1; i < inactive.length; i++) {
      const previous = inactive[i - 1]
      const current = inactive[i]
      if (previous === undefined || current === undefined) continue
      expect(previous.index).toBeLessThanOrEqual(current.index)
    }
  })

  it('não altera o array de entrada', () => {
    const before = [...DEVIATIONS]
    sortForCount(DEVIATIONS, 4)
    expect([...DEVIATIONS]).toEqual(before)
  })
})

describe('escopo por sistema', () => {
  it('só existe para Hi-Lo: os índices do KO são outra escala', () => {
    expect(deviationsForSystem('hilo')).toHaveLength(DEVIATIONS.length)
    expect(deviationsForSystem('ko')).toHaveLength(0)
  })
})

/**
 * Guarda de completude: um PlayAction novo (ou um idioma novo) sem entrada
 * aqui quebraria em silêncio — `PLAY_LABELS[language][action]` devolveria
 * `undefined` e o botão apareceria vazio no meio de uma mão.
 */
describe('rótulos de jogada', () => {
  const PLAY_ACTIONS: readonly PlayAction[] = [
    'hit',
    'stand',
    'double',
    'split',
    'surrender',
    'insurance',
    'noInsurance'
  ]

  it('os dois idiomas cobrem toda ação', () => {
    for (const language of ['pt', 'en'] as const) {
      for (const action of PLAY_ACTIONS) {
        expect(PLAY_LABELS[language][action]).toBeTruthy()
      }
    }
  })

  it('o texto da jogada e o botão são a mesma string, nos dois idiomas', () => {
    expect(PLAY_LABELS.pt).toEqual({
      hit: 'Pedir',
      stand: 'Ficar',
      double: 'Dobrar',
      split: 'Separar',
      surrender: 'Cashout',
      insurance: 'Sim',
      noInsurance: 'Não'
    })
    expect(PLAY_LABELS.en).toEqual({
      hit: 'Ask',
      stand: 'Stay',
      double: 'Double',
      split: 'Split',
      surrender: 'Cashout',
      insurance: 'Yes',
      noInsurance: 'No'
    })
  })
})
