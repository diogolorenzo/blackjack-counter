/**
 * Contrato de tipos compartilhado entre main, preload e os dois renderers.
 *
 * Regra: este arquivo (e tudo em src/shared/) NÃO pode importar nada de
 * 'electron'. O main executa a lógica, os renderers importam só os tipos.
 */

/**
 * O app só recebe +1 / 0 / -1 pelas hotkeys, então nunca sabe o rank real da
 * carta. O domínio é de buckets, não de cartas — o único lugar com rank de
 * verdade é o modo de treino, onde quem dá as cartas é o app.
 */
export type Bucket = 'low' | 'neutral' | 'high'

/** Valor de um bucket. Hi-Lo e KO usam o mesmo conjunto; muda quais cartas caem em cada bucket. */
export type Delta = 1 | 0 | -1

/**
 * Sistema de contagem ativo.
 *
 * - `hilo`: balanceado (a soma de um shoe completo é 0) e o número de decisão é
 *   o true count = running count / baralhos restantes.
 * - `ko` (Knock-Out): desbalanceado. Não divide por baralhos; em troca o
 *   running count começa num IRC negativo que depende do número de baralhos.
 */
export type CountingSystem = 'hilo' | 'ko'

export interface Entry {
  id: string
  delta: Delta
  /** epoch ms — usado só para exibição/ordenação, nunca para lógica de contagem. */
  at: number
}

export type TrueCountRounding = 'floor' | 'nearest'

export interface ShoeConfig {
  system: CountingSystem
  /**
   * A mesa aceita rendição tardia? Muda a estratégia básica de 15 e 16 contra
   * carta alta, e é a única regra que faz a tabela básica e os índices
   * publicados discordarem — por isso é uma configuração e não uma constante.
   */
  surrender: boolean
  /** 1 | 2 | 4 | 6 | 8 */
  deckCount: number
  /** 0..1 — só display (barra de penetração), não entra no cálculo do true count. */
  penetration: number
  trueCountRounding: TrueCountRounding
  /** Clamp que evita divisão por zero no fim do shoe. Default 0.25. */
  minDecksRemaining: number
}

export interface BetSpreadRule {
  /**
   * Piso da faixa no número de decisão do sistema ativo: true count no Hi-Lo,
   * running count no KO. O nome ficou de quando só existia Hi-Lo e é mantido
   * porque é o que está gravado no settings.json de quem já usa o app.
   */
  minTrueCount: number
  units: number
}

/** Um spread por sistema: as escalas são incomparáveis (TC ±5 vs RC -20..+8). */
export type BetSpreadsBySystem = Record<CountingSystem, BetSpreadRule[]>

export type HotkeyAction = 'low' | 'neutral' | 'high' | 'undo' | 'redo' | 'newShoe' | 'toggleOverlay'

export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  'low',
  'neutral',
  'high',
  'undo',
  'redo',
  'newShoe',
  'toggleOverlay'
]

/**
 * Ações que podem ficar SEM tecla. As quatro originais sempre têm bind (ficar
 * sem tecla de contagem torna o app inútil); as três novas custam teclas do
 * sistema inteiro, então entram desligadas e o usuário escolhe se quer pagar
 * esse preço.
 */
export const OPTIONAL_HOTKEY_ACTIONS: readonly HotkeyAction[] = ['redo', 'newShoe', 'toggleOverlay']

