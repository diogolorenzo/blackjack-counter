import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SettingsStore } from '../src/main/state/store'
import { DEFAULT_SETTINGS, DEFAULT_BET_SPREAD, OVERLAY_SIZE_LIMITS } from '../src/shared/defaults'
import { newController } from './helpers'

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'counter-')), 'settings.json')
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('SettingsStore probe', () => {
  it('missing file -> defaults', () => {
    const s = new SettingsStore(tmpFile())
    expect(s.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('corrupt json -> defaults, no throw', () => {
    const p = tmpFile()
    writeFileSync(p, '{{{not json')
    const s = new SettingsStore(p)
    expect(s.get()).toEqual(DEFAULT_SETTINGS)
  })

  it('wrong shape -> defaults', () => {
    const p = tmpFile()
    writeFileSync(p, '"a string"')
    expect(new SettingsStore(p).get()).toEqual(DEFAULT_SETTINGS)
  })

  it('old settings missing new fields still works (deep merge)', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ shoe: { deckCount: 8 } }))
    const s = new SettingsStore(p)
    expect(s.get().shoe.deckCount).toBe(8)
    expect(s.get().shoe.penetration).toBe(DEFAULT_SETTINGS.shoe.penetration)
    expect(s.get().overlay).toEqual(DEFAULT_SETTINGS.overlay)
  })

  it('clamps garbage', () => {
    const p = tmpFile()
    writeFileSync(
      p,
      JSON.stringify({
        shoe: { deckCount: 7, penetration: 5, minDecksRemaining: 99 },
        unitValue: -3,
        overlay: { historyLength: 999, margin: -50, size: 'huge', corner: 'nope' }
      })
    )
    const s = new SettingsStore(p).get()
    expect(s.shoe.deckCount).toBe(6)
    expect(s.shoe.penetration).toBe(0.95)
    expect(s.shoe.minDecksRemaining).toBe(2)
    expect(s.unitValue).toBe(DEFAULT_SETTINGS.unitValue)
    expect(s.overlay.historyLength).toBe(16)
    expect(s.overlay.margin).toBe(0)
    expect(s.overlay.size).toBe('medium')
    expect(s.overlay.corner).toBe('top-right')
  })

  it('bad betSpread -> default', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ betSpreads: { hilo: [{ minTrueCount: 2, units: -1 }] } }))
    expect(new SettingsStore(p).get().betSpreads.hilo).toEqual(DEFAULT_BET_SPREAD)
  })

  it('write is debounced and atomic; flush forces', async () => {
    const p = tmpFile()
    const s = new SettingsStore(p)
    s.update({ unitValue: 50 })
    expect(existsSync(p)).toBe(false)
    await wait(400)
    expect(JSON.parse(readFileSync(p, 'utf8')).unitValue).toBe(50)

    s.update({ unitValue: 75 })
    s.flush()
    expect(JSON.parse(readFileSync(p, 'utf8')).unitValue).toBe(75)
    s.dispose()
  })

  it('round-trips through disk', () => {
    const p = tmpFile()
    const a = new SettingsStore(p)
    a.update({ shoe: { deckCount: 8 }, overlay: { customPosition: { x: 10, y: 20 } } })
    a.flush()
    const b = new SettingsStore(p)
    expect(b.get().shoe.deckCount).toBe(8)
    expect(b.get().overlay.customPosition).toEqual({ x: 10, y: 20 })
  })

  it('trocar de perfil não apaga as teclas opcionais que o usuário atribuiu', () => {
    const store = new SettingsStore(tmpFile())
    store.update({ bindings: { newShoe: 'F9', toggleOverlay: 'F10' } })

    // O perfil só define as quatro de contagem; o merge tem que preservar o resto.
    store.update({ bindings: { low: 'numadd', neutral: 'nummult', high: 'numsub', undo: 'numdiv' } })

    expect(store.get().bindings).toEqual({
      low: 'numadd',
      neutral: 'nummult',
      high: 'numsub',
      undo: 'numdiv',
      redo: '',
      newShoe: 'F9',
      toggleOverlay: 'F10'
    })
  })

  it('tecla vazia só é aceita nas ações opcionais', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ bindings: { low: '', redo: '', newShoe: '  ' } }))
    const bindings = new SettingsStore(p).get().bindings

    expect(bindings.low).toBe(DEFAULT_SETTINGS.bindings.low)
    expect(bindings.redo).toBe('')
    expect(bindings.newShoe).toBe('')
  })

  it('settings da v0.1 migram o betSpread único para o spread de Hi-Lo', () => {
    const p = tmpFile()
    const legacy = [
      { minTrueCount: 3, units: 6 },
      { minTrueCount: -99, units: 1 }
    ]
    writeFileSync(p, JSON.stringify({ betSpread: legacy, unitValue: 50 }))
    const settings = new SettingsStore(p).get()

    expect(settings.betSpreads.hilo).toEqual(legacy)
    expect(settings.betSpreads.ko).toEqual(DEFAULT_SETTINGS.betSpreads.ko)
    expect(settings.unitValue).toBe(50)
    expect((settings as unknown as Record<string, unknown>).betSpread).toBeUndefined()
  })

  it('moeda inválida cai no padrão em vez de quebrar o Intl', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ currency: { code: 'reais', locale: '' } }))
    expect(new SettingsStore(p).get().currency).toEqual(DEFAULT_SETTINGS.currency)
  })

  it('nascem três slots de perfil, todos vazios', () => {
    const profiles = new SettingsStore(tmpFile()).get().bindingProfiles
    expect(profiles).toHaveLength(3)
    expect(profiles.every((slot) => slot.bindings === null)).toBe(true)
    expect(profiles.map((slot) => slot.id)).toEqual(['slot-1', 'slot-2', 'slot-3'])
  })

  it('guarda e devolve um perfil salvo', () => {
    const p = tmpFile()
    const store = new SettingsStore(p)
    const saved = { ...store.get().bindings, low: 'numadd' }

    store.update({
      bindingProfiles: [
        { id: 'slot-1', name: 'Notebook', bindings: saved },
        ...store.get().bindingProfiles.slice(1)
      ]
    })
    store.flush()

    const reopened = new SettingsStore(p).get().bindingProfiles
    expect(reopened[0]?.name).toBe('Notebook')
    expect(reopened[0]?.bindings?.low).toBe('numadd')
    expect(reopened[1]?.bindings).toBeNull()
  })

  it('slot corrompido volta a ser vazio sem tirar os outros do lugar', () => {
    const p = tmpFile()
    writeFileSync(
      p,
      JSON.stringify({
        bindingProfiles: [
          'não é objeto',
          { id: 'qualquer', name: 'Mesa', bindings: { low: 'F5' } },
          { name: '   ' }
        ]
      })
    )
    const profiles = new SettingsStore(p).get().bindingProfiles

    expect(profiles).toHaveLength(3)
    // A posição é o que identifica o slot na UI: o id vem do slot, não do arquivo.
    expect(profiles[0]?.bindings).toBeNull()
    expect(profiles[1]?.id).toBe('slot-2')
    expect(profiles[1]?.name).toBe('Mesa')
    // Perfil salvo com bindings incompletas ganha os defaults das teclas de contagem.
    expect(profiles[1]?.bindings?.low).toBe('F5')
    expect(profiles[1]?.bindings?.neutral).toBe(DEFAULT_SETTINGS.bindings.neutral)
    expect(profiles[2]?.name).toBe('Perfil 3')
  })

  it('nome de perfil é cortado em 24 caracteres', () => {
    const store = new SettingsStore(tmpFile())
    store.update({
      bindingProfiles: [
        { id: 'slot-1', name: 'x'.repeat(80), bindings: null },
        ...store.get().bindingProfiles.slice(1)
      ]
    })
    expect(store.get().bindingProfiles[0]?.name).toHaveLength(24)
  })

  it('rejects prototype pollution from disk', () => {
    const p = tmpFile()
    writeFileSync(p, '{"__proto__":{"polluted":true}}')
    new SettingsStore(p)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('SessionController probe', () => {
  it('broadcasts on every mutation and recomputes derived', () => {
    const c = newController()
    const seen: number[] = []
    const off = c.onChange((s) => seen.push(s.derived.runningCount))

    c.apply(1)
    c.apply(1)
    c.apply(-1)
    expect(c.getSnapshot().derived.runningCount).toBe(1)
    expect(seen).toEqual([1, 2, 1])

    expect(c.undo().derived.runningCount).toBe(2)
    expect(c.redo().derived.runningCount).toBe(1)
    expect(c.newShoe().derived.runningCount).toBe(0)
    expect(c.getSnapshot().undoRestoresShoe).toBe(true)

    off()
    const before = seen.length
    c.apply(1)
    expect(seen.length).toBe(before)
  })

  it('entries get unique ids', () => {
    const c = newController()
    for (let i = 0; i < 30; i += 1) c.apply(1)
    const ids = new Set(c.getSnapshot().recentEntries.map((e) => e.id))
    expect(ids.size).toBe(c.getSnapshot().recentEntries.length)
  })

  it('recentEntries capped at MAX_HISTORY, newest first', () => {
    const c = newController()
    for (let i = 0; i < 40; i += 1) c.apply(i % 2 === 0 ? 1 : -1)
    const r = c.getSnapshot().recentEntries
    expect(r).toHaveLength(24)
    expect(r[0].delta).toBe(-1)
  })

  it('changing deckCount recomputes true count with no new card', () => {
    const c = newController()
    for (let i = 0; i < 26; i += 1) c.apply(1)
    const six = c.getSnapshot().derived.trueCountExact ?? 0
    const one = c.updateSettings({ shoe: { deckCount: 1 } }).derived.trueCountExact ?? 0
    expect(one).toBeGreaterThan(six)
  })

  it('undo/redo with no history returns same snapshot without emitting', () => {
    const c = newController()
    let emits = 0
    c.onChange(() => (emits += 1))
    c.undo()
    c.redo()
    expect(emits).toBe(0)
  })

  it('setNumLock dedupes', () => {
    const c = newController()
    let emits = 0
    c.onChange(() => (emits += 1))
    c.setNumLock(true)
    c.setNumLock(true)
    c.setNumLock(false)
    expect(emits).toBe(2)
    expect(c.getSnapshot().numLockOn).toBe(false)
  })

  it('a throwing listener does not stop the others', () => {
    const c = newController()
    let reached = false
    c.onChange(() => {
      throw new Error('window destroyed')
    })
    c.onChange(() => (reached = true))
    c.apply(1)
    expect(reached).toBe(true)
  })
})

describe('sanitização do overlay de jogada', () => {
  it('settings antiga sem a chave ganha os defaults', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ shoe: { deckCount: 8 } }))
    expect(new SettingsStore(p).get().strategyOverlay).toEqual(DEFAULT_SETTINGS.strategyOverlay)
  })

  it('layout inválido cai no default', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { layout: 'holograma' } }))
    expect(new SettingsStore(p).get().strategyOverlay.layout).toBe('guide')
  })

  it('opacidade fora de faixa é clampada', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { opacity: 9 } }))
    expect(new SettingsStore(p).get().strategyOverlay.opacity).toBe(1)
  })

  it('layout válido sobrevive', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { layout: 'matrix', visible: true } }))
    const saved = new SettingsStore(p).get().strategyOverlay
    expect(saved.layout).toBe('matrix')
    expect(saved.visible).toBe(true)
  })
})

describe('sanitização de customSize', () => {
  it('ausente vira null nos dois overlays', () => {
    const s = new SettingsStore(tmpFile()).get()
    expect(s.overlay.customSize).toBeNull()
    expect(s.strategyOverlay.customSize).toBeNull()
  })

  it('tamanho válido sobrevive', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 300, height: 200 } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toEqual({ width: 300, height: 200 })
  })

  /**
   * settings.json editado à mão ou corrompido não pode produzir uma janela de
   * 9999px: ela nasceria maior que a tela e sem como voltar.
   */
  it('tamanho absurdo é clampado para o teto do tipo', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 9999, height: 9999 } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toEqual(OVERLAY_SIZE_LIMITS.count.max)
  })

  it('o clamp do overlay de jogada segue o layout salvo', () => {
    const p = tmpFile()
    writeFileSync(
      p,
      JSON.stringify({ strategyOverlay: { layout: 'matrix', customSize: { width: 1, height: 1 } } })
    )
    expect(new SettingsStore(p).get().strategyOverlay.customSize).toEqual(
      OVERLAY_SIZE_LIMITS.strategyMatrix.min
    )
  })

  it('shape errado vira null em vez de derrubar a leitura', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 'grande' } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toBeNull()
  })
})
