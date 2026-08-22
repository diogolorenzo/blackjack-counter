import { HISTORY_LIMIT } from '@shared/defaults'
import type { CountingSystem, ShoeRecord } from '@shared/types'

import { readJsonFile, writeJsonFile } from './jsonFile'

const SYSTEMS: readonly CountingSystem[] = ['hilo', 'ko']

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeRecord(value: unknown): ShoeRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || raw.id === '') return null

  const system = SYSTEMS.includes(raw.system as CountingSystem)
    ? (raw.system as CountingSystem)
    : 'hilo'
  const result = typeof raw.result === 'number' && Number.isFinite(raw.result) ? raw.result : null

  return {
    id: raw.id,
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId !== '' ? raw.sessionId : null,
    system,
    deckCount: num(raw.deckCount, 6),
    startedAt: num(raw.startedAt, 0),
    endedAt: num(raw.endedAt, 0),
    cardsSeen: num(raw.cardsSeen, 0),
    maxDecisionCount: num(raw.maxDecisionCount, 0),
    minDecisionCount: num(raw.minDecisionCount, 0),
    msAtAdvantage: Math.max(0, num(raw.msAtAdvantage, 0)),
    closingRawCount: num(raw.closingRawCount, 0),
    result
  }
}

/**
 * Histórico de shoes encerrados.
 *
 * Arquivo único em vez de append de linhas: o registro é editável depois
 * (o resultado financeiro é informado quando o usuário quiser), e reescrever
 * 500 registros custa menos que manter um log com compactação.
 */
export class HistoryStore {
  private readonly filePath: string
  private records: ShoeRecord[]

  constructor(filePath: string) {
    this.filePath = filePath
    const raw = readJsonFile<unknown[]>(filePath)
    this.records = Array.isArray(raw)
      ? raw.map(sanitizeRecord).filter((record): record is ShoeRecord => record !== null)
      : []
  }

  /** Mais recentes primeiro. */
  all(): ShoeRecord[] {
    return [...this.records].sort((a, b) => b.endedAt - a.endedAt)
  }

  append(record: ShoeRecord): ShoeRecord[] {
    this.records.push(record)
    if (this.records.length > HISTORY_LIMIT) {
      this.records = this.records.sort((a, b) => a.endedAt - b.endedAt).slice(-HISTORY_LIMIT)
    }
    this.persist()
    return this.all()
  }

  /** Usado quando um "novo shoe" é desfeito: o registro não pode sobreviver ao undo. */
  remove(id: string): ShoeRecord[] {
    const before = this.records.length
    this.records = this.records.filter((record) => record.id !== id)
    if (this.records.length !== before) this.persist()
    return this.all()
  }

  setResult(id: string, result: number | null): ShoeRecord[] {
    const target = this.records.find((record) => record.id === id)
    if (target !== undefined) {
      target.result = result === null || !Number.isFinite(result) ? null : result
      this.persist()
    }
    return this.all()
  }

  clear(): ShoeRecord[] {
    this.records = []
    this.persist()
    return []
  }

  private persist(): void {
    writeJsonFile(this.filePath, this.records)
  }
}
