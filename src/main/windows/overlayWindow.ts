import { BrowserWindow, screen } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'node:path'
import { OVERLAY_SIZES } from '@shared/defaults'
import type { Corner, OverlaySettings, Settings } from '@shared/types'

export interface OverlayController {
  ensure(): BrowserWindow
  setVisible(visible: boolean): void
  setLocked(locked: boolean): void
  applyPlacement(overlay: OverlaySettings): void
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

function loadOverlay(win: BrowserWindow): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined && devUrl !== '') {
    void win.loadURL(`${devUrl.replace(/\/$/, '')}/overlay.html`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/overlay.html'))
}

export function createOverlayController(
  getSettings: () => Settings,
  onMoved: (pos: { x: number; y: number }) => void
): OverlayController {
  let win: BrowserWindow | null = null
  /** Última posição escrita por applyPlacement, para distinguir de um arrasto real. */
  let placedAt: Point | null = null

  function alive(): BrowserWindow | null {
    if (win === null || win.isDestroyed()) return null
    return win
  }

  function applyPlacement(overlay: OverlaySettings): void {
    const target = alive()
    if (target === null) return

    const size = OVERLAY_SIZES[overlay.size]
    const custom = overlay.customPosition
    const bounds = target.getBounds()
    const reference = custom ?? {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    }
    const area = screen.getDisplayNearestPoint(reference).workArea
    const desired =
      custom ?? cornerPosition(overlay.corner, size.width, size.height, overlay.margin, area)
    const pos = clampToArea(desired, size.width, size.height, area)

    placedAt = pos

    // No Windows, setBounds é ignorado enquanto a janela está com resizable
    // false; destravar só durante a escrita evita que o overlay fique preso no
    // tamanho inicial ao trocar de preset.
    const wasResizable = target.isResizable()
    if (!wasResizable) target.setResizable(true)
    target.setBounds({ x: pos.x, y: pos.y, width: size.width, height: size.height })
    if (!wasResizable) target.setResizable(false)
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

    const settings = getSettings()
    const size = OVERLAY_SIZES[settings.overlay.size]

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
      onMoved({ x, y })
    })

    created.on('closed', () => {
      if (win === created) {
        win = null
        placedAt = null
      }
    })

    applyPlacement(settings.overlay)
    setLocked(settings.overlay.locked)
    loadOverlay(created)

    return created
  }

  function setVisible(visible: boolean): void {
    if (!visible) {
      alive()?.hide()
      return
    }

    const target = ensure()
    applyPlacement(getSettings().overlay)
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
    if (target === null) return
    target.removeAllListeners('moved')
    target.destroy()
  }

  return { ensure, setVisible, setLocked, applyPlacement, get, destroy }
}
