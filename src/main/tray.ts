import { Menu, Tray, nativeImage } from 'electron'

import { formatSigned, formatTrueCount, formatUnits } from '@shared/format'
import { systemProfile } from '@shared/domain/system'
import { ADVANTAGE_COUNT } from '@shared/types'
import type { AppSnapshot } from '@shared/types'

import { renderTrayIcon } from './trayIcon'

/**
 * Estados do ícone. A bandeja é o único indicador que sobrevive ao overlay não
 * aparecer (jogo em fullscreen exclusivo) e à janela principal estar fechada,
 * então ela carrega o estado que mais importa: se as teclas estão armadas e se
 * a contagem está quente.
 */
const ICON_COLORS = {
  disabled: '#7d8896',
  armed: '#8fb6cc',
  advantage: '#34d399',
  exhausted: '#f87171'
} as const

type IconState = keyof typeof ICON_COLORS

const ICONS: Partial<Record<IconState, Electron.NativeImage>> = {}

function icon(state: IconState): Electron.NativeImage {
  const cached = ICONS[state]
  if (cached !== undefined) return cached
  const created = nativeImage.createFromBuffer(renderTrayIcon(ICON_COLORS[state]))
  ICONS[state] = created
  return created
}

function iconState(snapshot: AppSnapshot): IconState {
  if (!snapshot.settings.hotkeysEnabled) return 'disabled'
  if (snapshot.derived.shoeExhausted) return 'exhausted'
  if (snapshot.derived.decisionCount >= ADVANTAGE_COUNT) return 'advantage'
  return 'armed'
}

function tooltip(snapshot: AppSnapshot): string {
  const { derived, settings } = snapshot
  const profile = systemProfile(settings.shoe.system)
  const count =
    derived.trueCountExact === null
      ? `RC ${formatSigned(derived.runningCount)}`
      : `RC ${formatSigned(derived.runningCount)} · TC ${formatTrueCount(derived.trueCountExact)}`

  const lines = [
    `Counter · ${profile.label}`,
    `${count} · ${formatUnits(derived.betUnits)}`,
    `${derived.cardsSeen}/${derived.totalCards} cartas`
  ]
  if (!settings.hotkeysEnabled) lines.push('Atalhos globais DESLIGADOS')
  else if (derived.insuranceOn) lines.push('Insurance')
  return lines.join('\n')
}

export interface TrayDeps {
  onToggleOverlay: () => void
  onToggleHotkeys: () => void
  onShowMain: () => void
  onNewShoe: () => void
  onQuit: () => void
}

export interface TrayController {
  update(snapshot: AppSnapshot): void
  destroy(): void
}

export function createTray(deps: TrayDeps): TrayController {
  const tray = new Tray(icon('disabled'))
  tray.setToolTip('Counter')
  tray.on('click', () => deps.onShowMain())

  // Só o que aparece no menu: reconstruir o Menu a cada carta piscaria o menu
  // aberto e custaria um objeto nativo por tecla.
  let menuSignature = ''
  let iconSignature: IconState | '' = ''

  const rebuildMenu = (snapshot: AppSnapshot): void => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Mostrar janela', click: () => deps.onShowMain() },
        {
          label: 'Overlay',
          type: 'checkbox',
          checked: snapshot.settings.overlay.visible,
          click: () => deps.onToggleOverlay()
        },
        {
          label: 'Atalhos globais',
          type: 'checkbox',
          checked: snapshot.settings.hotkeysEnabled,
          click: () => deps.onToggleHotkeys()
        },
        { type: 'separator' },
        { label: 'Novo shoe', click: () => deps.onNewShoe() },
        { type: 'separator' },
        { label: 'Sair', click: () => deps.onQuit() }
      ])
    )
  }

  return {
    update(snapshot: AppSnapshot): void {
      if (tray.isDestroyed()) return

      const state = iconState(snapshot)
      if (state !== iconSignature) {
        iconSignature = state
        tray.setImage(icon(state))
      }

      tray.setToolTip(tooltip(snapshot))

      const signature = `${String(snapshot.settings.overlay.visible)}|${String(
        snapshot.settings.hotkeysEnabled
      )}`
      if (signature !== menuSignature) {
        menuSignature = signature
        rebuildMenu(snapshot)
      }
    },
    destroy(): void {
      if (!tray.isDestroyed()) tray.destroy()
    }
  }
}
