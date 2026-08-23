import type { Size, SizeLimits } from './domain/overlaySize'
import type {
  BetSpreadRule,
  BetSpreadsBySystem,
  BindingProfile,
  HotkeyAction,
  OverlaySize,
  Settings
} from './types'

/**
 * O piso é -99, não -Infinity: as settings vão para JSON, e JSON.stringify
 * serializa Infinity como `null`, o que corromperia a regra base no reload.
 * -99 é inalcançável na prática (o TC extremo de um shoe de 8 baralhos é ~±20,
 * e o running count do KO parte no máximo de -28).
 */
export const BET_SPREAD_FLOOR = -99

/**
 * Bet spread padrão do Hi-Lo para 6 baralhos, S17/DAS, spread 1-12.
 *
 * Racional: a vantagem Hi-Lo do jogador ≈ 0.5% × (TC - 1). Kelly manda apostar
 * `edge / variance`, e a variância do blackjack ≈ 1.3, então a aposta ótima
 * escala quase linearmente em (TC - 1). A escada 1-2-4-8-12 segue essa rampa e
 * trava em 12 — spreads maiores é onde se chama atenção, então o teto é
 * deliberado e não matemático.
 *
 * Sempre ordenado por minTrueCount decrescente: o lookup pega a primeira regra
 * cujo minTrueCount seja <= o número de decisão.
 */
