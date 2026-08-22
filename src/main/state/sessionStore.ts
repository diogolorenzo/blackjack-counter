import { SESSION_RESTORE_WINDOW_MS, SESSION_WRITE_DEBOUNCE_MS } from '@shared/defaults'
import type { CountingSystem, Delta, Entry, ShoeStats } from '@shared/types'

import { readJsonFile, removeFile, writeJsonFile } from './jsonFile'

const VERSION = 1

export interface PersistedSession {
  version: number
  savedAt: number
  system: CountingSystem
  deckCount: number
  entries: Entry[]
  stats: ShoeStats
}

export interface RestoreContext {
  system: CountingSystem
  deckCount: number
  now: number
}

function isDelta(value: unknown): value is Delta {
  return value === 1 || value === 0 || value === -1
}

function sanitizeEntries(value: unknown): Entry[] {
  if (!Array.isArray(value)) return []
  const out: Entry[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue
    const entry = raw as Record<string, unknown>
    if (!isDelta(entry.delta)) continue
    if (typeof entry.id !== 'string' || entry.id === '') continue
    const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : 0
    out.push({ id: entry.id, delta: entry.delta, at })
  }
  return out
}

function sanitizeStats(value: unknown, fallbackStartedAt: number): ShoeStats {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const num = (candidate: unknown, fallback: number): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : fallback
  return {
    startedAt: num(raw.startedAt, fallbackStartedAt),
    maxDecisionCount: num(raw.maxDecisionCount, 0),
    minDecisionCount: num(raw.minDecisionCount, 0),
    msAtAdvantage: Math.max(0, num(raw.msAtAdvantage, 0))
  }
}

/**
 * O shoe em andamento, gravado a cada carta.
 *
 * Existe por um motivo só: até aqui, um crash, um `alt+F4` sem querer ou uma
 * queda de energia no meio de um shoe de 6 baralhos apagavam a contagem inteira,
 * e ela é a única coisa no app que não pode ser recalculada.
 *
 * A pilha de undo NÃO é persistida. Ela é conveniência de digitação, não
 * estado do jogo, e serializá-la custaria uma cópia do histórico por frame.
 */
export class SessionStore {
  private readonly filePath: string
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: PersistedSession | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  /**
   * Só restaura um shoe recente E do mesmo jogo. Contagem de ontem, ou de um
   * shoe de 8 baralhos aberto agora em 6, apareceria como número plausível e
   * estaria errada — o modo de falha que este app inteiro tenta evitar.
   */
  restore(context: RestoreContext): { entries: Entry[]; stats: ShoeStats } | null {
    const saved = readJsonFile<PersistedSession>(this.filePath)
    if (saved === null || saved.version !== VERSION) return null
    if (typeof saved.savedAt !== 'number' || !Number.isFinite(saved.savedAt)) return null
    if (context.now - saved.savedAt > SESSION_RESTORE_WINDOW_MS) return null
    if (saved.system !== context.system || saved.deckCount !== context.deckCount) return null

    const entries = sanitizeEntries(saved.entries)
    if (entries.length === 0) return null

    return { entries, stats: sanitizeStats(saved.stats, saved.savedAt) }
  }

  save(session: Omit<PersistedSession, 'version'>): void {
    this.pending = { ...session, version: VERSION }
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.writeNow()
    }, SESSION_WRITE_DEBOUNCE_MS)
  }

  /** Shoe zerado não deixa arquivo para trás: um "novo shoe" apaga o rastro do anterior. */
  clear(): void {
    this.cancelTimer()
    this.pending = null
    removeFile(this.filePath)
  }

  flush(): void {
    this.cancelTimer()
    this.writeNow()
  }

  dispose(): void {
    this.flush()
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private writeNow(): void {
    const payload = this.pending
    if (payload === null) return
    this.pending = null
    writeJsonFile(this.filePath, payload)
  }
}
