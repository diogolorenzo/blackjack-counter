import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { SettingsStore } from '../src/main/state/store'
import { SessionController } from '../src/main/state/sessionController'
import { DEFAULT_SETTINGS, DEFAULT_BET_SPREAD } from '../src/shared/defaults'

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
    writeFileSync(p, JSON.stringify({ betSpread: [{ minTrueCount: 2, units: -1 }] }))
    expect(new SettingsStore(p).get().betSpread).toEqual(DEFAULT_BET_SPREAD)
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

  it('rejects prototype pollution from disk', () => {
    const p = tmpFile()
    writeFileSync(p, '{"__proto__":{"polluted":true}}')
    new SettingsStore(p)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('SessionController probe', () => {
  it('broadcasts on every mutation and recomputes derived', () => {
    const store = new SettingsStore(tmpFile())
    const c = new SessionController(store)
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
    const c = new SessionController(new SettingsStore(tmpFile()))
    for (let i = 0; i < 30; i += 1) c.apply(1)
    const ids = new Set(c.getSnapshot().recentEntries.map((e) => e.id))
    expect(ids.size).toBe(c.getSnapshot().recentEntries.length)
  })

  it('recentEntries capped at MAX_HISTORY, newest first', () => {
    const c = new SessionController(new SettingsStore(tmpFile()))
    for (let i = 0; i < 40; i += 1) c.apply(i % 2 === 0 ? 1 : -1)
    const r = c.getSnapshot().recentEntries
    expect(r).toHaveLength(24)
    expect(r[0].delta).toBe(-1)
  })

  it('changing deckCount recomputes true count with no new card', () => {
    const c = new SessionController(new SettingsStore(tmpFile()))
    for (let i = 0; i < 26; i += 1) c.apply(1)
    const six = c.getSnapshot().derived.trueCountExact
    const one = c.updateSettings({ shoe: { deckCount: 1 } }).derived.trueCountExact
    expect(one).toBeGreaterThan(six)
  })

  it('undo/redo with no history returns same snapshot without emitting', () => {
    const c = new SessionController(new SettingsStore(tmpFile()))
    let emits = 0
    c.onChange(() => (emits += 1))
    c.undo()
    c.redo()
    expect(emits).toBe(0)
  })

  it('setNumLock dedupes', () => {
    const c = new SessionController(new SettingsStore(tmpFile()))
    let emits = 0
    c.onChange(() => (emits += 1))
    c.setNumLock(true)
    c.setNumLock(true)
    c.setNumLock(false)
    expect(emits).toBe(2)
    expect(c.getSnapshot().numLockOn).toBe(false)
  })

  it('a throwing listener does not stop the others', () => {
    const c = new SessionController(new SettingsStore(tmpFile()))
    let reached = false
    c.onChange(() => {
      throw new Error('window destroyed')
    })
    c.onChange(() => (reached = true))
    c.apply(1)
    expect(reached).toBe(true)
  })
})
