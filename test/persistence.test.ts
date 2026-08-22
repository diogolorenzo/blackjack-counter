import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { HistoryStore } from '../src/main/state/historyStore'
import { SessionStore } from '../src/main/state/sessionStore'
import { SESSION_RESTORE_WINDOW_MS } from '../src/shared/defaults'
import type { Entry, ShoeRecord, ShoeStats } from '../src/shared/types'

import { newHarness, tmpDir } from './helpers'

const NOW = 1_700_000_000_000

function entries(count: number): Entry[] {
  return Array.from({ length: count }, (_, i) => ({ id: `e${i}`, delta: 1 as const, at: NOW + i }))
}

const STATS: ShoeStats = {
  startedAt: NOW - 60_000,
  maxDecisionCount: 4,
  minDecisionCount: -1,
  msAtAdvantage: 12_000
}

function record(patch: Partial<ShoeRecord> = {}): ShoeRecord {
  return {
    id: 'r1',
    sessionId: null,
    system: 'hilo',
    deckCount: 6,
    startedAt: NOW - 60_000,
    endedAt: NOW,
    cardsSeen: 200,
    maxDecisionCount: 3,
    minDecisionCount: -2,
    msAtAdvantage: 5000,
    closingRawCount: 0,
    result: null,
    ...patch
  }
}

describe('SessionStore', () => {
  it('arquivo ausente não restaura nada', () => {
    const store = new SessionStore(join(tmpDir(), 'session.json'))
    expect(store.restore({ system: 'hilo', deckCount: 6, now: NOW })).toBeNull()
  })

  it('grava e devolve o shoe em andamento', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: entries(5), stats: STATS })
    store.flush()

    const restored = new SessionStore(path).restore({ system: 'hilo', deckCount: 6, now: NOW + 1000 })
    expect(restored?.entries).toHaveLength(5)
    expect(restored?.stats).toEqual(STATS)
  })

  it('a escrita é adiada: sem flush o arquivo ainda não existe', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: entries(1), stats: STATS })
    expect(existsSync(path)).toBe(false)
    store.flush()
    expect(existsSync(path)).toBe(true)
  })

  it('shoe velho demais não volta — número plausível e errado é o pior resultado', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: entries(3), stats: STATS })
    store.flush()

    const late = NOW + SESSION_RESTORE_WINDOW_MS + 1
    expect(new SessionStore(path).restore({ system: 'hilo', deckCount: 6, now: late })).toBeNull()
  })

  it('shoe de outro jogo não volta', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: entries(3), stats: STATS })
    store.flush()

    const fresh = new SessionStore(path)
    expect(fresh.restore({ system: 'ko', deckCount: 6, now: NOW })).toBeNull()
    expect(fresh.restore({ system: 'hilo', deckCount: 8, now: NOW })).toBeNull()
    expect(fresh.restore({ system: 'hilo', deckCount: 6, now: NOW })).not.toBeNull()
  })

  it('shoe vazio não é restauração', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: [], stats: STATS })
    store.flush()
    expect(new SessionStore(path).restore({ system: 'hilo', deckCount: 6, now: NOW })).toBeNull()
  })

  it('arquivo corrompido não derruba nada', () => {
    const path = join(tmpDir(), 'session.json')
    writeFileSync(path, '{{{ nope')
    expect(new SessionStore(path).restore({ system: 'hilo', deckCount: 6, now: NOW })).toBeNull()
  })

  it('descarta entradas malformadas em vez do arquivo inteiro', () => {
    const path = join(tmpDir(), 'session.json')
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        savedAt: NOW,
        system: 'hilo',
        deckCount: 6,
        stats: STATS,
        entries: [
          { id: 'ok', delta: 1, at: NOW },
          { id: 'sem-delta', at: NOW },
          { delta: -1, at: NOW },
          { id: 'delta-invalido', delta: 7, at: NOW }
        ]
      })
    )
    const restored = new SessionStore(path).restore({ system: 'hilo', deckCount: 6, now: NOW })
    expect(restored?.entries.map((e) => e.id)).toEqual(['ok'])
  })

  it('clear apaga o arquivo', () => {
    const path = join(tmpDir(), 'session.json')
    const store = new SessionStore(path)
    store.save({ savedAt: NOW, system: 'hilo', deckCount: 6, entries: entries(2), stats: STATS })
    store.flush()
    expect(existsSync(path)).toBe(true)

    store.clear()
    expect(existsSync(path)).toBe(false)
  })
})

