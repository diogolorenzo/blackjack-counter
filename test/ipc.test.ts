import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Handler {
  (...args: unknown[]): unknown
}

const registered = new Map<string, Handler>()
const shortcuts = new Map<string, () => void>()
let registerImpl: (acc: string) => boolean = () => true

vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (ch: string) => registered.delete(ch),
    handle: (ch: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      registered.set(ch, (...args: unknown[]) => fn({}, ...args))
    }
  },
  globalShortcut: {
    register: (acc: string, cb: () => void) => {
      const ok = registerImpl(acc)
      if (ok) shortcuts.set(acc, cb)
      return ok
    },
    unregisterAll: () => shortcuts.clear()
  }
}))

const { SettingsStore } = await import('../src/main/state/store')
const { HotkeyManager } = await import('../src/main/hotkeys/manager')
const { binds, statuses, newController } = await import('./helpers')
const { registerIpcHandlers } = await import('../src/main/ipc/handlers')
const { IPC } = await import('../src/shared/ipc')
const { HOTKEY_REPEAT_DEBOUNCE_MS } = await import('../src/shared/defaults')

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), 'counter-ipc-')), 'settings.json')
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

beforeEach(() => {
  registered.clear()
  shortcuts.clear()
  registerImpl = () => true
})

describe('HotkeyManager', () => {
  it('registers every binding and reports ok', () => {
    const fired: string[] = []
    const m = new HotkeyManager((a) => fired.push(a))
    const status = m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)

    expect(status).toEqual(statuses({ low: 'ok', neutral: 'ok', high: 'ok', undo: 'ok' }))
    expect([...shortcuts.keys()]).toEqual(['F1', 'F2', 'F3', 'F4'])

    shortcuts.get('F1')?.()
    expect(fired).toEqual(['low'])
  })

  it('one bad accelerator does not take down the others', () => {
    registerImpl = (acc) => {
      if (acc === 'F2') return false
      if (acc === 'F3') throw new Error('invalid accelerator')
      return true
    }
    const m = new HotkeyManager(() => {})
    const status = m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)

    expect(status).toEqual(statuses({ low: 'ok', neutral: 'conflict', high: 'conflict', undo: 'ok' }))
    expect([...shortcuts.keys()]).toEqual(['F1', 'F4'])
  })

  it('enabled=false registers nothing and reports disabled', () => {
    const m = new HotkeyManager(() => {})
    const status = m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), false)
    expect(status).toEqual(statuses({}))
    expect(shortcuts.size).toBe(0)
  })

  it('two actions on the same key: second is a conflict, first still works', () => {
    const m = new HotkeyManager(() => {})
    const status = m.apply(binds({ low: 'F1', neutral: 'F1', high: 'F3', undo: 'F4' }), true)
    expect(status.low).toBe('ok')
    expect(status.neutral).toBe('conflict')
    expect(shortcuts.size).toBe(3)
  })

  it('debounces the Windows auto-repeat train but allows a real second press', async () => {
    const fired: string[] = []
    const m = new HotkeyManager((a) => fired.push(a))
    m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    const key = shortcuts.get('F1')

    key?.()
    for (let i = 0; i < 20; i += 1) {
      await wait(5)
      key?.()
    }
    expect(fired).toEqual(['low'])

    await wait(HOTKEY_REPEAT_DEBOUNCE_MS + 20)
    key?.()
    expect(fired).toEqual(['low', 'low'])
  })

  it('debounce is per action', () => {
    const fired: string[] = []
    const m = new HotkeyManager((a) => fired.push(a))
    m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    shortcuts.get('F1')?.()
    shortcuts.get('F2')?.()
    shortcuts.get('F3')?.()
    expect(fired).toEqual(['low', 'neutral', 'high'])
  })

  it('capture mode releases every key and restores it afterwards', () => {
    const m = new HotkeyManager(() => {})
    m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    expect(shortcuts.size).toBe(4)

    m.setCaptureMode(true)
    expect(shortcuts.size).toBe(0)

    m.setCaptureMode(false)
    expect(shortcuts.size).toBe(4)
  })

  it('apply() during capture mode leaves nothing registered', () => {
    const m = new HotkeyManager(() => {})
    m.setCaptureMode(true)
    const status = m.apply(binds({ low: 'F5', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    expect(status.low).toBe('ok')
    expect(shortcuts.size).toBe(0)

    m.setCaptureMode(false)
    expect([...shortcuts.keys()]).toContain('F5')
  })

  it('dispose unregisters and stops firing', () => {
    const fired: string[] = []
    const m = new HotkeyManager((a) => fired.push(a))
    m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    const key = shortcuts.get('F1')
    m.dispose()
    key?.()
    expect(fired).toEqual([])
  })

  it('a ação de overlay de jogada é opcional e registrável', () => {
    const fired: string[] = []
    const m = new HotkeyManager((a) => fired.push(a))
    const status = m.apply(
      binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4', toggleStrategyOverlay: 'F6' }),
      true
    )

    expect(status.toggleStrategyOverlay).toBe('ok')
    shortcuts.get('F6')?.()
    expect(fired).toEqual(['toggleStrategyOverlay'])
  })

  it('sem tecla atribuída fica disabled, não conflict', () => {
    const m = new HotkeyManager(() => {})
    const status = m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
    expect(status.toggleStrategyOverlay).toBe('disabled')
  })
})

const noopUpdater = {
  install: () => {},
  dismiss: () => {},
  status: () => null,
  dispose: () => {}
}

function harness() {
  const store = new SettingsStore(tmpFile())
  const controller = newController(store)
  const hotkeys = new HotkeyManager(() => {})
  const overlayCalls: string[] = []
  const overlay = {
    ensure: () => {
      overlayCalls.push('ensure')
      return {} as never
    },
    setVisible: (v: boolean) => overlayCalls.push(`setVisible:${v}`),
    setLocked: (v: boolean) => overlayCalls.push(`setLocked:${v}`),
    applyPlacement: () => overlayCalls.push('applyPlacement'),
    resizeTo: () => overlayCalls.push('resizeTo'),
    get: () => null,
    destroy: () => overlayCalls.push('destroy')
  }
  const win = { minimize: () => overlayCalls.push('minimize'), close: () => overlayCalls.push('close'), isDestroyed: () => false }
  const strategyOverlay = {
    ensure: () => {
      overlayCalls.push('strategy:ensure')
      return {} as never
    },
    setVisible: (v: boolean) => overlayCalls.push(`strategy:setVisible:${v}`),
    setLocked: (v: boolean) => overlayCalls.push(`strategy:setLocked:${v}`),
    applyPlacement: () => overlayCalls.push('strategy:applyPlacement'),
    resizeTo: () => overlayCalls.push('strategy:resizeTo'),
    get: () => null,
    destroy: () => overlayCalls.push('strategy:destroy')
  }
  registerIpcHandlers({
    controller,
    hotkeys,
    overlay,
    strategyOverlay,
    getMainWindow: () => win as never,
    updater: noopUpdater
  })
  const call = (ch: string, ...args: unknown[]): unknown => {
    const fn = registered.get(ch)
    if (fn === undefined) throw new Error(`canal não registrado: ${ch}`)
    return fn(...args)
  }
  return { controller, call, overlayCalls, store }
}

describe('registerIpcHandlers', () => {
  it('registers every channel declared in IPC', () => {
    harness()
    for (const channel of Object.values(IPC)) {
      expect(registered.has(channel), `faltou handler para ${channel}`).toBe(true)
    }
  })

  it('count flow returns snapshots', () => {
    const { call } = harness()
    expect((call(IPC.countApply, 1) as { derived: { runningCount: number } }).derived.runningCount).toBe(1)
    expect((call(IPC.countApply, -1) as { derived: { runningCount: number } }).derived.runningCount).toBe(0)
    expect((call(IPC.countUndo) as { derived: { runningCount: number } }).derived.runningCount).toBe(1)
    expect((call(IPC.countRedo) as { derived: { runningCount: number } }).derived.runningCount).toBe(0)
    expect((call(IPC.countNewShoe) as { derived: { cardsSeen: number } }).derived.cardsSeen).toBe(0)
  })

  it('rejects a malformed delta without throwing or mutating', () => {
    const { call } = harness()
    call(IPC.countApply, 1)
    const after = call(IPC.countApply, 5) as { derived: { runningCount: number; cardsSeen: number } }
    expect(after.derived.cardsSeen).toBe(1)
    expect(after.derived.runningCount).toBe(1)
    expect(() => call(IPC.countApply, 'lots')).not.toThrow()
    expect(() => call(IPC.settingsUpdate, 'nope')).not.toThrow()
    expect(() => call(IPC.overlaySetCorner, 'middle')).not.toThrow()
    expect(() => call(IPC.overlaySetSize, 'huge')).not.toThrow()
  })

  it('setBinding applies and persists', () => {
    const { call, controller } = harness()
    const r = call(IPC.hotkeysSetBinding, 'low', 'F7') as { ok: boolean; effective: string }
    expect(r).toEqual({ ok: true, effective: 'F7' })
    expect(controller.getSnapshot().settings.bindings.low).toBe('F7')
    expect(controller.getSnapshot().hotkeyStatus.low).toBe('ok')
  })

  it('setBinding rolls back to the previous accelerator on conflict', () => {
    const { call, controller } = harness()
    registerImpl = (acc) => acc !== 'F9'
    const r = call(IPC.hotkeysSetBinding, 'low', 'F9') as {
      ok: boolean
      reason: string
      effective: string
    }
    expect(r).toEqual({ ok: false, reason: 'conflict', effective: 'F1' })
    expect(controller.getSnapshot().settings.bindings.low).toBe('F1')
    // O rollback tem que deixar as OUTRAS binds registradas.
    expect([...shortcuts.keys()].sort()).toEqual(['F1', 'F2', 'F3', 'F4'])
  })

  it('setBinding refuses a key already used by another action', () => {
    const { call, controller } = harness()
    const r = call(IPC.hotkeysSetBinding, 'low', 'F2') as { ok: boolean; reason: string; effective: string }
    expect(r).toEqual({ ok: false, reason: 'conflict', effective: 'F1' })
    expect(controller.getSnapshot().settings.bindings.low).toBe('F1')
  })

  it('setBinding validates its arguments', () => {
    const { call } = harness()
    expect(call(IPC.hotkeysSetBinding, 'bogus', 'F7')).toEqual({
      ok: false,
      reason: 'invalid',
      effective: ''
    })
    expect(call(IPC.hotkeysSetBinding, 'low', '   ')).toEqual({
      ok: false,
      reason: 'invalid',
      effective: 'F1'
    })
  })

  it('overlay visibility drives ensure/placement/lock/show once', () => {
    const { call, overlayCalls } = harness()
    call(IPC.overlaySetVisible, true)
    expect(overlayCalls).toEqual(['ensure', 'applyPlacement', 'setLocked:true', 'setVisible:true'])

    overlayCalls.length = 0
    call(IPC.overlaySetLocked, false)
    expect(overlayCalls).toEqual(['ensure', 'setLocked:false'])

    overlayCalls.length = 0
    call(IPC.overlaySetVisible, false)
    expect(overlayCalls).toEqual(['setVisible:false'])
  })

  it('setOverlayCorner clears a dragged customPosition', () => {
    const { call, controller } = harness()
    controller.updateSettings({ overlay: { customPosition: { x: 5, y: 5 } } })
    call(IPC.overlaySetCorner, 'bottom-left', 24)
    const o = controller.getSnapshot().settings.overlay
    expect(o.corner).toBe('bottom-left')
    expect(o.margin).toBe(24)
    expect(o.customPosition).toBeNull()
  })

  it('toggling hotkeysEnabled re-applies the global shortcuts', () => {
    const { call, controller } = harness()
    call(IPC.hotkeysSetEnabled, false)
    expect(shortcuts.size).toBe(0)
    expect(controller.getSnapshot().hotkeyStatus.low).toBe('disabled')

    call(IPC.hotkeysSetEnabled, true)
    expect(shortcuts.size).toBe(4)
    expect(controller.getSnapshot().hotkeyStatus.low).toBe('ok')
  })

  it('a generic settings patch has the same side effects as the dedicated channels', () => {
    const { call, controller, overlayCalls } = harness()
    call(IPC.settingsUpdate, { bindings: { low: 'F8' }, overlay: { visible: true } })
    expect([...shortcuts.keys()]).toContain('F8')
    expect(overlayCalls).toContain('setVisible:true')
    expect(controller.getSnapshot().settings.bindings.low).toBe('F8')
  })

  it('numlock + window channels', () => {
    const { call, controller, overlayCalls } = harness()
    call(IPC.numLockReport, true)
    expect(controller.getSnapshot().numLockOn).toBe(true)
    call(IPC.numLockReport, 'yes')
    expect(controller.getSnapshot().numLockOn).toBe(true)

    call(IPC.windowMinimize)
    call(IPC.windowClose)
    expect(overlayCalls).toContain('minimize')
    expect(overlayCalls).toContain('close')
  })

  it('stateGet and settingsGet return the live values', () => {
    const { call, controller } = harness()
    call(IPC.countApply, 1)
    expect(call(IPC.stateGet)).toBe(controller.getSnapshot())
    expect(call(IPC.settingsGet)).toEqual(controller.getSnapshot().settings)
  })

  it('clearBinding só solta as ações opcionais', () => {
    const { call, controller } = harness()

    call(IPC.hotkeysSetBinding, 'newShoe', 'F9')
    expect(controller.getSnapshot().settings.bindings.newShoe).toBe('F9')
    expect([...shortcuts.keys()]).toContain('F9')

    const cleared = call(IPC.hotkeysClearBinding, 'newShoe') as { ok: boolean; effective: string }
    expect(cleared).toEqual({ ok: true, effective: '' })
    expect(controller.getSnapshot().settings.bindings.newShoe).toBe('')
    expect(controller.getSnapshot().hotkeyStatus.newShoe).toBe('disabled')
    expect([...shortcuts.keys()]).not.toContain('F9')

    // Uma ação de contagem sem tecla tornaria o app inútil.
    const refused = call(IPC.hotkeysClearBinding, 'low') as { ok: boolean; effective: string }
    expect(refused).toEqual({ ok: false, reason: 'invalid', effective: 'F1' })
    expect(controller.getSnapshot().settings.bindings.low).toBe('F1')
  })

  it('duas opcionais sem tecla não colidem entre si', () => {
    const { call, controller } = harness()
    const result = call(IPC.hotkeysSetBinding, 'redo', 'F10') as { ok: boolean }
    expect(result.ok).toBe(true)
    expect(controller.getSnapshot().settings.bindings.redo).toBe('F10')
    expect(controller.getSnapshot().settings.bindings.newShoe).toBe('')
  })

  it('as ações novas chegam do hotkey ao controller', () => {
    const { call, controller } = harness()
    call(IPC.sessionStart)
    call(IPC.countApply, 1)
    call(IPC.countApply, 1)
    expect(controller.getSnapshot().derived.cardsSeen).toBe(2)

    call(IPC.countNewShoe)
    expect(controller.getSnapshot().derived.cardsSeen).toBe(0)
    expect((call(IPC.historyGet) as unknown[]).length).toBe(1)
  })

  it('histórico: grava resultado, limpa e ignora id inexistente', () => {
    const { call } = harness()
    call(IPC.sessionStart)
    call(IPC.countApply, 1)
    call(IPC.countNewShoe)

    const [saved] = call(IPC.historyGet) as { id: string; result: number | null }[]
    expect(saved?.result).toBeNull()

    const updated = call(IPC.historySetResult, saved?.id, -250) as { result: number | null }[]
    expect(updated[0]?.result).toBe(-250)

    expect(() => call(IPC.historySetResult, 42, 'muito')).not.toThrow()
    expect(call(IPC.historyClear)).toEqual([])
  })

  it('riskSimulate usa as settings em vigor e devolve null em KO', () => {
    const { call } = harness()
    const hilo = call(IPC.riskSimulate) as { evPerHandUnits: number } | null
    expect(hilo?.evPerHandUnits).toBeGreaterThan(0)

    call(IPC.settingsUpdate, { shoe: { system: 'ko' } })
    expect(call(IPC.riskSimulate)).toBeNull()
  })

  it('acknowledgeRestore é inofensivo quando não houve recuperação', () => {
    const { call, controller } = harness()
    expect(() => call(IPC.sessionAcknowledgeRestore)).not.toThrow()
    expect(controller.getSnapshot().sessionRestored).toBe(false)
  })
})

function fakeOverlay() {
  const calls: string[] = []
  return {
    calls,
    controller: {
      ensure: () => {
        calls.push('ensure')
        return {} as never
      },
      setVisible: (v: boolean) => calls.push(`setVisible:${String(v)}`),
      setLocked: (v: boolean) => calls.push(`setLocked:${String(v)}`),
      applyPlacement: () => calls.push('applyPlacement'),
      resizeTo: (s: { width: number; height: number }) =>
        calls.push(`resizeTo:${s.width}x${s.height}`),
      get: () => null,
      destroy: () => calls.push('destroy')
    }
  }
}

describe('overlay de jogada pelo IPC', () => {
  it('ligar o overlay de jogada não mexe no de contagem', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    const controller = newController()
    registerIpcHandlers({
      controller,
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null,
      updater: noopUpdater
    })

    await registered.get(IPC.settingsUpdate)?.({ strategyOverlay: { visible: true } })

    expect(strategy.calls).toContain('setVisible:true')
    expect(count.calls).toEqual([])
  })

  it('resizeTo é roteado pelo kind', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null,
      updater: noopUpdater
    })

    await registered.get(IPC.overlayResizeTo)?.('strategy', { width: 300, height: 200 })

    expect(strategy.calls).toEqual(['resizeTo:300x200'])
    expect(count.calls).toEqual([])
  })

  it('kind desconhecido não faz nada, em vez de lançar', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null,
      updater: noopUpdater
    })

    await registered.get(IPC.overlayResizeTo)?.('holograma', { width: 300, height: 200 })

    expect(count.calls).toEqual([])
    expect(strategy.calls).toEqual([])
  })
})

