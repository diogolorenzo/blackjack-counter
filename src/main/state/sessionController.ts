import { randomUUID } from 'node:crypto'

import { CountingSession } from '@shared/domain/session'
import { computeDerived } from '@shared/domain/shoe'
import type { DeepPartial, HotkeyStatusMap } from '@shared/ipc'
import { MAX_HISTORY } from '@shared/types'
import type { AppSnapshot, Delta, Settings } from '@shared/types'

import type { SettingsStore } from './store'

/** Nada foi registrado ainda quando o controller nasce; o HotkeyManager corrige no boot. */
function allDisabled(): HotkeyStatusMap {
  return { low: 'disabled', neutral: 'disabled', high: 'disabled', undo: 'disabled' }
}

/**
 * Única fonte da verdade do estado do app.
 *
 * Toda mutação recalcula o AppSnapshot INTEIRO e o entrega aos assinantes, que
 * o transmitem para as duas janelas. Broadcast do estado completo em vez de
 * delta: o payload é pequeno e não existe caminho para janela principal e
 * overlay divergirem.
 *
 * É aqui — e só aqui — que id e relógio entram no domínio. CountingSession é
 * puro de propósito; injetar randomUUID/Date.now nesta camada é o que mantém o
 * cálculo testável sem mock de tempo.
 */
export class SessionController {
  private readonly store: SettingsStore
  private readonly session = new CountingSession()
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>()
  private hotkeyStatus: HotkeyStatusMap = allDisabled()
  private numLockOn: boolean | null = null
  private snapshot: AppSnapshot

  constructor(store: SettingsStore) {
    this.store = store
    this.snapshot = this.build()
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot
  }

  apply(delta: Delta): AppSnapshot {
    this.session.apply(delta, { id: randomUUID(), at: Date.now() })
    return this.commit()
  }

  undo(): AppSnapshot {
    return this.session.undo() ? this.commit() : this.snapshot
  }

  redo(): AppSnapshot {
    return this.session.redo() ? this.commit() : this.snapshot
  }

  newShoe(): AppSnapshot {
    this.session.newShoe()
    return this.commit()
  }

  /** Recalcula o derivado junto: trocar deckCount muda o true count sem carta nova. */
  updateSettings(patch: DeepPartial<Settings>): AppSnapshot {
    this.store.update(patch)
    return this.commit()
  }

  setHotkeyStatus(map: HotkeyStatusMap): AppSnapshot {
    this.hotkeyStatus = { ...map }
    return this.commit()
  }

  setNumLock(on: boolean): AppSnapshot {
    // O renderer reporta a cada tecla; sem esta guarda seria um broadcast por
    // keypress para as duas janelas.
    if (this.numLockOn === on) return this.snapshot
    this.numLockOn = on
    return this.commit()
  }

  /** Assina mudanças. Devolve unsubscribe. */
  onChange(cb: (snapshot: AppSnapshot) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private build(): AppSnapshot {
    const settings = this.store.get()
    return {
      recentEntries: this.session.recent(MAX_HISTORY),
      derived: computeDerived(this.session.entries, settings.shoe, settings.betSpread),
      canUndo: this.session.canUndo,
      canRedo: this.session.canRedo,
      undoRestoresShoe: this.session.undoRestoresShoe,
      settings,
      hotkeyStatus: this.hotkeyStatus,
      numLockOn: this.numLockOn
    }
  }

  private commit(): AppSnapshot {
    this.snapshot = this.build()
    // Cópia da lista: um listener pode se desinscrever durante o próprio emit.
    for (const listener of [...this.listeners]) {
      try {
        listener(this.snapshot)
      } catch {
        // Janela destruída no meio do broadcast não pode impedir a outra de
        // receber o snapshot.
      }
    }
    return this.snapshot
  }
}
