import { randomUUID } from 'node:crypto'

import { CountingSession } from '@shared/domain/session'
import { computeDerived } from '@shared/domain/shoe'
import { deltaToBucket } from '@shared/format'
import type { DeepPartial, HotkeyStatusMap } from '@shared/ipc'
import { ADVANTAGE_COUNT, HOTKEY_ACTIONS, MAX_HISTORY } from '@shared/types'
import type {
  AppSnapshot,
  Bucket,
  Delta,
  SessionState,
  Settings,
  ShoeRecord,
  ShoeStats
} from '@shared/types'

import type { HistoryStore } from './historyStore'
import type { SessionStore } from './sessionStore'
import { activeBetSpread } from './store'
import type { SettingsStore } from './store'

/** Nada foi registrado ainda quando o controller nasce; o HotkeyManager corrige no boot. */
function allDisabled(): HotkeyStatusMap {
  const out = {} as HotkeyStatusMap
  for (const action of HOTKEY_ACTIONS) out[action] = 'disabled'
  return out
}

function freshStats(now: number): ShoeStats {
  return { startedAt: now, maxDecisionCount: 0, minDecisionCount: 0, msAtAdvantage: 0 }
}

function idleSession(): SessionState {
  return { active: false, id: null, startedAt: null, shoes: 0 }
}

/**
 * O que um "novo shoe" desfeito precisa devolver: o registro que foi para o
 * histórico e as estatísticas de antes. Sem isto, desfazer a troca de shoe
 * deixaria um shoe fantasma gravado.
 */
interface ShoeFrame {
  /** null quando o shoe encerrado não tinha carta nenhuma e não virou registro. */
  record: ShoeRecord | null
  statsBefore: ShoeStats
  advantageSinceBefore: number | null
  statsAfter: ShoeStats
}

/** Frames de troca de shoe guardados para undo. Poucos: mais que isso é histórico, não correção. */
const SHOE_FRAME_LIMIT = 8

export interface SessionControllerDeps {
  settings: SettingsStore
  session: SessionStore
  history: HistoryStore
  /** Injetável para teste: todo o tempo do controller passa por aqui. */
  clock?: () => number
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
 * puro de propósito; injetar randomUUID/clock nesta camada é o que mantém o
 * cálculo testável sem mock de tempo.
 */
export class SessionController {
  private readonly store: SettingsStore
  private readonly sessionStore: SessionStore
  private readonly history: HistoryStore
  private readonly clock: () => number
  private readonly session: CountingSession
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>()
  private hotkeyStatus: HotkeyStatusMap = allDisabled()
  private numLockOn: boolean | null = null
  private stats: ShoeStats
  /** Instante em que o count entrou em zona de vantagem. null = fora dela. */
  private advantageSince: number | null = null
  private shoeFrames: ShoeFrame[] = []
  private redoShoeFrames: ShoeFrame[] = []
  private restored = false
  /**
   * Sessão em memória, de propósito: ela marca "estou jogando de verdade agora",
   * e sobreviver a um reinício faria o app continuar gravando estatística de uma
   * sessão que o usuário já abandonou. O banner na aba Sessões deixa o estado
   * visível o tempo todo.
   */
  private sessionState: SessionState = idleSession()
  private applyTick = 0
  private lastBucket: Bucket | null = null
  private snapshot: AppSnapshot

  constructor(deps: SessionControllerDeps) {
    this.store = deps.settings
    this.sessionStore = deps.session
    this.history = deps.history
    this.clock = deps.clock ?? (() => Date.now())

    const now = this.clock()
    const settings = this.store.get()
    const recovered = this.sessionStore.restore({
      system: settings.shoe.system,
      deckCount: settings.shoe.deckCount,
      now
    })

    this.session = new CountingSession(recovered?.entries ?? [])
    this.stats = recovered?.stats ?? freshStats(now)
    this.restored = recovered !== null

    this.snapshot = this.build()
    // O estado recuperado já reflete um count possivelmente em vantagem; sem
    // esta chamada o cronômetro de vantagem só começaria na próxima carta.
    this.syncAdvantageClock(now)
  }

  getSnapshot(): AppSnapshot {
    return this.snapshot
  }

  apply(delta: Delta): AppSnapshot {
    this.session.apply(delta, { id: randomUUID(), at: this.clock() })
    // Uma carta nova invalida o redo do domínio; os frames de shoe têm que cair
    // junto, senão um redo posterior regravaria um shoe que não existe mais.
    this.redoShoeFrames = []
    this.applyTick++
    this.lastBucket = deltaToBucket(delta)
    return this.commit()
  }

  undo(): AppSnapshot {
    const restoresShoe = this.session.undoRestoresShoe
    if (!this.session.undo()) return this.snapshot
    if (restoresShoe) {
      const frame = this.shoeFrames.pop()
      if (frame !== undefined) {
        if (frame.record !== null) {
          this.history.remove(frame.record.id)
          this.sessionState = {
            ...this.sessionState,
            shoes: Math.max(0, this.sessionState.shoes - 1)
          }
        }
        this.stats = frame.statsBefore
        this.advantageSince = frame.advantageSinceBefore
        this.redoShoeFrames.push(frame)
      }
    }
    return this.commit()
  }

  redo(): AppSnapshot {
    const appliesShoe = this.session.redoAppliesShoe
    if (!this.session.redo()) return this.snapshot
    if (appliesShoe) {
      const frame = this.redoShoeFrames.pop()
      if (frame !== undefined) {
        if (frame.record !== null) {
          this.history.append(frame.record)
          this.sessionState = { ...this.sessionState, shoes: this.sessionState.shoes + 1 }
        }
        this.stats = frame.statsAfter
        this.advantageSince = null
        this.shoeFrames.push(frame)
      }
    }
    return this.commit()
  }