export const DEFAULT_BET_SPREAD: BetSpreadRule[] = [
  { minTrueCount: 5, units: 12 },
  { minTrueCount: 4, units: 8 },
  { minTrueCount: 3, units: 4 },
  { minTrueCount: 2, units: 2 },
  { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
]

/**
 * Rampa padrão do KO, ancorada no PIVÔ (+4) e não no true count.
 *
 * O IRC do KO desloca o running count para que o pivô caia sempre em +4
 * qualquer que seja o número de baralhos, então a rampa é escrita em torno
 * dele. Isto é uma aproximação razoável, não uma tabela publicada: confira
 * contra as regras da sua mesa antes de apostar por ela.
 */
export const DEFAULT_KO_BET_SPREAD: BetSpreadRule[] = [
  { minTrueCount: 6, units: 12 },
  { minTrueCount: 4, units: 8 },
  { minTrueCount: 2, units: 4 },
  { minTrueCount: 0, units: 2 },
  { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
]

export const DEFAULT_BET_SPREADS: BetSpreadsBySystem = {
  hilo: DEFAULT_BET_SPREAD,
  ko: DEFAULT_KO_BET_SPREAD
}

/**
 * F1-F4: tecla ÚNICA, adjacentes, e existem em qualquer teclado — inclusive
 * sem bloco numérico. A ordem F1->F3 acompanha o valor da carta (baixa, neutra,
 * alta), então a mão fica parada e o dedo só anda para o lado.
 *
 * Medido por spike nesta máquina (Windows 11, ABNT2), emulando a tecla física
 * por scan code com o Notepad em foco: F1, F2, F3, F4, Ctrl+Shift+N e Alt+N
 * registram E disparam. A escolha por tecla única em vez de combo é deliberada
 * — um acorde de 3 teclas por carta é lento demais para acompanhar o dealer.
 *
 * Contrapartida assumida: enquanto o app estiver rodando com as hotkeys
 * ligadas, F1-F4 pertencem a ele no sistema inteiro (F1 não abre mais a ajuda
 * de outros programas). É reversível pelo toggle de hotkeys e por rebind.
 *
 * As quatro ações opcionais nascem SEM tecla: cada bind global custa uma tecla do
 * sistema inteiro, e refazer/novo shoe/overlays não valem esse preço para quem
 * não pediu. String vazia = não atribuída.
 *
 * NÃO usar Ctrl+Alt+ como default: em teclado ABNT2 (pt-BR) o AltGr É
 * literalmente Ctrl+Alt, e registrar essas combinações quebraria a digitação de
 * `/`, `°`, `₢` no sistema inteiro.
 */
export const DEFAULT_BINDINGS = {
  low: 'F1',
  neutral: 'F2',
  high: 'F3',
  undo: 'F4',
  redo: '',
  newShoe: '',
  toggleOverlay: '',
  toggleStrategyOverlay: ''
} as const satisfies Record<HotkeyAction, string>

/**
 * Perfis prontos oferecidos na tela de ajustes. Cobrem só as quatro ações de
 * contagem; as opcionais ficam como o usuário deixou. Tudo continua rebindável
 * tecla a tecla.
 *
 * O perfil de numpad usa as teclas de OPERADOR, não os dígitos. Spike na mesma
 * máquina, emulando a tecla física por scan code:
 *
 *   tecla física     register()   NumLock OFF   NumLock ON
 *   numpad 1         true         NÃO dispara   dispara
 *   numpad / * - +   true         dispara       dispara
 *
 * Os dígitos (num0-num9) mapeiam para VK_NUMPAD*, que só existem com NumLock
 * LIGADO — com ele desligado a tecla física emite End/Down/Insert e o hotkey
 * morre EM SILÊNCIO, porque register() devolve true de qualquer jeito. Os
 * operadores mapeiam para VK_DIVIDE/MULTIPLY/SUBTRACT/ADD, imunes ao NumLock.
 */
export const BINDING_PRESETS = [
  {
    id: 'fkeys',
    label: 'Teclas F',
    hint: 'Padrão — tecla única, funciona em qualquer teclado',
    bindings: { low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }
  },
  {
    id: 'numpad',
    label: 'Numpad',
    hint: 'Uma mão só. Usa + − * / porque os dígitos morrem com NumLock desligado',
    bindings: { low: 'numadd', neutral: 'nummult', high: 'numsub', undo: 'numdiv' }
  },
  {
    id: 'modifiers',
    label: 'Ctrl+Shift',
    hint: 'Mais lento de digitar, mas não toma nenhuma tecla do sistema',
    bindings: {
      low: 'Ctrl+Shift+1',
      neutral: 'Ctrl+Shift+2',
      high: 'Ctrl+Shift+3',
      undo: 'Ctrl+Shift+0'
    }
  }
] as const satisfies readonly {
  id: string
  label: string
  hint: string
  bindings: Partial<Record<HotkeyAction, string>>
}[]

/**
 * Aceleradores que só disparam com NumLock LIGADO — mapeiam para VK_NUMPAD*.
 * Os defaults evitam todos eles, mas o usuário pode rebindar para cá, e aí a UI
 * precisa avisar (ver AppSnapshot.numLockOn). Comprovado por spike; register()
 * devolve true mesmo quando a tecla nunca vai disparar.
 */
const NUMLOCK_DEPENDENT = new Set([
  'num0', 'num1', 'num2', 'num3', 'num4',
  'num5', 'num6', 'num7', 'num8', 'num9',
  'numdec'
])

export function isNumLockDependent(accelerator: string): boolean {
  return NUMLOCK_DEPENDENT.has(accelerator.trim().toLowerCase())
}

export const OVERLAY_SIZES: Record<OverlaySize, { width: number; height: number }> = {
  small: { width: 190, height: 116 },
  medium: { width: 232, height: 150 },
  large: { width: 288, height: 188 }
}

/**
 * A moldura arredondada dos dois overlays tem 1px de borda de cada lado, e ela
 * fica FORA do elemento com `zoom`: o espaço de desenho é a janela menos 2px em
 * cada eixo. Sem descontar, um preset que seja o canvas em escala 1,0
 * transborda exatamente a espessura da borda.
 */
export const STRATEGY_OVERLAY_CARD_BORDER = 2

/**
 * Tamanho intrínseco do overlay de jogada, em px de canvas — o que a janela
 * escala por `zoom` até caber.
 *
 * Derivado dos tamanhos que os elementos do HandRound especificam (não medido
 * em Chromium — reconferir contra o app rodando é o passo seguinte fora desta
 * task). A PROPORÇÃO é o que importa aqui: os presets de STRATEGY_OVERLAY_SIZES
 * dependem dela — um preset mais baixo que height/width corta o layout embaixo,
 * e como o contêiner é overflow-hidden o corte não deixa nenhum sinal na tela.
 */
export const STRATEGY_HAND_CANVAS: Size = { width: 240, height: 200 }

/**
 * Um só conjunto de presets: o overlay de jogada tem um layout só. Todos seguem
 * a proporção de STRATEGY_HAND_CANVAS; `medium` é o canvas em tamanho natural.
 */
export const STRATEGY_OVERLAY_SIZES: Record<OverlaySize, Size> = {
  small: { width: 200, height: 167 },
  medium: { width: 240, height: 200 },
  large: { width: 290, height: 242 }
}

/**
 * Faixa do redimensionamento livre pela alça.
 *
 * O piso não é estético: sem ele dá para encolher a janela até a própria alça
 * sumir, e aí o overlay fica num tamanho do qual não se sai mais pelo mouse.
 *
 * No piso da matriz a altura acompanha a proporção de STRATEGY_MATRIX_CANVAS
 * pelo mesmo motivo dos presets: um piso mais baixo permitiria parar o arrasto
 * num tamanho que corta o chart. O teto pode fugir da proporção à vontade — daí
 * só sobra margem em volta do chart, nunca corte.
 */
export const OVERLAY_SIZE_LIMITS: Record<'count' | 'strategyHand', SizeLimits> = {
  count: { min: { width: 150, height: 92 }, max: { width: 560, height: 340 } },
  strategyHand: { min: { width: 170, height: 142 }, max: { width: 520, height: 433 } }
}

/**
 * Três slots de teclas salvas. Fixos e sempre presentes: com slot fixo, salvar
 * é um clique; com lista dinâmica, seriam dois passos e um nome obrigatório
 * antes de qualquer coisa acontecer.
 */
export const BINDING_PROFILE_SLOTS = 3

export function emptyBindingProfiles(): BindingProfile[] {
  return Array.from({ length: BINDING_PROFILE_SLOTS }, (_, index) => ({
    id: `slot-${index + 1}`,
    name: `Perfil ${index + 1}`,
    bindings: null
  }))
}

export const DEFAULT_SETTINGS: Settings = {
  shoe: {
    system: 'hilo',
    surrender: true,
    deckCount: 6,
    penetration: 0.75,
    trueCountRounding: 'floor',
    minDecksRemaining: 0.25
  },
  bindings: { ...DEFAULT_BINDINGS },
  hotkeysEnabled: true,
  betSpreads: {
    hilo: DEFAULT_BET_SPREAD,
    ko: DEFAULT_KO_BET_SPREAD
  },
  unitValue: 25,
  currency: { code: 'BRL', locale: 'pt-BR' },
  bankroll: { amount: 0, handsPerHour: 80, targetRiskOfRuin: 0.05 },
  feedback: { sound: false, volume: 0.4, flash: true, drillSound: true },
  palette: 'default',
  deviationsLayout: 'list',
  bindingProfiles: emptyBindingProfiles(),
  overlay: {
    corner: 'top-right',
    margin: 16,
    size: 'medium',
    layout: 'full',
    opacity: 0.82,
    locked: true,
    visible: false,
    customPosition: null,
    customSize: null,
    historyLength: 8,
    showCurrency: false
  },
  /**
   * Nasce travado, como o overlay de contagem: destravado ele recebe os cliques
   * que deveriam ir para o jogo. Quem quiser posicionar destrava em Ajustes,
   * arrasta e trava de volta.
   *
   * Canto oposto ao default do overlay de contagem (que é top-right) para que,
   * ligando os dois pela primeira vez, eles não nasçam empilhados.
   */
  strategyOverlay: {
    corner: 'bottom-right',
    margin: 16,
    opacity: 0.82,
    locked: true,
    visible: false,
    customPosition: null,
    customSize: null,
    size: 'medium',
    layout: 'guide'
  }
}

export const ALLOWED_DECK_COUNTS = [1, 2, 4, 6, 8] as const

/** Moedas oferecidas no seletor. Qualquer ISO 4217 funciona no Intl; estas são só os atalhos. */
export const CURRENCY_PRESETS = [
  { code: 'BRL', locale: 'pt-BR', label: 'R$' },
  { code: 'USD', locale: 'en-US', label: 'US$' },
  { code: 'EUR', locale: 'de-DE', label: '€' },
  { code: 'GBP', locale: 'en-GB', label: '£' }
] as const

/**
 * Segurar a tecla faz o Windows repetir o hotkey — apoiar o dedo em num1 por um
 * segundo pularia a contagem em ~15. 50ms fica abaixo da velocidade de duplo
 * toque humano e acima do intervalo de repetição do SO (~30ms).
 */
export const HOTKEY_REPEAT_DEBOUNCE_MS = 50

/** Arrastar o overlay dispara 'move' continuamente; sem debounce viraria centenas de writes. */
export const SETTINGS_WRITE_DEBOUNCE_MS = 300

/**
 * O shoe em andamento é gravado a cada carta. 400ms é curto o bastante para que
 * um crash custe no máximo uma carta e longo o bastante para não escrever a
 * cada tecla numa mesa rápida.
 */
export const SESSION_WRITE_DEBOUNCE_MS = 400

/**
 * Um shoe salvo só é restaurado se for recente. Retomar a contagem de ontem
 * seria pior do que começar do zero: o número apareceria certo e estaria errado.
 */
export const SESSION_RESTORE_WINDOW_MS = 6 * 60 * 60 * 1000

/** Quantos shoes o histórico mantém em disco. */
export const HISTORY_LIMIT = 500

export const OVERLAY_OPACITY_RANGE = { min: 0.2, max: 1 } as const

/** Velocidades do modo de treino, em cartas por minuto. */
export const DRILL_SPEEDS = [30, 60, 90, 120, 180] as const

export const DEFAULT_DRILL_SPEED = 60

/**
 * Quanto tempo a marca de "carta nova" fica acesa no treino.
 *
 * Existe por causa de duas cartas iguais seguidas: sem um sinal de troca, um 7
 * depois de outro 7 parece a mesma carta parada na tela e o jogador para de
 * contar sem perceber. 260ms é longo o bastante para ser visto de relance e
 * curto o bastante para caber no ritmo mais rápido (180 cartas/min = 333ms por
 * carta).
 */
export const DRILL_CARD_FLASH_MS = 260