describe('HistoryStore', () => {
  it('devolve os shoes do mais novo para o mais velho', () => {
    const store = new HistoryStore(join(tmpDir(), 'history.json'))
    store.append(record({ id: 'a', endedAt: NOW }))
    store.append(record({ id: 'b', endedAt: NOW + 5000 }))
    expect(store.all().map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sobrevive ao reinício', () => {
    const path = join(tmpDir(), 'history.json')
    new HistoryStore(path).append(record({ id: 'a' }))
    expect(new HistoryStore(path).all().map((r) => r.id)).toEqual(['a'])
  })

  it('grava e limpa o resultado informado', () => {
    const store = new HistoryStore(join(tmpDir(), 'history.json'))
    store.append(record({ id: 'a' }))

    expect(store.setResult('a', -150)[0]?.result).toBe(-150)
    expect(store.setResult('a', null)[0]?.result).toBeNull()
    // Valor não finito é tratado como "não informado", não como zero.
    expect(store.setResult('a', Number.NaN)[0]?.result).toBeNull()
  })

  it('id inexistente não altera nada', () => {
    const store = new HistoryStore(join(tmpDir(), 'history.json'))
    store.append(record({ id: 'a', result: 100 }))
    expect(store.setResult('nope', 5)[0]?.result).toBe(100)
  })

  it('remove e limpa', () => {
    const store = new HistoryStore(join(tmpDir(), 'history.json'))
    store.append(record({ id: 'a' }))
    store.append(record({ id: 'b', endedAt: NOW + 1 }))

    expect(store.remove('a').map((r) => r.id)).toEqual(['b'])
    expect(store.clear()).toEqual([])
  })

  it('arquivo corrompido vira histórico vazio', () => {
    const path = join(tmpDir(), 'history.json')
    writeFileSync(path, 'não é json')
    expect(new HistoryStore(path).all()).toEqual([])
  })

  it('descarta registro sem id em vez do arquivo inteiro', () => {
    const path = join(tmpDir(), 'history.json')
    writeFileSync(path, JSON.stringify([record({ id: 'ok' }), { endedAt: NOW }, 42]))
    expect(new HistoryStore(path).all().map((r) => r.id)).toEqual(['ok'])
  })
})

describe('SessionController: persistência e histórico', () => {
  it('recupera o shoe em andamento num reinício', () => {
    const dir = tmpDir()
    const first = newHarness({ dir })
    first.controller.apply(1)
    first.controller.apply(1)
    first.controller.apply(-1)
    first.controller.flush()
    first.settings.flush()

    const second = newHarness({ dir })
    expect(second.controller.getSnapshot().derived.cardsSeen).toBe(3)
    expect(second.controller.getSnapshot().derived.runningCount).toBe(1)
    expect(second.controller.getSnapshot().sessionRestored).toBe(true)
  })

  it('o aviso de recuperação some quando o usuário confirma', () => {
    const dir = tmpDir()
    const first = newHarness({ dir })
    first.controller.apply(1)
    first.controller.flush()

    const second = newHarness({ dir })
    expect(second.controller.getSnapshot().sessionRestored).toBe(true)
    expect(second.controller.acknowledgeRestore().sessionRestored).toBe(false)
  })

  it('shoe sem carta nenhuma não deixa arquivo para trás', () => {
    const dir = tmpDir()
    const harness = newHarness({ dir })
    harness.controller.apply(1)
    harness.controller.flush()
    harness.controller.newShoe()

    expect(newHarness({ dir }).controller.getSnapshot().sessionRestored).toBe(false)
  })

  it('novo shoe grava um registro com as estatísticas do shoe encerrado', () => {
    let now = NOW
    const harness = newHarness({ clock: () => now })
    harness.controller.updateSettings({ shoe: { deckCount: 1 } })
    harness.controller.startSession()

    now = NOW + 1000
    harness.controller.apply(1)
    now = NOW + 2000
    harness.controller.apply(1)
    now = NOW + 9000
    harness.controller.newShoe()

    const [saved] = harness.history.all()
    expect(saved?.cardsSeen).toBe(2)
    expect(saved?.deckCount).toBe(1)
    expect(saved?.closingRawCount).toBe(2)
    expect(saved?.endedAt).toBe(NOW + 9000)
    expect(saved?.maxDecisionCount).toBe(2)
  })

  it('desfazer o novo shoe apaga o registro; refazer devolve', () => {
    const harness = newHarness()
    harness.controller.startSession()
    harness.controller.apply(1)
    harness.controller.newShoe()
    expect(harness.history.all()).toHaveLength(1)

    harness.controller.undo()
    expect(harness.history.all()).toHaveLength(0)
    expect(harness.controller.getSnapshot().derived.cardsSeen).toBe(1)

    harness.controller.redo()
    expect(harness.history.all()).toHaveLength(1)
    expect(harness.controller.getSnapshot().derived.cardsSeen).toBe(0)
  })

  it('carta nova depois do undo impede o redo de regravar o shoe', () => {
    const harness = newHarness()
    harness.controller.startSession()
    harness.controller.apply(1)
    harness.controller.newShoe()
    harness.controller.undo()
    harness.controller.apply(1)
    harness.controller.redo()

    expect(harness.history.all()).toHaveLength(0)
  })

  it('sem sessão aberta, nada vai para o histórico', () => {
    const harness = newHarness()
    harness.controller.apply(1)
    harness.controller.apply(-1)
    harness.controller.newShoe()

    expect(harness.history.all()).toHaveLength(0)
    // O shoe acontece do mesmo jeito; só não vira estatística.
    expect(harness.controller.getSnapshot().derived.cardsSeen).toBe(0)
  })

  it('a sessão carimba os shoes e conta quantos já fechou', () => {
    const harness = newHarness()
    const started = harness.controller.startSession()
    expect(started.session.active).toBe(true)
    expect(started.session.id).not.toBeNull()

    harness.controller.apply(1)
    harness.controller.newShoe()
    harness.controller.apply(1)
    harness.controller.newShoe()

    const snapshot = harness.controller.getSnapshot()
    expect(snapshot.session.shoes).toBe(2)
    expect(harness.history.all().every((r) => r.sessionId === snapshot.session.id)).toBe(true)
  })

  it('encerrar a sessão para de gravar e zera o contador', () => {
    const harness = newHarness()
    harness.controller.startSession()
    harness.controller.apply(1)
    harness.controller.newShoe()

    const ended = harness.controller.endSession()
    expect(ended.session.active).toBe(false)
    expect(ended.session.id).toBeNull()
    expect(ended.session.shoes).toBe(0)

    harness.controller.apply(1)
    harness.controller.newShoe()
    expect(harness.history.all()).toHaveLength(1)
  })

  it('abrir sessão duas vezes não troca a sessão em curso', () => {
    const harness = newHarness()
    const first = harness.controller.startSession().session.id
    expect(harness.controller.startSession().session.id).toBe(first)
  })

  it('desfazer o novo shoe devolve o contador da sessão', () => {
    const harness = newHarness()
    harness.controller.startSession()
    harness.controller.apply(1)
    harness.controller.newShoe()
    expect(harness.controller.getSnapshot().session.shoes).toBe(1)

    harness.controller.undo()
    expect(harness.controller.getSnapshot().session.shoes).toBe(0)

    harness.controller.redo()
    expect(harness.controller.getSnapshot().session.shoes).toBe(1)
  })

  it('acumula o tempo em vantagem por intervalo, não por carta', () => {
    let now = NOW
    const harness = newHarness({ clock: () => now })
    harness.controller.updateSettings({ shoe: { deckCount: 1 } })

    now = NOW + 1000
    harness.controller.apply(1) // TC ~1.0 — ainda sem vantagem
    expect(harness.controller.getSnapshot().shoeStats.msAtAdvantage).toBe(0)

    now = NOW + 2000
    harness.controller.apply(1) // TC ~2.1 — entra em vantagem
    now = NOW + 5000
    harness.controller.apply(-1) // volta para TC ~1.1 — sai da vantagem

    expect(harness.controller.getSnapshot().shoeStats.msAtAdvantage).toBe(3000)
  })

  it('o registro carrega o tempo de vantagem ainda aberto no fim do shoe', () => {
    let now = NOW
    const harness = newHarness({ clock: () => now })
    harness.controller.updateSettings({ shoe: { deckCount: 1 } })
    harness.controller.startSession()

    now = NOW + 1000
    harness.controller.apply(1)
    harness.controller.apply(1)
    now = NOW + 4000
    harness.controller.newShoe()

    expect(harness.history.all()[0]?.msAtAdvantage).toBe(3000)
  })
})