export function isOptionalHotkeyAction(action: HotkeyAction): boolean {
  return OPTIONAL_HOTKEY_ACTIONS.includes(action)
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type OverlaySize = 'small' | 'medium' | 'large'

/** `minimal` mostra só o número de decisão e a aposta, em corpo grande. */
export type OverlayLayout = 'full' | 'minimal'

/** `colorblind` troca verde/vermelho por azul/laranja (deuteranopia/protanopia). */
export type Palette = 'default' | 'colorblind'

/** Como a aba de desvios se apresenta. */
export type DeviationsLayout = 'list' | 'matrix'

/**
 * Um jogo de teclas salvo pelo usuário.
 *
 * `bindings` null = slot vazio. Os slots existem sempre (nunca somem da UI)
 * para que salvar seja um clique só, sem passar por "criar perfil" antes.
 */
export interface BindingProfile {
  id: string
  name: string
  bindings: Record<HotkeyAction, string> | null
}

/**
 * O que toda janela de overlay tem em comum: onde fica, quanto aparece e se
 * come clique. Compartilhado porque contagem e jogada são a mesma janela em
 * tudo que não seja conteúdo.
 */
export interface OverlayPlacement {
  corner: Corner
  /** px de distância das bordas da workArea. */
  margin: number
  /** 0.2..1 — opacidade do fundo do overlay. O texto continua opaco. */
  opacity: number
  /** Travado = click-through (setIgnoreMouseEvents true), sem arrastar e sem alça. */
  locked: boolean
  visible: boolean
  /** Posição customizada vinda de arrastar. null = usar o preset de canto. */
  customPosition: { x: number; y: number } | null
  /** Tamanho vindo do arrasto da alça. null = usar o preset de tamanho. */
  customSize: { width: number; height: number } | null
}

export interface OverlaySettings extends OverlayPlacement {
  size: OverlaySize
  layout: OverlayLayout
  /** Quantos buckets recentes mostrar no histórico. */
  historyLength: number
  /** Mostrar valor em moeda em vez de unidades. */
  showCurrency: boolean
}

/** `guide` mostra só o que a contagem mudou; `matrix` é o chart completo. */
export type StrategyOverlayLayout = 'guide' | 'matrix'

export interface StrategyOverlaySettings extends OverlayPlacement {
  size: OverlaySize
  layout: StrategyOverlayLayout
}

export interface FeedbackSettings {
  /** Tick curto a cada tecla registrada durante o jogo. */
  sound: boolean
  /** 0..1 */
  volume: number
  /** Flash na borda do overlay a cada tecla registrada. */
  flash: boolean
  /**
   * Som no modo de treino. Separado do som de jogo: no treino o áudio é
   * retorno de aprendizado (acertou/errou) e faz sentido mesmo para quem joga
   * no silêncio.
   */
  drillSound: boolean
}

export interface BankrollSettings {
  /** Banca total na moeda configurada. 0 = não informada. */
  amount: number
  /** Mãos por hora, usado para converter EV por mão em EV por hora. */
  handsPerHour: number
  /** Risco de ruína alvo (0..1) usado para sugerir o tamanho da unidade. */
  targetRiskOfRuin: number
}

export interface CurrencySettings {
  /** ISO 4217, ex: BRL, USD, EUR. */
  code: string
  /** BCP 47, ex: pt-BR, en-US. */
  locale: string
}

export interface Settings {
  shoe: ShoeConfig
  bindings: Record<HotkeyAction, string>
  hotkeysEnabled: boolean
  /** Cada um ordenado por minTrueCount decrescente. Validado ao salvar. */
  betSpreads: BetSpreadsBySystem
  /** Valor monetário de 1 unidade. */
  unitValue: number
  currency: CurrencySettings
  bankroll: BankrollSettings
  feedback: FeedbackSettings
  palette: Palette
  deviationsLayout: DeviationsLayout
  /** Slots de teclas salvos pelo usuário. Tamanho fixo. */
  bindingProfiles: BindingProfile[]
  overlay: OverlaySettings
  strategyOverlay: StrategyOverlaySettings
}

/** Tudo que é calculado a partir de (entries, shoeConfig, betSpread). */
export interface Derived {
  /** Já com o IRC do sistema aplicado. No Hi-Lo o IRC é 0, então é a soma pura. */
  runningCount: number
  /** Soma pura dos deltas, sem IRC. Num sistema balanceado o shoe completo fecha em 0. */
  rawCount: number
  cardsSeen: number
  totalCards: number
  cardsRemaining: number
  /** Já com o clamp de minDecksRemaining aplicado. */
  decksRemaining: number
  /** Sem clamp de exibição — pode ser fracionário, ex: 2.43. null em sistema desbalanceado. */
  trueCountExact: number | null
  /** O número que indexa bet spread e desvios: TC arredondado no Hi-Lo, running count no KO. */
  decisionCount: number
  betUnits: number
  /** Vantagem do jogador em pontos percentuais. null quando o sistema não tem modelo de edge. */
  advantagePct: number | null
  /** EV da mão atual em unidades (aposta × vantagem). null junto com advantagePct. */
  evPerHandUnits: number | null
  /** Index play de maior valor: insurance a partir do índice do sistema. */
  insuranceOn: boolean
  penetrationReached: boolean
  shoeExhausted: boolean
}

export type HotkeyStatus = 'ok' | 'conflict' | 'disabled'

/** Estatísticas do shoe em andamento, acumuladas pelo controller. */
export interface ShoeStats {
  startedAt: number
  maxDecisionCount: number
  minDecisionCount: number
  /** ms acumulados com o número de decisão em zona de vantagem. */
  msAtAdvantage: number
}

/**
 * Sessão de jogo.
 *
 * Enquanto não estiver ativa, nenhum shoe vai para o histórico: teste,
 * configuração e demonstração não podem virar estatística de banca.
 */
export interface SessionState {
  active: boolean
  /** Identidade da sessão em curso; carimbada em cada shoe encerrado. */
  id: string | null
  startedAt: number | null
  /** Shoes já encerrados nesta sessão. */
  shoes: number
}

/** Um shoe encerrado, gravado no histórico. */
export interface ShoeRecord {
  id: string
  /** Sessão a que o shoe pertence. */
  sessionId: string | null
  system: CountingSystem
  deckCount: number
  startedAt: number
  endedAt: number
  cardsSeen: number
  maxDecisionCount: number
  minDecisionCount: number
  msAtAdvantage: number
  /** Soma pura dos deltas no fim. Num sistema balanceado, != 0 indica carta perdida ou erro. */
  closingRawCount: number
  /** Resultado financeiro informado pelo usuário. null = não informado. */
  result: number | null
}

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
  /** O shoe atual veio do disco depois de um encerramento não planejado. */
  sessionRestored: boolean
  session: SessionState
  shoeStats: ShoeStats
  /** Incrementa a cada carta aplicada. As janelas usam para disparar feedback sem diffar o histórico. */
  applyTick: number
  /** O bucket da última carta aplicada; acompanha applyTick. */
  lastBucket: Bucket | null
}

/** Quantas entradas recentes viajam no snapshot. Mantém o payload < 1KB. */
export const MAX_HISTORY = 24

export const CARDS_PER_DECK = 52

/** A partir daqui o jogador tem vantagem — usado no tempo de vantagem e no tom da bandeja. */
export const ADVANTAGE_COUNT = 2
