import { globalShortcut } from 'electron'
import { performance } from 'node:perf_hooks'
import { HOTKEY_ACTIONS } from '@shared/types'
import type { HotkeyAction } from '@shared/types'
import { HOTKEY_REPEAT_DEBOUNCE_MS } from '@shared/defaults'
import type { HotkeyStatusMap } from '@shared/ipc'

function allDisabled(): HotkeyStatusMap {
  const out = {} as HotkeyStatusMap
  for (const action of HOTKEY_ACTIONS) out[action] = 'disabled'
  return out
}

/**
 * Dono exclusivo do globalShortcut do app.
 *
 * O que este módulo deliberadamente NÃO faz: validar se a tecla vai mesmo
 * disparar. Medido em spike (Windows 11 / ABNT2): register('num1') devolve true
 * com o NumLock desligado e a tecla nunca dispara. O retorno de register() não é
 * prova de nada além de "o SO aceitou reservar o acelerador". Detectar essa
 * armadilha é da UI, via isNumLockDependent + AppSnapshot.numLockOn.
 */
export class HotkeyManager {
  private readonly onAction: (action: HotkeyAction) => void
  private bindings: Record<HotkeyAction, string> | null = null
  private enabled = false
  private capturing = false
  private disposed = false
  /** Instante do último EVENTO de cada ação — inclusive os descartados. */
  private readonly lastEventAt = new Map<HotkeyAction, number>()

  constructor(onAction: (action: HotkeyAction) => void) {
    this.onAction = onAction
  }

  apply(bindings: Record<HotkeyAction, string>, enabled: boolean): HotkeyStatusMap {
    this.bindings = { ...bindings }
    this.enabled = enabled
    if (this.disposed) return allDisabled()

    const status = this.registerAll()

    // Em modo de captura o registro acima serviu só para descobrir conflitos:
    // o app não pode segurar nenhuma tecla enquanto a UI espera a do usuário.
    // Registrar e soltar é seguro porque tudo aqui é síncrono — nenhum atalho
    // consegue disparar no meio deste bloco.
    if (this.capturing) globalShortcut.unregisterAll()

    return status
  }

  setCaptureMode(capturing: boolean): void {
    if (this.disposed || capturing === this.capturing) return
    this.capturing = capturing
    if (capturing) {
      globalShortcut.unregisterAll()
      return
    }
    this.registerAll()
  }

  dispose(): void {
    this.disposed = true
    this.bindings = null
    this.lastEventAt.clear()
    globalShortcut.unregisterAll()
  }

  private registerAll(): HotkeyStatusMap {
    globalShortcut.unregisterAll()

    const status = allDisabled()
    const bindings = this.bindings
    if (!this.enabled || bindings === null) return status

    const taken = new Set<string>()
    for (const action of HOTKEY_ACTIONS) {
      // Ação opcional sem tecla: fica 'disabled' e não consome nada do sistema.
      const accelerator = (bindings[action] ?? '').trim()
      if (accelerator === '') continue

      const normalized = accelerator.toLowerCase()
      if (taken.has(normalized)) {
        // Duas ações na mesma tecla: o segundo register() sobrescreveria o
        // callback do primeiro em silêncio.
        status[action] = 'conflict'
        continue
      }

      // try/catch POR AÇÃO: acelerador malformado faz o Electron lançar, e uma
      // bind ruim não pode impedir o registro das outras três.
      let registered = false
      try {
        registered = globalShortcut.register(accelerator, () => this.handle(action))
      } catch {
        registered = false
      }

      status[action] = registered ? 'ok' : 'conflict'
      if (registered) taken.add(normalized)
    }

    return status
  }

  private handle(action: HotkeyAction): void {
    if (this.disposed) return

    const now = performance.now()
    const previous = this.lastEventAt.get(action)
    // A marca é atualizada mesmo no descarte: o auto-repeat do Windows é um
    // trem de eventos com intervalo menor que a janela, então cada repetição
    // empurra a janela para frente e o trem inteiro morre na primeira batida.
    // Uma segunda batida humana de verdade exige soltar e reapertar a tecla,
    // o que deixa a janela expirar.
    this.lastEventAt.set(action, now)
    if (previous !== undefined && now - previous < HOTKEY_REPEAT_DEBOUNCE_MS) return

    this.onAction(action)
  }
}
