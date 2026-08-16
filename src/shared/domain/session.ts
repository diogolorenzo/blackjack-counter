import type { Delta, Entry } from '../types'

/** `entries` é o array de ANTES da operação; `op` diz o que aquele frame desfaz. */
type UndoFrame = { entries: Entry[]; op: 'apply' | 'newShoe' }

/**
 * Teto da pilha de undo. 250 frames cobrem um shoe de 8 baralhos inteiro (416
 * cartas seriam demais para qualquer correção plausível) e travam o consumo de
 * memória, já que cada frame guarda uma referência ao array inteiro.
 */
const UNDO_LIMIT = 250

/**
 * Histórico de cartas de um shoe, com undo/redo.
 *
 * Puro de propósito: não gera id nem lê o relógio — quem chama injeta os dois em
 * `apply`. Isso é o que torna o domínio testável sem mock de tempo.
 *
 * O array de entries nunca é mutado no lugar; toda operação troca a referência.
 * Por isso um frame pode guardar a referência antiga sem copiar nada.
 */
export class CountingSession {
  private items: Entry[]
  private readonly undoStack: UndoFrame[] = []
  private readonly redoStack: UndoFrame[] = []

  constructor(entries: Entry[] = []) {
    this.items = [...entries]
  }

  get entries(): readonly Entry[] {
    return this.items
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** true quando o próximo undo desfaz um "novo shoe" em vez de uma carta. */
  get undoRestoresShoe(): boolean {
    const top = this.undoStack[this.undoStack.length - 1]
    return top !== undefined && top.op === 'newShoe'
  }

  /** id e at são INJETADOS — o domínio é puro, não chama Date.now nem crypto. */
  apply(delta: Delta, meta: { id: string; at: number }): void {
    this.pushUndoFrame('apply')
    this.items = [...this.items, { id: meta.id, delta, at: meta.at }]
  }

  undo(): boolean {
    const frame = this.undoStack.pop()
    if (frame === undefined) return false
    this.redoStack.push({ entries: this.items, op: frame.op })
    this.items = frame.entries
    return true
  }

  redo(): boolean {
    const frame = this.redoStack.pop()
    if (frame === undefined) return false
    this.undoStack.push({ entries: this.items, op: frame.op })
    this.items = frame.entries
    return true
  }

  newShoe(): void {
    this.pushUndoFrame('newShoe')
    this.items = []
  }

  /** Mais recentes primeiro. */
  recent(limit: number): Entry[] {
    if (limit <= 0) return []
    return this.items.slice(Math.max(0, this.items.length - limit)).reverse()
  }

  private pushUndoFrame(op: UndoFrame['op']): void {
    this.undoStack.push({ entries: this.items, op })
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
    this.redoStack.length = 0
  }
}
