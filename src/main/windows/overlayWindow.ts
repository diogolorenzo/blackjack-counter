import { BrowserWindow, screen } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'node:path'
import { clampOverlaySize, effectiveOverlaySize } from '@shared/domain/overlaySize'
import type { Size, SizeLimits } from '@shared/domain/overlaySize'
import type { Corner, OverlayPlacement } from '@shared/types'

export interface OverlayWindowSpec {
  /** Nome do arquivo em src/renderer, ex: 'overlay.html'. */
  page: string
  getPlacement: () => OverlayPlacement
  /** Tamanho do preset em vigor, já resolvido por layout pelo chamador. */
  getPresetSize: () => Size
  getLimits: () => SizeLimits
  onMoved: (pos: { x: number; y: number }) => void
  onResized: (size: Size) => void
}

export interface OverlayController {
  ensure(): BrowserWindow
  setVisible(visible: boolean): void
  setLocked(locked: boolean): void
  /** Sem argumento: lê placement, preset e limites pelos getters do spec. */
  applyPlacement(): void
  /** Arrasto da alça. Clampa e escreve; a persistência vem do evento 'resized'. */
  resizeTo(size: Size): void
  get(): BrowserWindow | null
  destroy(): void
}

interface Point {
  x: number
  y: number
}

/**
 * Mantém a janela inteira dentro da workArea informada.
 *
 * É o que impede o overlay de sumir para sempre: uma customPosition gravada num
 * segundo monitor sobrevive à desconexão dele, e sem este clamp a janela ficaria
 * em coordenadas que não existem mais — invisível e impossível de arrastar de volta.
 */
function clampToArea(pos: Point, width: number, height: number, area: Rectangle): Point {
  const maxX = area.x + Math.max(0, area.width - width)
  const maxY = area.y + Math.max(0, area.height - height)
  return {
    x: Math.round(Math.min(Math.max(pos.x, area.x), maxX)),
    y: Math.round(Math.min(Math.max(pos.y, area.y), maxY))
  }
}

function cornerPosition(
  corner: Corner,
  width: number,
  height: number,
  margin: number,
  area: Rectangle
): Point {
  const left = area.x + margin
  const top = area.y + margin
  const right = area.x + area.width - width - margin
  const bottom = area.y + area.height - height - margin

  switch (corner) {
    case 'top-left':
      return { x: left, y: top }
    case 'top-right':
      return { x: right, y: top }
    case 'bottom-left':
      return { x: left, y: bottom }
    case 'bottom-right':
      return { x: right, y: bottom }
  }
}

function loadPage(win: BrowserWindow, page: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined && devUrl !== '') {
    void win.loadURL(`${devUrl.replace(/\/$/, '')}/${page}`)
    return
  }
  void win.loadFile(join(__dirname, `../renderer/${page}`))
}

