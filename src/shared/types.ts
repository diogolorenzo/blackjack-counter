/**
 * Contrato de tipos compartilhado entre main, preload e os dois renderers.
 *
 * Regra: este arquivo (e tudo em src/shared/) NÃO pode importar nada de
 * 'electron'. O main executa a lógica, os renderers importam só os tipos.
 */

/**
 * O app só recebe +1 / 0 / -1 pelas hotkeys, então nunca sabe o rank real da
 * carta. O domínio é de buckets, não de cartas — não existe tipo `Rank`.
 */
export type Bucket = 'low' | 'neutral' | 'high'

/** Valor Hi-Lo de um bucket. low (2-6) = +1, neutral (7-9) = 0, high (10-A) = -1. */
export type Delta = 1 | 0 | -1

export interface Entry {
  id: string
  delta: Delta
  /** epoch ms — usado só para exibição/ordenação, nunca para lógica de contagem. */
  at: number
}

export type TrueCountRounding = 'floor' | 'nearest'

export interface ShoeConfig {
  /** 1 | 2 | 4 | 6 | 8 */
  deckCount: number
  /** 0..1 — só display (barra de penetração), não entra no cálculo do true count. */
  penetration: number
  trueCountRounding: TrueCountRounding
  /** Clamp que evita divisão por zero no fim do shoe. Default 0.25. */
  minDecksRemaining: number
}

export interface BetSpreadRule {
  minTrueCount: number
  units: number
}

export type HotkeyAction = 'low' | 'neutral' | 'high' | 'undo'

export const HOTKEY_ACTIONS: readonly HotkeyAction[] = ['low', 'neutral', 'high', 'undo']

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type OverlaySize = 'small' | 'medium' | 'large'

export interface OverlaySettings {
  corner: Corner
  /** px de distância das bordas da workArea. */
  margin: number
  size: OverlaySize
  /** Travado = click-through (setIgnoreMouseEvents true). */
  locked: boolean
  visible: boolean
  /** Posição customizada vinda de arrastar. null = usar o preset de canto. */
  customPosition: { x: number; y: number } | null
  /** Quantos buckets recentes mostrar no histórico. */
  historyLength: number
  /** Mostrar valor em moeda em vez de unidades. */
  showCurrency: boolean
}

export interface Settings {
  shoe: ShoeConfig
  bindings: Record<HotkeyAction, string>
  hotkeysEnabled: boolean
  /** Ordenado por minTrueCount decrescente. Validado ao salvar. */
  betSpread: BetSpreadRule[]
  /** Valor monetário de 1 unidade, usado quando overlay.showCurrency é true. */
  unitValue: number
  overlay: OverlaySettings
}

/** Tudo que é calculado a partir de (entries, shoeConfig, betSpread). */
export interface Derived {
  runningCount: number
  cardsSeen: number
  totalCards: number
  cardsRemaining: number
  /** Já com o clamp de minDecksRemaining aplicado. */
  decksRemaining: number
  /** Sem clamp de exibição — pode ser fracionário, ex: 2.43. */
  trueCountExact: number
  /** Arredondado conforme shoe.trueCountRounding; é o que indexa o bet spread. */
  trueCountForBets: number
  betUnits: number
  /** Index play de maior valor no Hi-Lo: fazer insurance com TC >= +3. */
  insuranceOn: boolean
  penetrationReached: boolean
  shoeExhausted: boolean
}

export type HotkeyStatus = 'ok' | 'conflict' | 'disabled'

/**
 * Snapshot completo transmitido do main para todas as janelas a cada mudança.
 * Broadcast do estado inteiro (não delta): payload é pequeno e elimina toda a
 * classe de bug de dessincronização (janela aberta no meio do shoe, reload de HMR).
 */
export interface AppSnapshot {
  /** Só os mais recentes (newest-first), limitado a MAX_HISTORY. */
  recentEntries: Entry[]
  derived: Derived
  canUndo: boolean
  canRedo: boolean
  /** True quando o undo pendente desfaz um "novo shoe" em vez de uma carta. */
  undoRestoresShoe: boolean
  settings: Settings
  hotkeyStatus: Record<HotkeyAction, HotkeyStatus>
  /** null = ainda não detectado (nenhuma tecla pressionada na janela do app). */
  numLockOn: boolean | null
}

/** Quantas entradas recentes viajam no snapshot. Mantém o payload < 1KB. */
export const MAX_HISTORY = 24

export const CARDS_PER_DECK = 52
