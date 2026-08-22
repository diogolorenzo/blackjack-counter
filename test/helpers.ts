import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HistoryStore } from '../src/main/state/historyStore'
import { SessionController } from '../src/main/state/sessionController'
import { SessionStore } from '../src/main/state/sessionStore'
import { SettingsStore } from '../src/main/state/store'
import { HOTKEY_ACTIONS } from '../src/shared/types'
import type { HotkeyAction, HotkeyStatus } from '../src/shared/types'

export function tmpDir(prefix = 'counter-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function tmpFile(name = 'settings.json', prefix = 'counter-'): string {
  return join(tmpDir(prefix), name)
}

/** Preenche as ações não citadas com string vazia (= sem tecla). */
export function binds(partial: Partial<Record<HotkeyAction, string>>): Record<HotkeyAction, string> {
  const out = {} as Record<HotkeyAction, string>
  for (const action of HOTKEY_ACTIONS) out[action] = partial[action] ?? ''
  return out
}

/** Preenche as ações não citadas com 'disabled'. */
export function statuses(
  partial: Partial<Record<HotkeyAction, HotkeyStatus>>
): Record<HotkeyAction, HotkeyStatus> {
  const out = {} as Record<HotkeyAction, HotkeyStatus>
  for (const action of HOTKEY_ACTIONS) out[action] = partial[action] ?? 'disabled'
  return out
}

export interface Harness {
  dir: string
  settings: SettingsStore
  session: SessionStore
  history: HistoryStore
  controller: SessionController
}

/**
 * Controller completo com os três arquivos em um diretório temporário.
 *
 * O clock é injetável porque o controller mede tempo de vantagem e carimba os
 * registros de shoe; sem isso o teste dependeria do relógio da máquina.
 */
export function newHarness(options: { clock?: () => number; dir?: string } = {}): Harness {
  const dir = options.dir ?? tmpDir()
  const settings = new SettingsStore(join(dir, 'settings.json'))
  const session = new SessionStore(join(dir, 'session.json'))
  const history = new HistoryStore(join(dir, 'history.json'))
  const controller = new SessionController({ settings, session, history, clock: options.clock })
  return { dir, settings, session, history, controller }
}

export function newController(settings?: SettingsStore): SessionController {
  const dir = tmpDir()
  return new SessionController({
    settings: settings ?? new SettingsStore(join(dir, 'settings.json')),
    session: new SessionStore(join(dir, 'session.json')),
    history: new HistoryStore(join(dir, 'history.json'))
  })
}