function fakeUpdater() {
  const calls: string[] = []
  return {
    calls,
    controller: {
      install: () => calls.push('install'),
      dismiss: () => calls.push('dismiss'),
      status: () => {
        calls.push('status')
        return null
      },
      dispose: () => calls.push('dispose')
    }
  }
}

/**
 * Os três canais só encaminham para o UpdaterController; sem estes testes,
 * nada prova que `update:install` chama `install` e não, por exemplo,
 * `dismiss` por engano num copiar-e-colar.
 */
describe('updater pelo IPC', () => {
  it('update:getStatus chama status()', async () => {
    const updater = fakeUpdater()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: fakeOverlay().controller,
      strategyOverlay: fakeOverlay().controller,
      getMainWindow: () => null,
      updater: updater.controller
    })

    const result = await registered.get(IPC.updateGetStatus)?.()

    expect(updater.calls).toEqual(['status'])
    expect(result).toBeNull()
  })

  it('update:install chama install()', async () => {
    const updater = fakeUpdater()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: fakeOverlay().controller,
      strategyOverlay: fakeOverlay().controller,
      getMainWindow: () => null,
      updater: updater.controller
    })

    await registered.get(IPC.updateInstall)?.()

    expect(updater.calls).toEqual(['install'])
  })

  it('update:dismiss chama dismiss()', async () => {
    const updater = fakeUpdater()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: fakeOverlay().controller,
      strategyOverlay: fakeOverlay().controller,
      getMainWindow: () => null,
      updater: updater.controller
    })

    await registered.get(IPC.updateDismiss)?.()

    expect(updater.calls).toEqual(['dismiss'])
  })
})
