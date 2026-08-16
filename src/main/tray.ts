import { Menu, Tray, nativeImage } from 'electron'

/**
 * Ícone placeholder gerado em código (PNG 16x16 RGBA, anel claro + centro ciano).
 *
 * Não é enfeite: `new Tray(nativeImage.createEmpty())` no Windows cria um ícone
 * de área de notificação sem bitmap — a entrada existe na Shell_NotifyIcon mas
 * nada é desenhado e nenhum erro é lançado, então o app some da bandeja em
 * silêncio. Embutir o bitmap aqui também evita depender de arquivo em disco, que
 * teria caminho diferente entre `electron-vite dev` e o asar empacotado.
 */
const TRAY_ICON_PNG =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAnklEQVR42q1T2wnAIAx0hM7QCTKCo3QU' +
  'N+lIfrhBvvLVZgOLcEiwtZSqcCAmd3mYONc5LOpZdAO8+3JYdGHRwKIni+YGJ2zLGzk+EFvEm0iHvCNi' +
  'wL0vAidrpPK+poMK4ENNkGAFbM0EYlzTkYFyJ4jUnthu17QR2ZKrCPxtOd7hm2paiJ47oKbcbYrAWAnD' +
  'TZz1jWODNDzKU5bp7zpfYjpwa41XgDgAAAAASUVORK5CYII='

export function createTray(deps: {
  onToggleOverlay: () => void
  onShowMain: () => void
  onNewShoe: () => void
  onQuit: () => void
}): Tray {
  const tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON_PNG))

  tray.setToolTip('Counter')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mostrar janela', click: () => deps.onShowMain() },
      { label: 'Alternar overlay', click: () => deps.onToggleOverlay() },
      { type: 'separator' },
      { label: 'Novo shoe', click: () => deps.onNewShoe() },
      { type: 'separator' },
      { label: 'Sair', click: () => deps.onQuit() }
    ])
  )

  tray.on('click', () => deps.onShowMain())

  return tray
}
