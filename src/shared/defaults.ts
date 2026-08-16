import type { BetSpreadRule, HotkeyAction, OverlaySize, Settings } from './types'

/**
 * Bet spread padrão para 6 baralhos, S17/DAS, spread 1-12.
 *
 * Racional: a vantagem Hi-Lo do jogador ≈ 0.5% × (TC - 1). Kelly manda apostar
 * `edge / variance`, e a variância do blackjack ≈ 1.3, então a aposta ótima
 * escala quase linearmente em (TC - 1). A escada 1-2-4-8-12 segue essa rampa e
 * trava em 12 — spreads maiores é onde se chama atenção, então o teto é
 * deliberado e não matemático.
 *
 * Sempre ordenado por minTrueCount decrescente: o lookup pega a primeira regra
 * cujo minTrueCount seja <= trueCountForBets.
 */
/**
 * O piso é -99, não -Infinity: as settings vão para JSON, e JSON.stringify
 * serializa Infinity como `null`, o que corromperia a regra base no reload.
 * -99 é inalcançável na prática (o TC extremo de um shoe de 8 baralhos é ~±20).
 */
export const BET_SPREAD_FLOOR = -99

export const DEFAULT_BET_SPREAD: BetSpreadRule[] = [
  { minTrueCount: 5, units: 12 },
  { minTrueCount: 4, units: 8 },
  { minTrueCount: 3, units: 4 },
  { minTrueCount: 2, units: 2 },
  { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
]

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
 * NÃO usar Ctrl+Alt+ como default: em teclado ABNT2 (pt-BR) o AltGr É
 * literalmente Ctrl+Alt, e registrar essas combinações quebraria a digitação de
 * `/`, `°`, `₢` no sistema inteiro.
 */
export const DEFAULT_BINDINGS = {
  low: 'F1',
  neutral: 'F2',
  high: 'F3',
  undo: 'F4'
} as const

/**
 * Perfis prontos oferecidos na tela de ajustes. Tudo continua rebindável tecla
 * a tecla; isto é só o atalho para os três casos comuns.
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
    bindings: DEFAULT_BINDINGS
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
    bindings: { low: 'Ctrl+Shift+1', neutral: 'Ctrl+Shift+2', high: 'Ctrl+Shift+3', undo: 'Ctrl+Shift+0' }
  }
] as const satisfies readonly {
  id: string
  label: string
  hint: string
  bindings: Record<HotkeyAction, string>
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

export const DEFAULT_SETTINGS: Settings = {
  shoe: {
    deckCount: 6,
    penetration: 0.75,
    trueCountRounding: 'floor',
    minDecksRemaining: 0.25
  },
  bindings: { ...DEFAULT_BINDINGS },
  hotkeysEnabled: true,
  betSpread: DEFAULT_BET_SPREAD,
  unitValue: 25,
  overlay: {
    corner: 'top-right',
    margin: 16,
    size: 'medium',
    locked: true,
    visible: false,
    customPosition: null,
    historyLength: 8,
    showCurrency: false
  }
}

export const ALLOWED_DECK_COUNTS = [1, 2, 4, 6, 8] as const

/**
 * Segurar a tecla faz o Windows repetir o hotkey — apoiar o dedo em num1 por um
 * segundo pularia a contagem em ~15. 50ms fica abaixo da velocidade de duplo
 * toque humano e acima do intervalo de repetição do SO (~30ms).
 */
export const HOTKEY_REPEAT_DEBOUNCE_MS = 50

/** Arrastar o overlay dispara 'move' continuamente; sem debounce viraria centenas de writes. */
export const SETTINGS_WRITE_DEBOUNCE_MS = 300

/** Insurance é o index play de maior valor no Hi-Lo. */
export const INSURANCE_TRUE_COUNT = 3