export function createOverlayWindow(spec: OverlayWindowSpec): OverlayController {
  let win: BrowserWindow | null = null
  /** Últimos bounds escritos por nós, para distinguir eco de gesto do usuário. */
  let placedAt: Point | null = null
  let placedSize: Size | null = null

  function alive(): BrowserWindow | null {
    if (win === null || win.isDestroyed()) return null
    return win
  }

  /**
   * O Windows ignora setBounds enquanto a janela está com resizable false.
   * Destravar só durante a escrita mantém a janela sem borda de arrasto nativa
   * e ainda assim reposicionável e redimensionável por código.
   */
  function writeBounds(target: BrowserWindow, next: Rectangle): void {
    const wasResizable = target.isResizable()
    if (!wasResizable) target.setResizable(true)
    target.setBounds(next)
    if (!wasResizable) target.setResizable(false)
  }

  function resolveSize(area: Rectangle): Size {
    return effectiveOverlaySize(
      spec.getPresetSize(),
      spec.getPlacement().customSize,
      spec.getLimits(),
      { width: area.width, height: area.height }
    )
  }

  function applyPlacement(): void {
    const target = alive()
    if (target === null) return

    const placement = spec.getPlacement()
    const custom = placement.customPosition
    const bounds = target.getBounds()
    const reference = custom ?? {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    }
    const area = screen.getDisplayNearestPoint(reference).workArea
    const size = resolveSize(area)
    const desired =
      custom ?? cornerPosition(placement.corner, size.width, size.height, placement.margin, area)
    const pos = clampToArea(desired, size.width, size.height, area)

    placedAt = pos
    placedSize = size
    writeBounds(target, { x: pos.x, y: pos.y, width: size.width, height: size.height })
  }

  function resizeTo(size: Size): void {
    const target = alive()
    if (target === null) return

    const bounds = target.getBounds()
    const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea
    const next = clampOverlaySize(size, spec.getLimits(), {
      width: area.width,
      height: area.height
    })

    // Só o tamanho muda: a alça cresce a janela para a direita e para baixo, com
    // o canto superior esquerdo parado, que é o que o gesto promete visualmente.
    placedSize = next
    writeBounds(target, { x: bounds.x, y: bounds.y, width: next.width, height: next.height })
  }

  function setLocked(locked: boolean): void {
    const target = alive()
    if (target === null) return

    // forward: true mantém o renderer recebendo mousemove mesmo com o clique
    // atravessando para o jogo — sem isso o overlay perde qualquer hover.
    if (locked) target.setIgnoreMouseEvents(true, { forward: true })
    else target.setIgnoreMouseEvents(false)
  }

  function ensure(): BrowserWindow {
    const existing = alive()
    if (existing !== null) return existing

    const size = spec.getPresetSize()

    const created = new BrowserWindow({
      width: size.width,
      height: size.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      // Roubar o foco do jogo no meio de uma mão torna o app inutilizável.
      focusable: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // Idem à janela principal: o som vem de hotkey global, nunca de gesto.
        autoplayPolicy: 'no-user-gesture-required'
      }
    })

    win = created
    // 'screen-saver' é o nível acima de janelas normais e de outros
    // alwaysOnTop; sem ele o overlay some atrás de jogos em borderless.
    created.setAlwaysOnTop(true, 'screen-saver')
    created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    created.on('moved', () => {
      const current = alive()
      if (current === null) return
      const [x, y] = current.getPosition()
      // setBounds também emite 'moved': persistir esse eco converteria o modo
      // de canto em posição customizada sozinho, no primeiro reposicionamento.
      if (placedAt !== null && placedAt.x === x && placedAt.y === y) return
      spec.onMoved({ x, y })
    })

    // 'resized' e não 'resize': o segundo dispara a cada frame do gesto nativo.
    // Aqui o gesto é nosso (vem de resizeTo), mas o evento final é o único que
    // vale persistir, e o eco de setBounds precisa da mesma guarda de 'moved'.
    created.on('resized', () => {
      const current = alive()
      if (current === null) return
      const [width, height] = current.getSize()
      if (placedSize !== null && placedSize.width === width && placedSize.height === height) return
      spec.onResized({ width, height })
    })

    created.on('closed', () => {
      if (win === created) {
        win = null
        placedAt = null
        placedSize = null
      }
    })

    applyPlacement()
    setLocked(spec.getPlacement().locked)
    loadPage(created, spec.page)

    return created
  }

  function setVisible(visible: boolean): void {
    if (!visible) {
      alive()?.hide()
      return
    }

    const target = ensure()
    applyPlacement()
    // Reafirmar a cada exibição: o Windows rebaixa o nível quando outro app
    // entra em fullscreen e volta.
    target.setAlwaysOnTop(true, 'screen-saver')
    // showInactive e não show: show() ativa a janela e tira o jogo do foco.
    target.showInactive()
  }

  function get(): BrowserWindow | null {
    return alive()
  }

  function destroy(): void {
    const target = alive()
    win = null
    placedAt = null
    placedSize = null
    if (target === null) return
    target.removeAllListeners('moved')
    target.removeAllListeners('resized')
    target.destroy()
  }

  return { ensure, setVisible, setLocked, applyPlacement, resizeTo, get, destroy }
}
