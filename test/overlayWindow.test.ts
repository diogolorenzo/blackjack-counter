import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

interface FakeOptions {
  webPreferences?: { backgroundThrottling?: boolean }
}

let created: FakeOptions | null = null
let ignoreMouseEventsCalls: { ignore: boolean; forward?: boolean }[] = []

class FakeWindow {
  destroyed = false
  constructor(options: FakeOptions) {
    created = options
  }
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
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void {
    ignoreMouseEventsCalls.push({ ignore, forward: options?.forward })
  }
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

function setup(
  placement: Partial<OverlayPlacement> = {},
  clickThroughWhenLocked = true
) {
  const moves: { x: number; y: number }[] = []
  const resizes: { width: number; height: number }[] = []
  const current: OverlayPlacement = { ...DEFAULT_SETTINGS.overlay, ...placement }

  const controller = createOverlayWindow({
    page: 'overlay.html',
    getPlacement: () => current,
    getPresetSize: () => OVERLAY_SIZES.medium,
    getLimits: () => OVERLAY_SIZE_LIMITS.count,
    clickThroughWhenLocked,
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
  created = null
  ignoreMouseEventsCalls = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
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

  /**
   * O Windows marca como ocluída a segunda janela transparente e always-on-top
   * que aparece, mesmo sem nada por cima. Ocluída, o renderer para de pintar e
   * de emitir 'resize': o overlay congela na tela enquanto a janela nativa
   * continua sendo redimensionada.
   */
  it('cria a janela sem throttling de segundo plano', () => {
    const { controller } = setup()
    controller.ensure()
    expect(created?.webPreferences?.backgroundThrottling).toBe(false)
  })

  it('recua a janela para que o novo tamanho caiba na área útil', () => {
    const { controller } = setup()
    controller.ensure()
    bounds = { x: 1700, y: 900, width: 232, height: 150 }
    controller.resizeTo({ width: 400, height: 300 })
    // 1920x1040 de área útil: 1700+400 e 900+300 estourariam as duas bordas.
    expect(bounds).toEqual({ x: 1520, y: 740, width: 400, height: 300 })
  })

  it('o recuo do resizeTo não vira posição customizada', () => {
    const { controller, moves } = setup()
    controller.ensure()
    bounds = { x: 1700, y: 900, width: 232, height: 150 }
    controller.resizeTo({ width: 400, height: 300 })
    fire('moved')
    expect(moves).toEqual([])
  })

  it('persiste o tamanho arrastado depois que o gesto para', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    fire('resized')
    expect(resizes).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(resizes).toEqual([{ width: 300, height: 200 }])
  })

  it('uma rajada de arrasto persiste só o tamanho final', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    for (let step = 1; step <= 8; step += 1) {
      controller.resizeTo({ width: 240 + step * 15, height: 156 + step * 10 })
      vi.advanceTimersByTime(16)
    }
    expect(resizes).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(resizes).toEqual([{ width: 360, height: 236 }])
    expect(bounds.width).toBe(360)
    expect(bounds.height).toBe(236)
  })

  /**
   * A janela pode morrer dentro da espera do debounce — soltar a alça e fechar o
   * app em seguida é um gesto normal. Cancelar sem gravar perderia o tamanho.
   */
  it('destruir a janela grava o tamanho pendente em vez de descartá-lo', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    controller.destroy()
    expect(resizes).toEqual([{ width: 300, height: 200 }])
    vi.advanceTimersByTime(1000)
    expect(resizes).toEqual([{ width: 300, height: 200 }])
  })

  it('a janela fechada pelo sistema também grava o tamanho pendente', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    fire('closed')
    expect(resizes).toEqual([{ width: 300, height: 200 }])
  })

  it('destruir depois do debounce não grava o mesmo tamanho duas vezes', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    vi.advanceTimersByTime(1000)
    controller.destroy()
    expect(resizes).toEqual([{ width: 300, height: 200 }])
  })

  it('carrega a página indicada no spec', () => {
    const { controller } = setup()
    controller.ensure()
    expect(loaded).toContain('overlay.html')
  })

  /**
   * O overlay de contagem é só leitura: travado, os cliques devem atravessar
   * para o jogo por baixo.
   */
  it('overlay de contagem travado vira clique-através', () => {
    const { controller } = setup({ locked: true }, true)
    controller.ensure()
    expect(ignoreMouseEventsCalls).toContainEqual({ ignore: true, forward: true })
  })

  /**
   * O overlay de jogada é a superfície de input — o teclado de ranks só
   * funciona recebendo clique —, então travado ele nunca vira clique-através,
   * diferente do overlay de contagem.
   */
  it('overlay de jogada travado nunca vira clique-através', () => {
    const { controller } = setup({ locked: true }, false)
    controller.ensure()
    expect(ignoreMouseEventsCalls).not.toContainEqual(
      expect.objectContaining({ ignore: true })
    )
  })

  it('overlay de jogada destravado também não é clique-através', () => {
    const { controller } = setup({ locked: false }, false)
    controller.ensure()
    expect(ignoreMouseEventsCalls).not.toContainEqual(
      expect.objectContaining({ ignore: true })
    )
  })
})
