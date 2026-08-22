import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

const listeners = new Map<string, (() => void)[]>()
let bounds: Bounds = { x: 0, y: 0, width: 232, height: 150 }
let resizable = false
let loaded = ''

class FakeWindow {
  destroyed = false
  on(event: string, cb: () => void): void {
    const list = listeners.get(event) ?? []
    list.push(cb)
    listeners.set(event, list)
  }
  removeAllListeners(): void {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  isResizable(): boolean {
    return resizable
  }
  setResizable(next: boolean): void {
    resizable = next
  }
  getBounds(): Bounds {
    return { ...bounds }
  }
  getPosition(): [number, number] {
    return [bounds.x, bounds.y]
  }
  getSize(): [number, number] {
    return [bounds.width, bounds.height]
  }
  setBounds(next: Bounds): void {
    // O Windows ignora setBounds com resizable false; o fake reproduz isso para
    // que a ausência do destrave apareça como teste vermelho e não em produção.
    if (!resizable) return
    bounds = { ...next }
  }
  setAlwaysOnTop(): void {}
  setVisibleOnAllWorkspaces(): void {}
  setIgnoreMouseEvents(): void {}
  showInactive(): void {}
  hide(): void {}
  destroy(): void {
    this.destroyed = true
  }
  loadFile(file: string): Promise<void> {
    loaded = file
    return Promise.resolve()
  }
  loadURL(url: string): Promise<void> {
    loaded = url
    return Promise.resolve()
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
  }
}))

const { createOverlayWindow } = await import('../src/main/windows/overlayWindow')
const { DEFAULT_SETTINGS, OVERLAY_SIZE_LIMITS, OVERLAY_SIZES } = await import(
  '../src/shared/defaults'
)
import type { OverlayPlacement } from '../src/shared/types'

function fire(event: string): void {
  for (const cb of listeners.get(event) ?? []) cb()
}

function setup(placement: Partial<OverlayPlacement> = {}) {
  const moves: { x: number; y: number }[] = []
  const resizes: { width: number; height: number }[] = []
  const current: OverlayPlacement = { ...DEFAULT_SETTINGS.overlay, ...placement }

  const controller = createOverlayWindow({
    page: 'overlay.html',
    getPlacement: () => current,
    getPresetSize: () => OVERLAY_SIZES.medium,
    getLimits: () => OVERLAY_SIZE_LIMITS.count,
    onMoved: (pos) => moves.push(pos),
    onResized: (size) => resizes.push(size)
  })

  return { controller, moves, resizes, current }
}

beforeEach(() => {
  listeners.clear()
  bounds = { x: 0, y: 0, width: 232, height: 150 }
  resizable = false
  loaded = ''
})

describe('createOverlayWindow', () => {
  it('aplica o preset quando não há tamanho customizado', () => {
    const { controller } = setup()
    controller.ensure()
    expect(bounds.width).toBe(OVERLAY_SIZES.medium.width)
    expect(bounds.height).toBe(OVERLAY_SIZES.medium.height)
  })

  it('o tamanho customizado ganha do preset', () => {
    const { controller } = setup({ customSize: { width: 320, height: 210 } })
    controller.ensure()
    expect(bounds.width).toBe(320)
    expect(bounds.height).toBe(210)
  })

  it('resizeTo clampa para o teto do tipo', () => {
    const { controller } = setup()
    controller.ensure()
    controller.resizeTo({ width: 9999, height: 9999 })
    expect(bounds.width).toBe(OVERLAY_SIZE_LIMITS.count.max.width)
    expect(bounds.height).toBe(OVERLAY_SIZE_LIMITS.count.max.height)
  })

  it('deixa a janela travada de novo depois de escrever bounds', () => {
    const { controller } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    expect(resizable).toBe(false)
  })

  /**
   * setBounds emite 'moved' e 'resize' também quando fomos nós que escrevemos.
   * Persistir esse eco converteria o modo de canto em posição customizada e o
   * preset em tamanho customizado sozinhos, no primeiro reposicionamento.
   */
  it('ignora o eco de moved e de resized do próprio applyPlacement', () => {
    const { controller, moves, resizes } = setup()
    controller.ensure()
    fire('moved')
    fire('resized')
    expect(moves).toEqual([])
    expect(resizes).toEqual([])
  })

  it('um arrasto de verdade é persistido', () => {
    const { controller, moves } = setup()
    controller.ensure()
    bounds = { ...bounds, x: 500, y: 400 }
    fire('moved')
    expect(moves).toEqual([{ x: 500, y: 400 }])
  })

  it('um resize de verdade é persistido', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    bounds = { ...bounds, width: 300, height: 210 }
    fire('resized')
    expect(resizes).toEqual([{ width: 300, height: 210 }])
  })

  it('carrega a página indicada no spec', () => {
    const { controller } = setup()
    controller.ensure()
    expect(loaded).toContain('overlay.html')
  })
})