  /** Encerra o shoe atual (grava no histórico) e começa outro do zero. */
  newShoe(): AppSnapshot {
    const now = this.clock()
    const record = this.closeShoe(now)
    const statsBefore = this.stats
    const advantageSinceBefore = this.advantageSince
    const statsAfter = freshStats(now)

    this.session.newShoe()
    this.stats = statsAfter
    this.advantageSince = null
    this.redoShoeFrames = []
    // O shoe recuperado deixou de existir; o aviso perderia o sentido.
    this.restored = false

    this.shoeFrames.push({ record, statsBefore, advantageSinceBefore, statsAfter })
    if (this.shoeFrames.length > SHOE_FRAME_LIMIT) this.shoeFrames.shift()

    if (record !== null) {
      this.history.append(record)
      this.sessionState = { ...this.sessionState, shoes: this.sessionState.shoes + 1 }
    }
    this.sessionStore.clear()

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

  /**
   * Abre uma sessão. Só a partir daqui os shoes encerrados viram registro.
   *
   * Sem isto, todo teste de tecla e toda conferência de configuração entrariam
   * no histórico e contaminariam o resultado que o usuário usa para decidir
   * banca.
   */
  startSession(): AppSnapshot {
    if (this.sessionState.active) return this.snapshot
    this.sessionState = { active: true, id: randomUUID(), startedAt: this.clock(), shoes: 0 }
    return this.commit()
  }

  endSession(): AppSnapshot {
    if (!this.sessionState.active) return this.snapshot
    this.sessionState = idleSession()
    return this.commit()
  }

  acknowledgeRestore(): AppSnapshot {
    if (!this.restored) return this.snapshot
    this.restored = false
    return this.commit()
  }

  getHistory(): ShoeRecord[] {
    return this.history.all()
  }

  setShoeResult(id: string, result: number | null): ShoeRecord[] {
    return this.history.setResult(id, result)
  }

  clearHistory(): ShoeRecord[] {
    return this.history.clear()
  }

  /** Assina mudanças. Devolve unsubscribe. */
  onChange(cb: (snapshot: AppSnapshot) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  /** Grava o shoe em andamento antes de morrer. */
  flush(): void {
    this.persistSession()
    this.sessionStore.flush()
  }

  private closeShoe(now: number): ShoeRecord | null {
    const derived = this.snapshot.derived
    if (derived.cardsSeen === 0) return null
    // Fora de sessão o shoe acontece normalmente; ele só não vira estatística.
    if (!this.sessionState.active) return null

    const settings = this.store.get()
    const msAtAdvantage =
      this.stats.msAtAdvantage +
      (this.advantageSince === null ? 0 : Math.max(0, now - this.advantageSince))

    return {
      id: randomUUID(),
      sessionId: this.sessionState.id,
      system: settings.shoe.system,
      deckCount: settings.shoe.deckCount,
      startedAt: this.stats.startedAt,
      endedAt: now,
      cardsSeen: derived.cardsSeen,
      maxDecisionCount: this.stats.maxDecisionCount,
      minDecisionCount: this.stats.minDecisionCount,
      msAtAdvantage,
      closingRawCount: derived.rawCount,
      result: null
    }
  }

  /**
   * Abre ou fecha o intervalo de vantagem conforme o count atual.
   *
   * O tempo é medido por intervalo, não por amostra: contar "quantas cartas
   * caíram com TC alto" mediria a velocidade do dealer, não o tempo em que
   * valeu a pena estar na mesa.
   */
  private syncAdvantageClock(now: number): void {
    const inAdvantage = this.snapshot.derived.decisionCount >= ADVANTAGE_COUNT
    if (inAdvantage && this.advantageSince === null) {
      this.advantageSince = now
      return
    }
    if (!inAdvantage && this.advantageSince !== null) {
      this.stats.msAtAdvantage += Math.max(0, now - this.advantageSince)
      this.advantageSince = null
    }
  }

  private persistSession(): void {
    const settings = this.store.get()
    const entries = this.session.entries
    if (entries.length === 0) {
      this.sessionStore.clear()
      return
    }
    this.sessionStore.save({
      savedAt: this.clock(),
      system: settings.shoe.system,
      deckCount: settings.shoe.deckCount,
      entries: [...entries],
      stats: { ...this.stats }
    })
  }

  private build(): AppSnapshot {
    const settings = this.store.get()
    return {
      recentEntries: this.session.recent(MAX_HISTORY),
      derived: computeDerived(this.session.entries, settings.shoe, activeBetSpread(settings)),
      canUndo: this.session.canUndo,
      canRedo: this.session.canRedo,
      undoRestoresShoe: this.session.undoRestoresShoe,
      settings,
      hotkeyStatus: this.hotkeyStatus,
      numLockOn: this.numLockOn,
      sessionRestored: this.restored,
      session: { ...this.sessionState },
      shoeStats: { ...this.stats },
      applyTick: this.applyTick,
      lastBucket: this.lastBucket
    }
  }

  private commit(): AppSnapshot {
    const now = this.clock()
    this.snapshot = this.build()

    const decisionCount = this.snapshot.derived.decisionCount
    if (decisionCount > this.stats.maxDecisionCount) this.stats.maxDecisionCount = decisionCount
    if (decisionCount < this.stats.minDecisionCount) this.stats.minDecisionCount = decisionCount
    this.syncAdvantageClock(now)
    // As estatísticas mudaram depois do build; refaz para o snapshot sair coerente.
    this.snapshot = { ...this.snapshot, shoeStats: { ...this.stats } }

    this.persistSession()

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
