# Overlay de decisão por mão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar os dois layouts do overlay de estratégia por um fluxo único de decisão por mão, guiado por cliques em ranks de carta, com separação completa.

**Architecture:** Três camadas puras em `src/shared/domain/` (valor da mão → reducer da rodada → derivação da decisão), consumidas por componentes de renderer no overlay. O estado da rodada vive só no renderer, via `useReducer`; nenhum canal IPC novo. A jogada continua saindo de `cellDecision`, que não é reescrita — ganha um adaptador de cartas para chave de linha.

**Tech Stack:** TypeScript, React 19, Electron 43, Vitest (+ jsdom por docblock), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-08-23-overlay-decisao-por-mao-design.md`

## Global Constraints

- `src/shared/` NÃO pode importar nada de `electron`. O main executa a lógica, os renderers importam os tipos.
- A invariante central: índices publicados são de Hi-Lo. Em KO (`countAware === false`) nenhuma decisão pode vir marcada como desvio.
- Comentários e textos de UI em português, como o resto da base.
- Testes ficam em `test/*.test.ts` / `test/*.test.tsx`. Testes de renderer levam `// @vitest-environment jsdom` na primeira linha.
- Aliases: `@shared` → `src/shared`, `@` → `src/renderer/src`. Nos arquivos de `test/` a base usa caminho relativo (`../src/...`), não alias.
- Rodar tudo: `npm test`. Typecheck: `npm run typecheck`.
- DAS (dobra após separar) é permitido e fixo — as tabelas de básica deste projeto já assumem isso.
- `MAX_HANDS = 4`.

---

## Mapa de arquivos

**Criar:**

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/domain/hand.ts` | Rank, valor da mão, mapeamento para chave de linha da tabela |
| `src/shared/domain/round.ts` | Estado e transições de uma rodada (reducer puro) |
| `src/shared/domain/handDecision.ts` | Junta mão + upcard + count → jogada e ações disponíveis |
| `src/renderer/src/components/RankKeypad.tsx` | Teclado de 10 ranks |
| `src/renderer/src/components/HandStrip.tsx` | Tira de mãos quando há separação |
| `src/renderer/src/components/DecisionPanel.tsx` | Bloco da jogada + botões contextuais |
| `src/renderer/src/components/HandRound.tsx` | Orquestra o `useReducer` e escolhe o que desenhar por passo |
| `test/hand.test.ts`, `test/round.test.ts`, `test/handDecision.test.ts` | Domínio |
| `test/handRound.test.tsx` | Fluxo completo por cliques |

**Modificar:**

| Arquivo | Mudança |
|---|---|
| `src/shared/types.ts` | `StrategyOverlaySettings` perde `layout`, ganha 4 campos; `StrategyOverlayLayout` sai |
| `src/shared/defaults.ts` | Canvas único, presets flat, limites únicos; sai `strategyGuideRows` e amigos |
| `src/main/state/store.ts` | `sanitizeStrategyOverlay` ignora `layout` e valida os campos novos |
| `src/main/index.ts` | Preset e limites sem depender de layout |
| `src/main/ipc/handlers.ts` | `presetChanged` para de comparar `layout` |
| `src/renderer/src/StrategyOverlayApp.tsx` | Renderiza `HandRound`, escala única |
| `src/renderer/src/components/SettingsPanel.tsx` | Sai "Modo", entram os 4 ajustes |
| `src/shared/changelog.ts`, `package.json` | Versão 0.4.0 |
| `test/overlaySize.test.ts`, `test/strategyOverlayApp.test.tsx`, `test/store.test.ts` | Acompanham as mudanças |

**Apagar:** `src/renderer/src/components/StrategyGuide.tsx` e `test/strategyGuide.test.tsx` — o componente só é usado pelo overlay; a lista de desvios da janela principal é o `DeviationList` interno de `DeviationTable.tsx`, que não muda.

---

### Task 1: Valor da mão

**Files:**
- Create: `src/shared/domain/hand.ts`
- Test: `test/hand.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `type Rank`, `const RANKS`, `interface HandValue`, `function handValue(cards: readonly Rank[], fromSplit?: boolean): HandValue`.

- [ ] **Step 1: Write the failing test**

Crie `test/hand.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { RANKS, handValue } from '../src/shared/domain/hand'

describe('handValue', () => {
  it('soma cartas numéricas', () => {
    expect(handValue(['10', '6'])).toMatchObject({ total: 16, soft: false, busted: false })
  })

  it('conta o ás como 11 enquanto não estoura', () => {
    expect(handValue(['A', '7'])).toMatchObject({ total: 18, soft: true })
  })

  it('rebaixa o ás para 1 quando 11 estouraria', () => {
    expect(handValue(['A', '7', '9'])).toMatchObject({ total: 17, soft: false, busted: false })
  })

  /** A,A vale 12: um ás como 11, o outro como 1. É par, e é a única mão mole de 12. */
  it('A,A vale 12, é mole e é par', () => {
    expect(handValue(['A', 'A'])).toMatchObject({
      total: 12,
      soft: true,
      isPair: true,
      pairRank: 'A'
    })
  })

  it('rebaixa os dois ases quando precisa', () => {
    expect(handValue(['A', 'A', '10', '9'])).toMatchObject({ total: 21, soft: false })
  })

  it('marca estouro', () => {
    expect(handValue(['10', '9', '5'])).toMatchObject({ total: 24, busted: true })
  })

  it('par só com exatamente duas cartas iguais', () => {
    expect(handValue(['8', '8']).isPair).toBe(true)
    expect(handValue(['8', '8', '8']).isPair).toBe(false)
    expect(handValue(['10', '5']).isPair).toBe(false)
  })

  it('21 em duas cartas é blackjack', () => {
    expect(handValue(['A', '10']).blackjack).toBe(true)
  })

  /**
   * 21 vindo de separação não é blackjack natural: não paga 3:2 e a mão segue
   * sendo uma mão comum. Tratar como natural mudaria o que a UI mostra no fim
   * da rodada.
   */
  it('21 pós-separação não é blackjack', () => {
    expect(handValue(['A', '10'], true).blackjack).toBe(false)
  })

  it('RANKS tem as 10 teclas, sem J/Q/K', () => {
    expect(RANKS).toHaveLength(10)
    expect(RANKS).toContain('10')
    expect(RANKS).not.toContain('K')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hand.test.ts`
Expected: FAIL — não resolve `../src/shared/domain/hand`.

- [ ] **Step 3: Write minimal implementation**

Crie `src/shared/domain/hand.ts`:

```ts
/**
 * Valor de uma mão a partir de ranks clicados no overlay de jogada.
 *
 * J, Q e K não existem aqui: entram como '10'. Para a jogada só o valor
 * importa, e a contagem é alimentada em separado pelas hotkeys — este módulo
 * nunca toca no count.
 */

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'

/** Ordem do teclado: o ás primeiro porque é a carta mais consultada. */
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']

export interface HandValue {
  /** Melhor total que não estoura; quando todos estouram, o menor possível. */
  total: number
  /** Sobrou um ás valendo 11. */
  soft: boolean
  /** Exatamente duas cartas de mesmo rank. */
  isPair: boolean
  /** Rank do par, quando `isPair`. É o que a linha `pair-*` precisa saber. */
  pairRank: Rank | null
  busted: boolean
  /** 21 nas duas primeiras cartas, e a mão não veio de separação. */
  blackjack: boolean
}

export function handValue(cards: readonly Rank[], fromSplit = false): HandValue {
  let total = 0
  let acesAsEleven = 0

  for (const card of cards) {
    if (card === 'A') {
      acesAsEleven += 1
      total += 11
    } else {
      total += Number(card)
    }
  }

  // Rebaixa um ás por vez, só o necessário para não estourar.
  while (total > 21 && acesAsEleven > 0) {
    total -= 10
    acesAsEleven -= 1
  }

  const isPair = cards.length === 2 && cards[0] === cards[1]

  return {
    total,
    soft: acesAsEleven > 0,
    isPair,
    pairRank: isPair ? (cards[0] as Rank) : null,
    busted: total > 21,
    blackjack: !fromSplit && cards.length === 2 && total === 21
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hand.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/hand.ts test/hand.test.ts
git commit -m "Calcula o valor de uma mão a partir de ranks"
```

---

### Task 2: Mão → linha da tabela

**Files:**
- Modify: `src/shared/domain/hand.ts`
- Test: `test/hand.test.ts`

**Interfaces:**
- Consumes: `HandValue` da Task 1.
- Produces: `type RowLookup`, `function handRowKey(value: HandValue, canSplit: boolean): RowLookup`.

Contexto que o implementador precisa: `HAND_ROWS` em `src/shared/domain/basicStrategy.ts` tem exatamente `hard-8`..`hard-17`, `soft-13`..`soft-19`, `pair-2`..`pair-10` e `pair-A`. Tudo fora disso não tem linha e precisa de resposta direta.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/hand.test.ts`:

```ts
import { HAND_ROWS } from '../src/shared/domain/basicStrategy'
import { handRowKey } from '../src/shared/domain/hand'

describe('handRowKey', () => {
  const lookup = (cards: Parameters<typeof handValue>[0], canSplit = true) =>
    handRowKey(handValue(cards), canSplit)

  it('mão dura vira a linha hard', () => {
    expect(lookup(['10', '6'])).toEqual({ kind: 'row', key: 'hard-16' })
  })

  it('mão mole vira a linha soft', () => {
    expect(lookup(['A', '7'])).toEqual({ kind: 'row', key: 'soft-18' })
  })

  it('par vira a linha pair quando dá para separar', () => {
    expect(lookup(['8', '8'])).toEqual({ kind: 'row', key: 'pair-8' })
    expect(lookup(['A', 'A'])).toEqual({ kind: 'row', key: 'pair-A' })
  })

  /**
   * No limite de mãos o par deixa de ser separável e passa a ser lida como a
   * mão dura/mole equivalente. Ler pela linha `pair-*` mandaria separar uma mão
   * que a mesa não deixa separar.
   */
  it('par que não pode separar lê pela linha equivalente', () => {
    expect(lookup(['8', '8'], false)).toEqual({ kind: 'row', key: 'hard-16' })
    expect(lookup(['10', '10'], false)).toEqual({ kind: 'always', action: 'stand' })
    expect(lookup(['A', 'A'], false)).toEqual({ kind: 'always', action: 'hit' })
  })

  it('abaixo da menor linha dura a resposta é sempre pedir', () => {
    expect(lookup(['3', '4'])).toEqual({ kind: 'always', action: 'hit' })
  })

  it('acima da maior linha dura a resposta é sempre ficar', () => {
    expect(lookup(['10', '8'])).toEqual({ kind: 'always', action: 'stand' })
  })

  it('mole de 20 é sempre ficar', () => {
    expect(lookup(['A', '9'])).toEqual({ kind: 'always', action: 'stand' })
  })

  /**
   * Rede de proteção: toda chave devolvida tem que existir em HAND_ROWS. Sem
   * isto, um ajuste na tabela deixaria handRowKey apontando para o vazio e
   * cellDecision devolveria null em silêncio.
   */
  it('toda chave devolvida existe em HAND_ROWS', () => {
    const ids = new Set(HAND_ROWS.map((row) => row.id))
    for (const total of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const result = handRowKey(
        { total, soft: false, isPair: false, pairRank: null, busted: false, blackjack: false },
        false
      )
      expect(result.kind === 'row' && ids.has(result.key)).toBe(true)
    }
    for (const total of [13, 14, 15, 16, 17, 18, 19]) {
      const result = handRowKey(
        { total, soft: true, isPair: false, pairRank: null, busted: false, blackjack: false },
        false
      )
      expect(result.kind === 'row' && ids.has(result.key)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/hand.test.ts`
Expected: FAIL — `handRowKey` não é exportado.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao fim de `src/shared/domain/hand.ts`:

```ts
/**
 * Onde a mão é consultada: uma linha da tabela, ou uma resposta direta para as
 * mãos que a tabela não cobre.
 */
export type RowLookup =
  | { kind: 'row'; key: string }
  | { kind: 'always'; action: 'hit' | 'stand' }

/**
 * Chave de linha de `HAND_ROWS` para esta mão.
 *
 * As faixas fora da tabela não são omissão dela: abaixo de 8 duro pedir é
 * sempre certo, de 18 duro e 20 mole para cima ficar é sempre certo, e mole de
 * 12 só existe como A,A que não pôde ser separado. Responder direto é mais
 * barato e mais correto que inventar linhas.
 *
 * `canSplit` false força a leitura pela mão dura/mole equivalente: um 8,8 no
 * limite de mãos é `hard-16`, não `pair-8`.
 *
 * Pré-condição: mão não estourada. Quem chama (`decideHand`) trata o estouro
 * antes, porque mão estourada não tem jogada, e não uma jogada padrão.
 */
export function handRowKey(value: HandValue, canSplit: boolean): RowLookup {
  if (canSplit && value.isPair && value.pairRank !== null) {
    return { kind: 'row', key: `pair-${value.pairRank}` }
  }

  if (value.soft) {
    if (value.total >= 20) return { kind: 'always', action: 'stand' }
    if (value.total <= 12) return { kind: 'always', action: 'hit' }
    return { kind: 'row', key: `soft-${value.total}` }
  }

  if (value.total <= 7) return { kind: 'always', action: 'hit' }
  if (value.total >= 18) return { kind: 'always', action: 'stand' }
  return { kind: 'row', key: `hard-${value.total}` }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/hand.test.ts`
Expected: PASS, 17 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/hand.ts test/hand.test.ts
git commit -m "Mapeia uma mão para a linha da tabela de estratégia"
```

---

### Task 3: Reducer — abertura da rodada

**Files:**
- Create: `src/shared/domain/round.ts`
- Test: `test/round.test.ts`

**Interfaces:**
- Consumes: `Rank`, `handValue` (Task 1); `Upcard` de `basicStrategy.ts`.
- Produces: `MAX_HANDS`, `RoundStep`, `HandStatus`, `PlayerHand`, `RoundState`, `RoundAction`, `initialRound(dealerFirst: boolean): RoundState`, `roundReducer(state, action): RoundState`.

Nesta task o reducer só trata `addCard` nos passos `player` e `dealer`. As outras ações entram nas tasks seguintes.

- [ ] **Step 1: Write the failing test**

Crie `test/round.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { UPCARDS } from '../src/shared/domain/basicStrategy'
import { RANKS } from '../src/shared/domain/hand'
import { initialRound, roundReducer } from '../src/shared/domain/round'
import type { RoundAction, RoundState } from '../src/shared/domain/round'

const play = (state: RoundState, ...actions: RoundAction[]): RoundState =>
  actions.reduce(roundReducer, state)

const card = (rank: Parameters<typeof RANKS.indexOf>[0]): RoundAction => ({
  type: 'addCard',
  rank
})

describe('abertura da rodada', () => {
  it('começa pedindo a mão do jogador', () => {
    const state = initialRound(false)
    expect(state.step).toBe('player')
    expect(state.hands).toHaveLength(1)
    expect(state.hands[0].cards).toEqual([])
  })

  it('com dealerFirst começa pedindo o upcard', () => {
    expect(initialRound(true).step).toBe('dealer')
  })

  it('duas cartas do jogador levam ao passo do dealer', () => {
    const state = play(initialRound(false), card('10'), card('6'))
    expect(state.step).toBe('dealer')
    expect(state.hands[0].cards).toEqual(['10', '6'])
  })

  it('o upcard fecha a abertura e a rodada vira jogável', () => {
    const state = play(initialRound(false), card('10'), card('6'), card('9'))
    expect(state.upcard).toBe('9')
    expect(state.step).toBe('playing')
  })

  it('com dealerFirst a ordem inverte e o fim é o mesmo', () => {
    const state = play(initialRound(true), card('9'), card('10'), card('6'))
    expect(state.upcard).toBe('9')
    expect(state.hands[0].cards).toEqual(['10', '6'])
    expect(state.step).toBe('playing')
  })

  /**
   * Blackjack natural não tem jogada: a rodada abre e fecha na mesma
   * transição. Sem isto o overlay ofereceria "pedir" numa mão de 21.
   */
  it('blackjack natural encerra a rodada na abertura', () => {
    const state = play(initialRound(false), card('A'), card('10'), card('9'))
    expect(state.hands[0].status).toBe('blackjack')
    expect(state.step).toBe('done')
  })

  /**
   * Rank e Upcard têm que descrever o mesmo conjunto de cartas: o reducer
   * converte um no outro ao gravar o upcard. Se um dia divergirem, isto quebra
   * aqui e não numa consulta silenciosa que devolve null.
   */
  it('Rank e Upcard descrevem o mesmo conjunto', () => {
    expect([...RANKS].sort()).toEqual([...UPCARDS].sort())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/round.test.ts`
Expected: FAIL — não resolve `../src/shared/domain/round`.

- [ ] **Step 3: Write minimal implementation**

Crie `src/shared/domain/round.ts`:

```ts
/**
 * Estado de uma rodada no overlay de jogada.
 *
 * Reducer puro e não `useState` na tela porque, com separação, o número de
 * transições (qual mão está ativa, quando dobrar deixa de ser possível, ases
 * separados que recebem uma carta só) passa do ponto em que dá para verificar
 * clicando.
 *
 * Nada aqui toca na contagem: o clique de rank informa a mão, e o count segue
 * vindo das hotkeys. São duas portas independentes de propósito — bug no fluxo
 * de mão não pode corromper uma sessão de banca.
 */
import type { Upcard } from './basicStrategy'
import { handValue } from './hand'
import type { Rank } from './hand'

/** Três separações. Regra da esmagadora maioria das mesas. */
export const MAX_HANDS = 4

export type RoundStep = 'player' | 'dealer' | 'playing' | 'done'

export type HandStatus =
  | 'pending'
  | 'active'
  | 'stood'
  | 'busted'
  | 'doubled'
  | 'blackjack'

export interface PlayerHand {
  id: string
  cards: Rank[]
  status: HandStatus
  /** Veio de separação: não tem blackjack natural. */
  fromSplit: boolean
  /** Ases separados: recebe uma carta e encerra, regra padrão de cassino. */
  splitAces: boolean
  /** Dobrou: a próxima carta encerra a mão. */
  doubling: boolean
}

export interface RoundState {
  step: RoundStep
  hands: PlayerHand[]
  activeIndex: number
  upcard: Upcard | null
  /** Pedir o upcard antes das cartas do jogador. Preferência do usuário. */
  dealerFirst: boolean
  /**
   * Pilha de desfazer. Cada entrada é um estado anterior com `past` vazio; o
   * histórico completo é reconstruído no `undo`, que devolve a entrada do topo
   * já com o resto da pilha. Guardar `past` dentro de `past` faria a estrutura
   * crescer em O(n²) ao longo da rodada.
   */
  past: RoundState[]
}

export type RoundAction =
  | { type: 'addCard'; rank: Rank }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' }
  | { type: 'undo' }
  | { type: 'reset' }

export function initialRound(dealerFirst: boolean): RoundState {
  return {
    step: dealerFirst ? 'dealer' : 'player',
    hands: [
      { id: 'h', cards: [], status: 'active', fromSplit: false, splitAces: false, doubling: false }
    ],
    activeIndex: 0,
    upcard: null,
    dealerFirst,
    past: []
  }
}

/** Empilha o estado atual antes de aplicar o próximo. */
function commit(previous: RoundState, next: Omit<RoundState, 'past'>): RoundState {
  return { ...next, past: [...previous.past, { ...previous, past: [] }] }
}

export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case 'addCard':
      return addCard(state, action.rank)
    default:
      return state
  }
}

function addCard(state: RoundState, rank: Rank): RoundState {
  if (state.step === 'dealer') {
    const upcard = rank as Upcard
    const dealt = state.hands[0].cards.length === 2
    return commit(state, {
      ...state,
      upcard,
      step: dealt ? 'playing' : 'player'
    })
  }

  if (state.step === 'player') {
    const hand = state.hands[0]
    const cards = [...hand.cards, rank]
    const complete = cards.length === 2
    const next: Omit<RoundState, 'past'> = {
      ...state,
      hands: [{ ...hand, cards }],
      step: complete ? (state.upcard === null ? 'dealer' : 'playing') : 'player'
    }
    return commit(state, next.step === 'playing' ? openPlay(next) : next)
  }

  return state
}

/**
 * Entrada em `playing`. Blackjack natural não tem jogada: a mão já nasce
 * encerrada, e sem isso o overlay ofereceria "pedir" numa mão de 21.
 */
function openPlay(state: Omit<RoundState, 'past'>): Omit<RoundState, 'past'> {
  const hand = state.hands[0]
  if (!handValue(hand.cards, hand.fromSplit).blackjack) return state
  return {
    ...state,
    hands: [{ ...hand, status: 'blackjack' }],
    step: 'done'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/round.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/round.ts test/round.test.ts
git commit -m "Abre a rodada do overlay de jogada com mão e upcard"
```

---

### Task 4: Reducer — pedir, ficar e estourar

**Files:**
- Modify: `src/shared/domain/round.ts`
- Test: `test/round.test.ts`

**Interfaces:**
- Consumes: tudo da Task 3.
- Produces: `roundReducer` passa a tratar `{ type: 'stand' }` e `addCard` no passo `playing`.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/round.test.ts`:

```ts
const opened = (...cards: Parameters<typeof card>[0][]) =>
  play(initialRound(false), ...cards.map(card))

describe('jogando a mão', () => {
  it('pedir acrescenta carta e a mão continua', () => {
    const state = play(opened('10', '6', '9'), card('2'))
    expect(state.hands[0].cards).toEqual(['10', '6', '2'])
    expect(state.hands[0].status).toBe('active')
    expect(state.step).toBe('playing')
  })

  it('estourar encerra a mão e a rodada', () => {
    const state = play(opened('10', '6', '9'), card('10'))
    expect(state.hands[0].status).toBe('busted')
    expect(state.step).toBe('done')
  })

  it('ficar encerra a mão e a rodada', () => {
    const state = play(opened('10', '6', '9'), { type: 'stand' })
    expect(state.hands[0].status).toBe('stood')
    expect(state.step).toBe('done')
  })

  /**
   * 21 não tem jogada: pedir estoura e dobrar não existe. Encerrar sozinho tira
   * um clique de cada mão que chega lá, e nunca pode estar errado.
   */
  it('chegar a 21 encerra a mão sozinho', () => {
    const state = play(opened('10', '6', '9'), card('5'))
    expect(state.hands[0].status).toBe('stood')
    expect(state.step).toBe('done')
  })

  it('mão encerrada não aceita mais cartas', () => {
    const done = play(opened('10', '6', '9'), { type: 'stand' })
    expect(play(done, card('2'))).toEqual(done)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/round.test.ts -t "jogando a mão"`
Expected: FAIL — `pedir acrescenta carta` falha porque `addCard` devolve o estado intocado em `playing`.

- [ ] **Step 3: Write minimal implementation**

Em `src/shared/domain/round.ts`, acrescente o caso `stand` ao switch:

```ts
    case 'stand':
      return finishActive(state, 'stood')
```

E troque o `return state` final de `addCard` por:

```ts
  if (state.step !== 'playing') return state

  const hand = state.hands[state.activeIndex]
  const cards = [...hand.cards, rank]
  const value = handValue(cards, hand.fromSplit)

  const status: HandStatus = value.busted
    ? 'busted'
    : hand.doubling
      ? 'doubled'
      : hand.splitAces || value.total === 21
        ? 'stood'
        : 'active'

  const hands = state.hands.map((item, index) =>
    index === state.activeIndex ? { ...item, cards, status } : item
  )

  return commit(state, status === 'active' ? { ...state, hands } : advance({ ...state, hands }))
}

/** Encerra a mão ativa com este desfecho e passa para a próxima. */
function finishActive(state: RoundState, status: HandStatus): RoundState {
  if (state.step !== 'playing') return state
  const hands = state.hands.map((item, index) =>
    index === state.activeIndex ? { ...item, status } : item
  )
  return commit(state, advance({ ...state, hands }))
}

/**
 * Ativa a próxima mão pendente. Sem nenhuma, a rodada acabou.
 *
 * A busca varre do começo e não a partir do índice ativo: com separação
 * aninhada as mãos novas entram no meio da lista, e uma busca só para a frente
 * pularia uma mão que nasceu antes da atual.
 */
function advance(state: Omit<RoundState, 'past'>): Omit<RoundState, 'past'> {
  const next = state.hands.findIndex((hand) => hand.status === 'pending')
  if (next === -1) return { ...state, step: 'done' }
  return {
    ...state,
    hands: state.hands.map((hand, index) =>
      index === next ? { ...hand, status: 'active' } : hand
    ),
    activeIndex: next,
    step: 'playing'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/round.test.ts`
Expected: PASS, 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/round.ts test/round.test.ts
git commit -m "Trata pedir, ficar e estourar na rodada"
```

---

### Task 5: Reducer — dobrar

**Files:**
- Modify: `src/shared/domain/round.ts`
- Test: `test/round.test.ts`

**Interfaces:**
- Consumes: Tasks 3-4.
- Produces: `roundReducer` trata `{ type: 'double' }`.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/round.test.ts`:

```ts
describe('dobrar', () => {
  /**
   * Dobrar não encerra na hora: a mão recebe exatamente uma carta e só então
   * fecha. Encerrar no clique deixaria a carta da dobra fora da mão mostrada.
   */
  it('a carta seguinte encerra a mão como dobrada', () => {
    const doubled = play(opened('5', '6', '9'), { type: 'double' })
    expect(doubled.hands[0].status).toBe('active')
    expect(doubled.hands[0].doubling).toBe(true)

    const state = play(doubled, card('9'))
    expect(state.hands[0].status).toBe('doubled')
    expect(state.hands[0].cards).toEqual(['5', '6', '9'])
    expect(state.step).toBe('done')
  })

  it('dobrar e estourar continua sendo estouro', () => {
    const state = play(opened('9', '6', '9'), { type: 'double' }, card('10'))
    expect(state.hands[0].status).toBe('busted')
  })

  /** Dobrar só nas duas primeiras cartas: depois de pedir, o clique não faz nada. */
  it('não dobra depois de já ter pedido', () => {
    const hit = play(opened('5', '4', '9'), card('2'))
    expect(play(hit, { type: 'double' })).toEqual(hit)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/round.test.ts -t "dobrar"`
Expected: FAIL — `doubling` continua false.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao switch de `roundReducer`:

```ts
    case 'double':
      return startDouble(state)
```

E a função:

```ts
/**
 * Marca a mão ativa como dobrando. Ela continua ativa porque ainda falta a
 * carta; quem encerra é o `addCard` seguinte.
 */
function startDouble(state: RoundState): RoundState {
  if (state.step !== 'playing') return state
  const hand = state.hands[state.activeIndex]
  if (hand.cards.length !== 2 || hand.doubling) return state
  return commit(state, {
    ...state,
    hands: state.hands.map((item, index) =>
      index === state.activeIndex ? { ...item, doubling: true } : item
    )
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/round.test.ts`
Expected: PASS, 15 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/round.ts test/round.test.ts
git commit -m "Dobra encerra a mão na carta seguinte"
```

---

### Task 6: Reducer — separar

**Files:**
- Modify: `src/shared/domain/round.ts`
- Test: `test/round.test.ts`

**Interfaces:**
- Consumes: Tasks 3-5.
- Produces: `roundReducer` trata `{ type: 'split' }`.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/round.test.ts`:

```ts
import { MAX_HANDS } from '../src/shared/domain/round'

describe('separar', () => {
  it('vira duas mãos com uma carta cada, jogando a primeira', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' })
    expect(state.hands).toHaveLength(2)
    expect(state.hands[0]).toMatchObject({ cards: ['8'], status: 'active', fromSplit: true })
    expect(state.hands[1]).toMatchObject({ cards: ['8'], status: 'pending', fromSplit: true })
    expect(state.activeIndex).toBe(0)
  })

  it('as mãos têm ids distintos', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' })
    expect(state.hands[0].id).not.toBe(state.hands[1].id)
  })

  it('encerrada a primeira mão, a segunda vira a ativa', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('10'), { type: 'stand' })
    expect(state.hands[0].status).toBe('stood')
    expect(state.activeIndex).toBe(1)
    expect(state.step).toBe('playing')
  })

  it('a rodada só acaba quando todas as mãos acabam', () => {
    const state = play(
      opened('8', '8', '9'),
      { type: 'split' },
      card('10'),
      { type: 'stand' },
      card('10'),
      { type: 'stand' }
    )
    expect(state.step).toBe('done')
    expect(state.hands.every((hand) => hand.status === 'stood')).toBe(true)
  })

  /** Dobra após separar é permitida — as tabelas de básica deste projeto assumem isso. */
  it('dobra depois de separar', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('3'), { type: 'double' })
    expect(state.hands[0].doubling).toBe(true)
  })

  it('re-separa um par que aparece depois da separação', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('8'), { type: 'split' })
    expect(state.hands).toHaveLength(3)
  })

  it('para de separar no limite de mãos', () => {
    let state = play(opened('8', '8', '9'), { type: 'split' })
    while (state.hands.length < MAX_HANDS) {
      state = play(state, card('8'), { type: 'split' })
    }
    expect(state.hands).toHaveLength(MAX_HANDS)
    const blocked = play(state, card('8'), { type: 'split' })
    expect(blocked.hands).toHaveLength(MAX_HANDS)
  })

  /**
   * Ases separados recebem uma carta e encerram. É regra padrão de cassino, e
   * ignorá-la faria o overlay oferecer "pedir" numa mão que a mesa já fechou —
   * conselho errado com cara de certo.
   */
  it('ases separados recebem uma carta e encerram', () => {
    const state = play(opened('A', 'A', '9'), { type: 'split' }, card('6'))
    expect(state.hands[0]).toMatchObject({ cards: ['A', '6'], status: 'stood' })
    expect(state.activeIndex).toBe(1)
  })

  /** 21 vindo de ases separados não é blackjack natural. */
  it('ás separado com 10 fecha como mão comum, não blackjack', () => {
    const state = play(opened('A', 'A', '9'), { type: 'split' }, card('10'))
    expect(state.hands[0].status).toBe('stood')
  })

  it('não separa o que não é par', () => {
    const state = opened('10', '6', '9')
    expect(play(state, { type: 'split' })).toEqual(state)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/round.test.ts -t "separar"`
Expected: FAIL — a rodada continua com uma mão só.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao switch de `roundReducer`:

```ts
    case 'split':
      return split(state)
```

E a função:

```ts
/**
 * Separa a mão ativa em duas, uma carta em cada, e joga a primeira.
 *
 * As mãos novas entram no lugar da original em vez de irem para o fim da lista:
 * a ordem da tira na tela é a ordem em que as mãos são jogadas na mesa, e
 * empilhar no fim inverteria isso numa re-separação.
 *
 * `splitAces` é herdado por ambas: um ás separado recebe uma carta e encerra,
 * então re-separar ases nunca chega a ser oferecido.
 */
function split(state: RoundState): RoundState {
  if (state.step !== 'playing') return state
  if (state.hands.length >= MAX_HANDS) return state

  const hand = state.hands[state.activeIndex]
  const [first, second] = hand.cards
  if (hand.cards.length !== 2 || first !== second) return state

  const splitAces = hand.splitAces || first === 'A'
  const base = { fromSplit: true, splitAces, doubling: false }
  const left: PlayerHand = { ...hand, ...base, id: `${hand.id}a`, cards: [first], status: 'active' }
  const right: PlayerHand = {
    ...hand,
    ...base,
    id: `${hand.id}b`,
    cards: [second],
    status: 'pending'
  }

  return commit(state, {
    ...state,
    hands: [
      ...state.hands.slice(0, state.activeIndex),
      left,
      right,
      ...state.hands.slice(state.activeIndex + 1)
    ]
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/round.test.ts`
Expected: PASS, 25 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/round.ts test/round.test.ts
git commit -m "Separa a mão em até quatro, com ases de uma carta só"
```

---

### Task 7: Reducer — desfazer e reiniciar

**Files:**
- Modify: `src/shared/domain/round.ts`
- Test: `test/round.test.ts`

**Interfaces:**
- Consumes: Tasks 3-6.
- Produces: `roundReducer` trata `{ type: 'undo' }` e `{ type: 'reset' }`.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/round.test.ts`:

```ts
describe('desfazer e reiniciar', () => {
  it('desfaz a última carta', () => {
    const before = play(initialRound(false), card('10'))
    const state = play(before, card('6'), { type: 'undo' })
    expect(state.hands[0].cards).toEqual(['10'])
    expect(state.step).toBe('player')
  })

  /**
   * Desfazer tem que atravessar mais de um passo: erro de clique acontece em
   * série, e uma pilha de um nível só obrigaria a resetar a rodada.
   */
  it('desfaz várias vezes seguidas', () => {
    const state = play(
      initialRound(false),
      card('10'),
      card('6'),
      card('9'),
      { type: 'undo' },
      { type: 'undo' }
    )
    expect(state.hands[0].cards).toEqual(['10'])
    expect(state.upcard).toBe(null)
  })

  it('desfaz uma separação inteira', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, { type: 'undo' })
    expect(state.hands).toHaveLength(1)
    expect(state.hands[0].cards).toEqual(['8', '8'])
  })

  it('desfazer no começo não faz nada', () => {
    const start = initialRound(false)
    expect(play(start, { type: 'undo' })).toEqual(start)
  })

  it('reiniciar volta ao começo preservando a ordem escolhida', () => {
    const state = play(opened('10', '6', '9'), { type: 'reset' })
    expect(state).toEqual(initialRound(false))

    const dealer = play(play(initialRound(true), card('9')), { type: 'reset' })
    expect(dealer).toEqual(initialRound(true))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/round.test.ts -t "desfazer"`
Expected: FAIL — o estado não volta.

- [ ] **Step 3: Write minimal implementation**

Acrescente ao switch de `roundReducer`:

```ts
    case 'undo':
      return undo(state)
    case 'reset':
      return initialRound(state.dealerFirst)
```

E a função:

```ts
/**
 * Volta um passo. A entrada do topo foi guardada com `past` vazio, então o
 * histórico restante é recolocado aqui — é isso que faz desfazer funcionar
 * várias vezes seguidas sem a pilha crescer em O(n²).
 */
function undo(state: RoundState): RoundState {
  const previous = state.past[state.past.length - 1]
  if (previous === undefined) return state
  return { ...previous, past: state.past.slice(0, -1) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/round.test.ts`
Expected: PASS, 30 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/round.ts test/round.test.ts
git commit -m "Desfaz cliques e reinicia a rodada"
```

---

### Task 8: Decisão da mão ativa

**Files:**
- Create: `src/shared/domain/handDecision.ts`
- Test: `test/handDecision.test.ts`

**Interfaces:**
- Consumes: `PlayerHand`, `MAX_HANDS` (round.ts); `handValue`, `handRowKey` (hand.ts); `basicAction`, `cellDecision`, `fallbackAction`, `StrategyRules`, `Upcard` (basicStrategy.ts); `PlayAction` (deviations.ts).
- Produces: `interface HandDecision`, `function decideHand(hand, upcard, decisionCount, rules, countAware, handCount): HandDecision`.

- [ ] **Step 1: Write the failing test**

Crie `test/handDecision.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { decideHand } from '../src/shared/domain/handDecision'
import type { Rank } from '../src/shared/domain/hand'
import type { PlayerHand } from '../src/shared/domain/round'

const rules = { surrender: false }

const hand = (cards: Rank[], patch: Partial<PlayerHand> = {}): PlayerHand => ({
  id: 'h',
  cards,
  status: 'active',
  fromSplit: false,
  splitAces: false,
  doubling: false,
  ...patch
})

describe('decideHand', () => {
  it('16 vs 10 em count baixo é a básica', () => {
    const result = decideHand(hand(['10', '6']), '10', -2, rules, true, 1)
    expect(result.action).toBe('hit')
    expect(result.deviated).toBe(false)
  })

  /** Illustrious 18: 16 vs 10 para de pedir a partir de TC 0. */
  it('16 vs 10 em count alto vira desvio', () => {
    const result = decideHand(hand(['10', '6']), '10', 3, rules, true, 1)
    expect(result.action).toBe('stand')
    expect(result.deviated).toBe(true)
    expect(result.index).not.toBe(null)
  })

  /**
   * A invariante do projeto na fiação: em KO nenhuma decisão pode vir marcada
   * como desvio, porque os índices publicados são de Hi-Lo e a escala do KO é
   * outra.
   */
  it('em KO nunca marca desvio', () => {
    const result = decideHand(hand(['10', '6']), '10', 3, rules, false, 1)
    expect(result.action).toBe('hit')
    expect(result.deviated).toBe(false)
    expect(result.index).toBe(null)
  })

  it('mão fora da tabela responde direto', () => {
    expect(decideHand(hand(['3', '4']), '10', 0, rules, true, 1).action).toBe('hit')
    expect(decideHand(hand(['10', '8']), '10', 0, rules, true, 1).action).toBe('stand')
  })

  it('dobrar só nas duas primeiras cartas', () => {
    expect(decideHand(hand(['5', '6']), '5', 0, rules, true, 1).canDouble).toBe(true)
    expect(decideHand(hand(['5', '4', '2']), '5', 0, rules, true, 1).canDouble).toBe(false)
  })

  /** 11 vs 5 é dobrar; depois de pedir carta a mesma mão vira pedir. */
  it('dobrar vira pedir quando não dá mais para dobrar', () => {
    expect(decideHand(hand(['5', '6']), '5', 0, rules, true, 1).action).toBe('double')
    expect(decideHand(hand(['5', '4', '2']), '5', 0, rules, true, 1).action).toBe('hit')
  })

  it('separar só com par e abaixo do limite de mãos', () => {
    expect(decideHand(hand(['8', '8']), '10', 0, rules, true, 1).canSplit).toBe(true)
    expect(decideHand(hand(['8', '8']), '10', 0, rules, true, 4).canSplit).toBe(false)
  })

  it('no limite de mãos o par lê pela mão dura', () => {
    const result = decideHand(hand(['8', '8']), '10', 0, rules, true, 4)
    expect(result.action).not.toBe('split')
  })

  it('render só existe quando a mesa tem, com duas cartas e sem separação', () => {
    const withSurrender = { surrender: true }
    expect(decideHand(hand(['10', '6']), '10', -2, withSurrender, true, 1).canSurrender).toBe(true)
    expect(decideHand(hand(['10', '6']), '10', -2, rules, true, 1).canSurrender).toBe(false)
    expect(
      decideHand(hand(['10', '6'], { fromSplit: true }), '10', -2, withSurrender, true, 1)
        .canSurrender
    ).toBe(false)
  })

  it('mão estourada não tem jogada nem ações', () => {
    const result = decideHand(hand(['10', '9', '5']), '10', 0, rules, true, 1)
    expect(result.canDouble).toBe(false)
    expect(result.canSplit).toBe(false)
    expect(result.canSurrender).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/handDecision.test.ts`
Expected: FAIL — não resolve `../src/shared/domain/handDecision`.

- [ ] **Step 3: Write minimal implementation**

Crie `src/shared/domain/handDecision.ts`:

```ts
/**
 * Jogada para a mão ativa do overlay.
 *
 * Nada de estratégia é reescrito aqui: `cellDecision` continua sendo a única
 * fonte da jogada. Este módulo é o adaptador entre "cartas na mesa" e "célula
 * da matriz", mais as restrições que a matriz não conhece (já pedi carta, já
 * separei três vezes).
 */
import { basicAction, cellDecision, fallbackAction } from './basicStrategy'
import type { StrategyRules, Upcard } from './basicStrategy'
import type { PlayAction } from './deviations'
import { handRowKey, handValue } from './hand'
import { MAX_HANDS } from './round'
import type { PlayerHand } from './round'

export interface HandDecision {
  action: PlayAction
  /** A contagem mudou esta jogada em relação à básica desta mesa. */
  deviated: boolean
  index: number | null
  distance: number | null
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
}

export function decideHand(
  hand: PlayerHand,
  upcard: Upcard,
  decisionCount: number,
  rules: StrategyRules,
  countAware: boolean,
  handCount: number
): HandDecision {
  const value = handValue(hand.cards, hand.fromSplit)
  const twoCards = hand.cards.length === 2

  const canDouble = twoCards && !value.busted
  const canSplit = twoCards && value.isPair && handCount < MAX_HANDS && !value.busted
  const canSurrender = rules.surrender && twoCards && !hand.fromSplit && !value.busted

  const idle = { canDouble: false, canSplit: false, canSurrender: false }
  if (value.busted) {
    return { action: 'stand', deviated: false, index: null, distance: null, ...idle }
  }

  const available = { canDouble, canSplit, canSurrender }
  const lookup = handRowKey(value, canSplit)

  if (lookup.kind === 'always') {
    return {
      action: lookup.action,
      deviated: false,
      index: null,
      distance: null,
      ...available
    }
  }

  /**
   * `countAware` false = KO. Os índices publicados são de Hi-Lo e a escala do
   * KO é outra, então a decisão cai na básica pura — o mesmo tratamento que
   * StrategyGrid dá à matriz.
   */
  const raw = countAware
    ? cellDecision(lookup.key, upcard, decisionCount, rules)
    : null
  const basic = basicAction(lookup.key, upcard, rules)

  if (basic === null) {
    return { action: 'hit', deviated: false, index: null, distance: null, ...available }
  }

  const restrict = (action: PlayAction): PlayAction => {
    if (action === 'double' && !canDouble) return fallbackAction(action)
    if (action === 'surrender' && !canSurrender) return fallbackAction(action)
    return action
  }

  const action = restrict(raw?.action ?? basic)

  /**
   * `deviated` é recalculado contra a básica JÁ restringida, e não copiado de
   * `cellDecision`. Um desvio que manda dobrar numa mão de três cartas vira
   * pedir — e se a básica também era pedir, nada mudou de fato; marcar como
   * desvio ali destacaria em verde uma jogada idêntica à do livro.
   */
  return {
    action,
    deviated: action !== restrict(basic),
    index: raw?.index ?? null,
    distance: raw?.distance ?? null,
    ...available
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/handDecision.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/domain/handDecision.ts test/handDecision.test.ts
git commit -m "Deriva a jogada da mão ativa a partir da tabela"
```

---

### Task 9: Teclado de ranks

**Files:**
- Create: `src/renderer/src/components/RankKeypad.tsx`
- Test: `test/rankKeypad.test.tsx`

**Interfaces:**
- Consumes: `RANKS`, `Rank` (hand.ts).
- Produces: `type KeypadDensity = 'compact' | 'comfortable'`, `interface RankKeypadProps { onPick: (rank: Rank) => void; density: KeypadDensity }`, `function RankKeypad(props): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Crie `test/rankKeypad.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RankKeypad } from '../src/renderer/src/components/RankKeypad'

afterEach(cleanup)

describe('RankKeypad', () => {
  it('mostra as dez teclas', () => {
    render(<RankKeypad onPick={vi.fn()} density="comfortable" />)
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })

  it('entrega o rank clicado', () => {
    const onPick = vi.fn()
    render(<RankKeypad onPick={onPick} density="comfortable" />)
    fireEvent.click(screen.getByRole('button', { name: 'carta 10' }))
    expect(onPick).toHaveBeenCalledWith('10')
  })

  /**
   * O rótulo diz "carta A" e não só "A": a leitura útil de um leitor de tela
   * numa grade de dez letras soltas é a carta, não o caractere.
   */
  it('rotula o ás como carta', () => {
    render(<RankKeypad onPick={vi.fn()} density="comfortable" />)
    expect(screen.getByRole('button', { name: 'carta A' })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rankKeypad.test.tsx`
Expected: FAIL — não resolve o componente.

- [ ] **Step 3: Write minimal implementation**

Crie `src/renderer/src/components/RankKeypad.tsx`:

```tsx
import { RANKS } from '@shared/domain/hand'
import type { Rank } from '@shared/domain/hand'

export type KeypadDensity = 'compact' | 'comfortable'

export interface RankKeypadProps {
  onPick: (rank: Rank) => void
  density: KeypadDensity
}

/**
 * Teclado de dez ranks, em grade 5x2.
 *
 * São `<button>` de verdade, o que os tira do arrasto da janela pela regra
 * `.app-drag button { -webkit-app-region: no-drag }`. Com dez teclas grandes
 * sobra moldura suficiente para arrastar — ao contrário das ~270 células da
 * matriz, que foi o que motivou aquela regra virar um problema.
 */
export function RankKeypad({ onPick, density }: RankKeypadProps) {
  const compact = density === 'compact'

  return (
    <div className={`grid grid-cols-5 ${compact ? 'gap-[2px]' : 'gap-1'}`}>
      {RANKS.map((rank) => (
        <button
          key={rank}
          type="button"
          aria-label={`carta ${rank}`}
          onClick={() => onPick(rank)}
          className={`tnum rounded-[4px] border border-border bg-surface font-semibold text-fg transition-colors duration-100 hover:border-muted hover:bg-fg/10 ${
            compact ? 'h-5 text-[11px]' : 'h-7 text-[13px]'
          }`}
        >
          {rank}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/rankKeypad.test.tsx`
Expected: PASS, 3 testes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/RankKeypad.tsx test/rankKeypad.test.tsx
git commit -m "Teclado de ranks para o overlay de jogada"
```

---

### Task 10: Tira de mãos e painel de decisão

**Files:**
- Create: `src/renderer/src/components/HandStrip.tsx`
- Create: `src/renderer/src/components/DecisionPanel.tsx`

**Interfaces:**
- Consumes: `PlayerHand` (round.ts), `handValue` (hand.ts), `HandDecision` (handDecision.ts), `PLAY_LABELS`, `PlayAction` (deviations.ts), `formatSigned` (`@shared/format`).
- Produces: `function HandStrip({ hands, activeIndex }): JSX.Element`, `interface DecisionPanelProps`, `function DecisionPanel(props): JSX.Element`.

Estes dois são só apresentação; o teste que os cobre é o de fluxo, na Task 11 — separar um teste de render por componente aqui duplicaria o mesmo caminho.

- [ ] **Step 1: Write HandStrip**

Crie `src/renderer/src/components/HandStrip.tsx`:

```tsx
import { handValue } from '@shared/domain/hand'
import type { PlayerHand } from '@shared/domain/round'

export interface HandStripProps {
  hands: readonly PlayerHand[]
  activeIndex: number
}

const MARK: Record<PlayerHand['status'], string> = {
  pending: '—',
  active: '',
  stood: '✓',
  busted: '✗',
  doubled: '2x',
  blackjack: 'BJ'
}

/**
 * Uma linha por mão depois de uma separação, na ordem em que serão jogadas.
 *
 * Só aparece com mais de uma mão: com uma só, a tira repetiria o que o bloco de
 * decisão já mostra logo abaixo.
 */
export function HandStrip({ hands, activeIndex }: HandStripProps) {
  return (
    <ul className="flex flex-wrap gap-1" data-testid="hand-strip">
      {hands.map((hand, index) => {
        const total = hand.cards.length === 0 ? '' : handValue(hand.cards, hand.fromSplit).total
        const active = index === activeIndex

        return (
          <li
            key={hand.id}
            className={`tnum rounded-[3px] border px-1 py-[1px] text-[10px] ${
              active ? 'border-pos bg-pos/15 text-pos' : 'border-border bg-surface text-muted'
            }`}
          >
            {index + 1}: {total} {MARK[hand.status]}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: Write DecisionPanel**

Crie `src/renderer/src/components/DecisionPanel.tsx`:

```tsx
import type { HandDecision } from '@shared/domain/handDecision'
import { PLAY_LABELS } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'

export interface DecisionPanelProps {
  decision: HandDecision
  /** Mostra a linha de índice e distância sob a jogada. */
  showReason: boolean
  decisionCount: number
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onSplit: () => void
  onSurrender: () => void
}

/** Mesma paleta da matriz: o olho procura a cor e lê a palavra depois. */
const ACTION_TONE: Record<PlayAction, string> = {
  hit: 'text-fg',
  stand: 'text-fg',
  double: 'text-warn',
  split: 'text-pos',
  surrender: 'text-neg',
  insurance: 'text-warn',
  noInsurance: 'text-muted'
}

export function DecisionPanel({
  decision,
  showReason,
  decisionCount,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onSurrender
}: DecisionPanelProps) {
  const { action, deviated, index, canDouble, canSplit, canSurrender } = decision

  const reason =
    !deviated || index === null
      ? 'básica'
      : `desvio · índice ${formatSigned(index)} · você está em ${formatSigned(decisionCount)}`

  return (
    <div className="flex flex-col gap-1.5">
      <div
        data-testid="decision"
        className={`rounded-md border px-2 py-1.5 text-center text-[17px] font-semibold uppercase ${
          deviated ? 'border-pos bg-pos/15 text-pos' : `border-border bg-surface ${ACTION_TONE[action]}`
        }`}
      >
        {PLAY_LABELS[action]}
      </div>

      {showReason && (
        <p data-testid="reason" className="tnum text-center text-[10px] leading-snug text-muted">
          {reason}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1">
        <Action label="Pedir" onClick={onHit} />
        <Action label="Ficar" onClick={onStand} />
        {canDouble && <Action label="Dobrar" onClick={onDouble} />}
        {canSplit && <Action label="Separar" onClick={onSplit} />}
        {canSurrender && <Action label="Render" onClick={onSurrender} />}
      </div>
    </div>
  )
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[4px] border border-border bg-surface py-1 text-[11px] text-fg transition-colors duration-100 hover:border-muted hover:bg-fg/10"
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/HandStrip.tsx src/renderer/src/components/DecisionPanel.tsx
git commit -m "Tira de mãos e painel de decisão do overlay"
```

---

### Task 11: Fluxo da rodada

**Files:**
- Create: `src/renderer/src/components/HandRound.tsx`
- Test: `test/handRound.test.tsx`

**Interfaces:**
- Consumes: tudo das Tasks 1-10.
- Produces: `interface HandRoundProps`, `function HandRound(props): JSX.Element`.

```ts
export interface HandRoundProps {
  system: CountingSystem
  decisionCount: number
  surrender: boolean
  insuranceOn: boolean
  dealerFirst: boolean
  showReason: boolean
  autoResetSeconds: number
  keypadDensity: KeypadDensity
}
```

- [ ] **Step 1: Write the failing test**

Crie `test/handRound.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HandRound } from '../src/renderer/src/components/HandRound'

afterEach(cleanup)

const defaults = {
  system: 'hilo' as const,
  decisionCount: 0,
  surrender: false,
  insuranceOn: false,
  dealerFirst: false,
  showReason: true,
  autoResetSeconds: 0,
  keypadDensity: 'comfortable' as const
}

const pick = (rank: string) => fireEvent.click(screen.getByRole('button', { name: `carta ${rank}` }))

describe('HandRound', () => {
  it('pede a mão, depois o dealer, depois decide', () => {
    render(<HandRound {...defaults} decisionCount={-2} />)
    expect(screen.getByText('Sua mão')).toBeTruthy()

    pick('10')
    pick('6')
    expect(screen.getByText('Dealer')).toBeTruthy()

    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('pedir')
  })

  it('com dealerFirst pede o upcard primeiro', () => {
    render(<HandRound {...defaults} dealerFirst />)
    expect(screen.getByText('Dealer')).toBeTruthy()
  })

  /** Illustrious 18: 16 vs 10 vira parar a partir de TC 0. */
  it('mostra o desvio e o porquê no count alto', () => {
    render(<HandRound {...defaults} decisionCount={3} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('parar')
    expect(screen.getByTestId('reason').textContent).toContain('desvio')
  })

  it('esconde o porquê quando desligado', () => {
    render(<HandRound {...defaults} showReason={false} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.queryByTestId('reason')).toBe(null)
  })

  it('pedir carta recalcula a decisão', () => {
    render(<HandRound {...defaults} decisionCount={-2} />)
    pick('10')
    pick('6')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Pedir' }))
    pick('3')
    expect(screen.getByTestId('decision').textContent).toContain('parar')
  })

  it('estourar encerra e oferece nova mão', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Pedir' }))
    pick('10')
    expect(screen.getByText(/Estourou/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nova mão' })).toBeTruthy()
  })

  it('separar mostra a tira de mãos e joga a primeira', () => {
    render(<HandRound {...defaults} />)
    pick('8')
    pick('8')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Separar' }))
    expect(screen.getByTestId('hand-strip').textContent).toContain('2:')
    expect(screen.getByText(/Mão 1/)).toBeTruthy()
  })

  it('a tira não aparece com uma mão só', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.queryByTestId('hand-strip')).toBe(null)
  })

  it('desfazer tira a última carta', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    expect(screen.getByText('Dealer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByText('Sua mão')).toBeTruthy()
  })

  it('mostra o seguro só contra ás', () => {
    render(<HandRound {...defaults} insuranceOn />)
    pick('10')
    pick('6')
    expect(screen.queryByTestId('insurance')).toBe(null)
    pick('A')
    expect(screen.getByTestId('insurance').textContent).toContain('fazer seguro')
  })

  /**
   * Em KO os índices de Hi-Lo não valem. 16 vs 10 sem rendição é pedir na
   * básica e parar no Illustrious 18: se a fiação de countAware estivesse
   * invertida, este teste mostraria "parar".
   */
  it('em KO mostra a básica, não o desvio de Hi-Lo', () => {
    render(<HandRound {...defaults} system="ko" decisionCount={3} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('pedir')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/handRound.test.tsx`
Expected: FAIL — não resolve o componente.

- [ ] **Step 3: Write minimal implementation**

Crie `src/renderer/src/components/HandRound.tsx`:

```tsx
import { useEffect, useMemo, useReducer, useState } from 'react'

import { PLAY_LABELS } from '@shared/domain/deviations'
import { handValue } from '@shared/domain/hand'
import type { Rank } from '@shared/domain/hand'
import { decideHand } from '@shared/domain/handDecision'
import { initialRound, roundReducer } from '@shared/domain/round'
import type { HandStatus } from '@shared/domain/round'
import { formatSigned } from '@shared/format'
import type { CountingSystem } from '@shared/types'

import { DecisionPanel } from '@/components/DecisionPanel'
import { HandStrip } from '@/components/HandStrip'
import { RankKeypad } from '@/components/RankKeypad'
import type { KeypadDensity } from '@/components/RankKeypad'

export interface HandRoundProps {
  system: CountingSystem
  decisionCount: number
  surrender: boolean
  insuranceOn: boolean
  dealerFirst: boolean
  showReason: boolean
  /** Segundos até limpar a rodada encerrada sozinha. 0 = manual. */
  autoResetSeconds: number
  keypadDensity: KeypadDensity
}

const STATUS_TEXT: Record<HandStatus, string> = {
  pending: 'Encerrada',
  active: 'Encerrada',
  stood: 'Encerrada',
  busted: 'Estourou',
  doubled: 'Dobrada',
  blackjack: 'Blackjack'
}

export function HandRound({
  system,
  decisionCount,
  surrender,
  insuranceOn,
  dealerFirst,
  showReason,
  autoResetSeconds,
  keypadDensity
}: HandRoundProps) {
  const [round, dispatch] = useReducer(roundReducer, dealerFirst, initialRound)

  /*
    "Esperando carta" é estado de tela, não de rodada: pedir, dobrar e separar
    todos levam de volta ao teclado, mas o reducer não tem o que registrar até
    a carta chegar. Guardar isso no RoundState poluiria o domínio com um passo
    que não muda nada da mão.
  */
  const [awaitingCard, setAwaitingCard] = useState(false)

  /*
    Trocar a ordem do fluxo nos ajustes precisa recomeçar a rodada: o passo
    inicial faz parte do estado, e um `dealerFirst` novo com uma rodada no meio
    deixaria a tela pedindo uma carta que o reducer não aceita.
  */
  useEffect(() => {
    if (round.dealerFirst !== dealerFirst) {
      dispatch({ type: 'reset' })
      setAwaitingCard(false)
    }
  }, [dealerFirst, round.dealerFirst])

  useEffect(() => {
    if (round.step !== 'done') return
    setAwaitingCard(false)
    if (autoResetSeconds <= 0) return
    const timer = setTimeout(() => dispatch({ type: 'reset' }), autoResetSeconds * 1000)
    return () => clearTimeout(timer)
  }, [round.step, autoResetSeconds])

  const rules = useMemo(() => ({ surrender }), [surrender])
  const countAware = system === 'hilo'
  const hand = round.hands[round.activeIndex]

  const decision =
    round.step === 'playing' && round.upcard !== null && !awaitingCard
      ? decideHand(hand, round.upcard, decisionCount, rules, countAware, round.hands.length)
      : null

  const pickCard = (rank: Rank) => {
    dispatch({ type: 'addCard', rank })
    setAwaitingCard(false)
  }

  const prompt =
    round.step === 'dealer'
      ? 'Dealer'
      : round.hands.length > 1
        ? `Mão ${round.activeIndex + 1} — carta`
        : 'Sua mão'

  const total = hand.cards.length === 0 ? null : handValue(hand.cards, hand.fromSplit).total

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label text-[9px]">{round.step === 'done' ? 'Rodada' : prompt}</span>
        <span className="tnum text-[11px] text-muted">
          {countAware ? 'TC' : 'RC'} {formatSigned(decisionCount)}
        </span>
      </div>

      {round.upcard === 'A' && (
        <div
          data-testid="insurance"
          className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[10px] ${
            insuranceOn ? 'bg-warn/15 text-warn' : 'text-muted'
          }`}
        >
          <span>Seguro</span>
          <span className="font-semibold">
            {insuranceOn ? PLAY_LABELS.insurance : PLAY_LABELS.noInsurance}
          </span>
        </div>
      )}

      {round.hands.length > 1 && (
        <HandStrip hands={round.hands} activeIndex={round.activeIndex} />
      )}

      <p className="tnum text-center text-[10px] text-muted">
        Dealer {round.upcard ?? '—'} · Você {hand.cards.length === 0 ? '—' : hand.cards.join(' ')}
        {total === null ? '' : ` (${total})`}
      </p>

      {round.step === 'done' ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-center text-[12px] font-semibold text-fg">{STATUS_TEXT[hand.status]}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'reset' })}
            className="rounded-[4px] border border-border bg-surface py-1 text-[11px] text-fg hover:border-muted hover:bg-fg/10"
          >
            Nova mão
          </button>
        </div>
      ) : decision === null ? (
        <RankKeypad density={keypadDensity} onPick={pickCard} />
      ) : (
        <DecisionPanel
          decision={decision}
          showReason={showReason}
          decisionCount={decisionCount}
          onHit={() => setAwaitingCard(true)}
          onStand={() => dispatch({ type: 'stand' })}
          // Dobrar e separar exigem a carta seguinte: as duas voltam ao teclado.
          onDouble={() => {
            dispatch({ type: 'double' })
            setAwaitingCard(true)
          }}
          onSplit={() => {
            dispatch({ type: 'split' })
            setAwaitingCard(true)
          }}
          // Render encerra a mão como qualquer saída sem mais cartas: o app não
          // modela o valor apostado, então não há nada a calcular além de sair.
          onSurrender={() => dispatch({ type: 'stand' })}
        />
      )}

      <button
        type="button"
        onClick={() => {
          dispatch({ type: 'undo' })
          setAwaitingCard(false)
        }}
        className="text-[10px] text-muted hover:text-fg"
      >
        Desfazer
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/handRound.test.tsx`
Expected: PASS, 11 testes.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: os testes novos passam; `strategyOverlayApp` e `overlaySize` ainda passam (nada foi removido ainda).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/HandRound.tsx test/handRound.test.tsx
git commit -m "Fluxo completo da rodada no overlay de jogada"
```

---

### Task 12: Ajustes e migração do settings

**Files:**
- Modify: `src/shared/types.ts`, `src/main/state/store.ts`, `src/renderer/src/components/SettingsPanel.tsx`
- Test: `test/store.test.ts`

**Interfaces:**
- Consumes: `KeypadDensity` (Task 9).
- Produces: `StrategyOverlaySettings` com `dealerFirst`, `showReason`, `autoResetSeconds`, `keypadDensity`; sem `layout`. `StrategyOverlayLayout` e `STRATEGY_OVERLAY_LAYOUTS` deixam de existir.

- [ ] **Step 1: Write the failing test**

Acrescente a `test/store.test.ts` (siga o padrão dos testes de sanitização já existentes no arquivo):

```ts
  /**
   * O settings.json de quem já usa o app tem `layout` gravado. Ignorar o campo
   * não pode invalidar o arquivo inteiro: perder posição, tamanho e opacidade
   * numa atualização é pior do que qualquer coisa que o campo obsoleto cause.
   */
  it('ignora o layout obsoleto sem descartar o resto do overlay de jogada', () => {
    const sanitized = sanitizeSettings({
      strategyOverlay: { layout: 'matrix', opacity: 0.5, corner: 'top-left' }
    })
    expect('layout' in sanitized.strategyOverlay).toBe(false)
    expect(sanitized.strategyOverlay.opacity).toBe(0.5)
    expect(sanitized.strategyOverlay.corner).toBe('top-left')
  })

  it('valida os ajustes novos do overlay de jogada', () => {
    const sanitized = sanitizeSettings({
      strategyOverlay: { dealerFirst: 'sim', showReason: false, autoResetSeconds: 999, keypadDensity: 'gigante' }
    })
    expect(sanitized.strategyOverlay.dealerFirst).toBe(false)
    expect(sanitized.strategyOverlay.showReason).toBe(false)
    expect(sanitized.strategyOverlay.autoResetSeconds).toBe(30)
    expect(sanitized.strategyOverlay.keypadDensity).toBe('comfortable')
  })
```

Ajuste a chamada ao helper de sanitização conforme o nome usado no arquivo (`sanitizeSettings` ou equivalente — confira o topo de `test/store.test.ts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/store.test.ts`
Expected: FAIL — `layout` continua no objeto e os campos novos não existem.

- [ ] **Step 3: Write the implementation**

Em `src/shared/types.ts`, apague `StrategyOverlayLayout` e o comentário dele, e troque a interface:

```ts
export type KeypadDensity = 'compact' | 'comfortable'

export const KEYPAD_DENSITIES: readonly KeypadDensity[] = ['compact', 'comfortable']

/** Faixa do reset automático, em segundos. 0 = só manual. */
export const AUTO_RESET_RANGE = { min: 0, max: 30 } as const

export interface StrategyOverlaySettings extends OverlayPlacement {
  size: OverlaySize
  /** Pede o upcard do dealer antes das cartas do jogador. */
  dealerFirst: boolean
  /** Mostra a linha de índice e distância sob a jogada. */
  showReason: boolean
  /** Segundos até limpar a rodada encerrada sozinha. 0 = manual. */
  autoResetSeconds: number
  keypadDensity: KeypadDensity
}
```

Remova `STRATEGY_OVERLAY_LAYOUTS` de onde estiver declarado (procure com `grep -rn "STRATEGY_OVERLAY_LAYOUTS" src`).

Em `src/shared/defaults.ts`, no `DEFAULT_SETTINGS.strategyOverlay`, tire `layout: 'guide'` e ponha os quatro campos novos:

```ts
    size: 'medium',
    dealerFirst: false,
    showReason: true,
    autoResetSeconds: 0,
    keypadDensity: 'comfortable'
```

`autoResetSeconds: 0` (limpar só no botão) é o default porque o tempo certo depende do ritmo da mesa, e uma rodada que some sozinha no meio de uma consulta é pior do que um clique a mais.

Em `src/main/state/store.ts`, acrescente `AUTO_RESET_RANGE`, `KEYPAD_DENSITIES` e `KeypadDensity` aos imports de `@shared/types`, tire `STRATEGY_OVERLAY_LAYOUTS`, e troque `sanitizeStrategyOverlay`:

```ts
function sanitizeStrategyOverlay(value: unknown): StrategyOverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.strategyOverlay
  // `raw.layout` pode existir em arquivos de versões anteriores; é ignorado de
  // propósito, sem invalidar o resto do objeto.
  return {
    ...sanitizePlacement(raw, fallback, OVERLAY_SIZE_LIMITS.strategyHand),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    dealerFirst: pickBoolean(raw.dealerFirst, fallback.dealerFirst),
    showReason: pickBoolean(raw.showReason, fallback.showReason),
    autoResetSeconds: pickInteger(
      raw.autoResetSeconds,
      AUTO_RESET_RANGE.min,
      AUTO_RESET_RANGE.max,
      fallback.autoResetSeconds
    ),
    keypadDensity: pickEnum(raw.keypadDensity, KEYPAD_DENSITIES, fallback.keypadDensity)
  }
}
```

Em `src/renderer/src/components/SettingsPanel.tsx`: apague `STRATEGY_LAYOUT_OPTIONS` (linhas ~64-67) e o `<Field label="Modo" …>` inteiro do bloco "Overlay de jogada" (~linha 658). No lugar, entre o toggle "Mostrar" e o campo "Tamanho":

```tsx
        <Field label="Ordem" hint="Qual carta o overlay pede primeiro">
          <Segmented
            value={strategyOverlay.dealerFirst ? 'dealer' : 'player'}
            options={[
              { value: 'player', label: 'Minha mão' },
              { value: 'dealer', label: 'Dealer' }
            ]}
            label="Ordem do fluxo de jogada"
            onSelect={(value) => patchStrategyOverlay({ dealerFirst: value === 'dealer' })}
          />
        </Field>

        <Field label="Explicação" hint="Índice e distância sob a jogada">
          <Toggle
            checked={strategyOverlay.showReason}
            label="Mostrar o porquê da jogada"
            onChange={(showReason) => patchStrategyOverlay({ showReason })}
          />
        </Field>

        <Field label="Teclado" hint="Tamanho das teclas de carta">
          <Segmented
            value={strategyOverlay.keypadDensity}
            options={[
              { value: 'compact', label: 'Compacto' },
              { value: 'comfortable', label: 'Confortável' }
            ]}
            label="Densidade do teclado de cartas"
            onSelect={(keypadDensity) => patchStrategyOverlay({ keypadDensity })}
          />
        </Field>

        <Field
          label="Limpar sozinho"
          hint={
            strategyOverlay.autoResetSeconds === 0
              ? 'Só no botão'
              : `${strategyOverlay.autoResetSeconds}s após encerrar`
          }
          stacked
        >
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={strategyOverlay.autoResetSeconds}
            aria-label="Segundos até limpar a rodada"
            onChange={(event) =>
              patchStrategyOverlay({ autoResetSeconds: Number(event.target.value) })
            }
            className="w-full accent-fg"
          />
        </Field>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/store.test.ts`
Expected: PASS. `npm run typecheck` ainda falha — `defaults.ts`, `main/index.ts` e o overlay ainda citam `layout`. É esperado; a Task 13 fecha.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/state/store.ts src/renderer/src/components/SettingsPanel.tsx test/store.test.ts
git commit -m "Troca o modo do overlay de jogada pelos ajustes do fluxo de mão"
```

---

### Task 13: Canvas único e presets

**Files:**
- Modify: `src/shared/defaults.ts`, `src/main/index.ts`, `src/main/ipc/handlers.ts`
- Test: `test/overlaySize.test.ts`

**Interfaces:**
- Produces: `STRATEGY_HAND_CANVAS: Size`, `STRATEGY_OVERLAY_SIZES: Record<OverlaySize, Size>`, `OVERLAY_SIZE_LIMITS.strategyHand`.
- Removidos: `STRATEGY_GUIDE_CANVAS`, `STRATEGY_MATRIX_CANVAS`, `STRATEGY_GUIDE_ROWS`, `strategyGuideRows`, `OVERLAY_SIZE_LIMITS.strategyGuide`, `OVERLAY_SIZE_LIMITS.strategyMatrix`.

- [ ] **Step 1: Write the failing test**

Em `test/overlaySize.test.ts`, apague os testes que citam `strategyGuideRows`, `STRATEGY_GUIDE_ROWS` e `STRATEGY_MATRIX_CANVAS` (procure por eles; estão perto das linhas 140-180) e ponha no lugar:

```ts
  /**
   * O overlay de jogada tem proporção fixa: preset fora dela corta o layout
   * embaixo, e como o contêiner é overflow-hidden o corte não deixa sinal na
   * tela.
   */
  it('os presets do overlay de jogada seguem a proporção do canvas', () => {
    const ratio = STRATEGY_HAND_CANVAS.height / STRATEGY_HAND_CANVAS.width
    for (const [name, size] of Object.entries(STRATEGY_OVERLAY_SIZES)) {
      expect(size.height / size.width, `preset ${name}`).toBeCloseTo(ratio, 1)
    }
  })

  it('o piso do overlay de jogada também segue a proporção', () => {
    const ratio = STRATEGY_HAND_CANVAS.height / STRATEGY_HAND_CANVAS.width
    const { min } = OVERLAY_SIZE_LIMITS.strategyHand
    expect(min.height / min.width).toBeCloseTo(ratio, 1)
  })

  it('os presets cabem entre o piso e o teto', () => {
    const { min, max } = OVERLAY_SIZE_LIMITS.strategyHand
    for (const size of Object.values(STRATEGY_OVERLAY_SIZES)) {
      expect(size.width).toBeGreaterThanOrEqual(min.width)
      expect(size.width).toBeLessThanOrEqual(max.width)
      expect(size.height).toBeGreaterThanOrEqual(min.height)
      expect(size.height).toBeLessThanOrEqual(max.height)
    }
  })
```

Ajuste os imports do arquivo: entra `STRATEGY_HAND_CANVAS`, saem `STRATEGY_MATRIX_CANVAS` e `strategyGuideRows`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/overlaySize.test.ts`
Expected: FAIL — `STRATEGY_HAND_CANVAS` não existe.

- [ ] **Step 3: Write the implementation**

Em `src/shared/defaults.ts`: apague `STRATEGY_GUIDE_CANVAS`, `STRATEGY_MATRIX_CANVAS`, `STRATEGY_GUIDE_ROWS` e a função `strategyGuideRows` (com os comentários deles), e troque `STRATEGY_OVERLAY_SIZES` e os limites:

```ts
/**
 * Tamanho intrínseco do overlay de jogada, em px de canvas — o que a janela
 * escala por `zoom` até caber.
 *
 * VALOR PROVISÓRIO até a medição do passo seguinte desta task. A proporção é o
 * que importa: preset mais baixo que height/width corta o layout embaixo, e o
 * contêiner é overflow-hidden, então o corte não deixa sinal na tela.
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
```

E em `OVERLAY_SIZE_LIMITS`, troque as duas entradas por uma:

```ts
  strategyHand: { min: { width: 170, height: 142 }, max: { width: 520, height: 433 } }
```

Em `src/main/index.ts` (linhas ~149-155):

```ts
    getPreset: () => STRATEGY_OVERLAY_SIZES[controller.getSnapshot().settings.strategyOverlay.size],
    getLimits: () => OVERLAY_SIZE_LIMITS.strategyHand,
```

Em `src/main/ipc/handlers.ts` (~linha 155), tire a comparação de `layout` do `presetChanged` do overlay de jogada, deixando só `before.strategyOverlay.size !== after.strategyOverlay.size`. Ajuste o comentário da linha 111, que fala em "`size` e `layout`", para citar só `size`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/overlaySize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/defaults.ts src/main/index.ts src/main/ipc/handlers.ts test/overlaySize.test.ts
git commit -m "Canvas e presets únicos para o overlay de jogada"
```

---

### Task 14: Ligar o overlay ao fluxo e apagar o guia

**Files:**
- Modify: `src/renderer/src/StrategyOverlayApp.tsx`, `test/strategyOverlayApp.test.tsx`
- Delete: `src/renderer/src/components/StrategyGuide.tsx`, `test/strategyGuide.test.tsx`

**Interfaces:**
- Consumes: `HandRound` (Task 11), `STRATEGY_HAND_CANVAS` (Task 13).

- [ ] **Step 1: Rewrite the overlay test**

Substitua o conteúdo de `test/strategyOverlayApp.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyOverlayApp } from '../src/renderer/src/StrategyOverlayApp'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { snapshot, stubApi } from './reactHelpers'

afterEach(cleanup)

const pick = (rank: string) => fireEvent.click(screen.getByRole('button', { name: `carta ${rank}` }))

describe('StrategyOverlayApp', () => {
  it('abre pedindo a mão do jogador', async () => {
    stubApi(snapshot({ strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true } }))
    render(<StrategyOverlayApp />)
    expect(await screen.findByText('Sua mão')).toBeTruthy()
  })

  /**
   * A invariante central do projeto, na fiação: os índices publicados são de
   * Hi-Lo e a escala do KO é outra. `countAware` sai de `system === 'hilo'`;
   * trocado, um jogador de KO veria 16 vs 10 mandando parar — conselho errado
   * com cara de certo. Sem rendição, a básica de 16 vs 10 é pedir, o oposto
   * exato do desvio do Illustrious 18.
   */
  it('em KO mostra a básica, não o desvio de Hi-Lo', async () => {
    stubApi(
      snapshot(
        {
          shoe: { ...DEFAULT_SETTINGS.shoe, system: 'ko', surrender: false },
          strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true }
        },
        // 21 cartas altas contra o IRC de -20 de 6 baralhos põem o
        // decisionCount em +1, onde o desvio estaria ativo se a fiação
        // estivesse invertida.
        21
      )
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Sua mão')
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('pedir')
  })

  /*
    Nada é desenhado antes do primeiro snapshot: cair em DEFAULT_SETTINGS
    significaria `system: 'hilo'`, e um jogador de KO veria um frame com
    desvios de Hi-Lo.
  */
  it('não desenha nada antes do primeiro snapshot', () => {
    stubApi(snapshot())
    const { container } = render(<StrategyOverlayApp />)
    expect(container.firstChild).toBe(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/strategyOverlayApp.test.tsx`
Expected: FAIL — o overlay ainda desenha o guia.

- [ ] **Step 3: Rewrite the overlay**

Substitua o corpo de `src/renderer/src/StrategyOverlayApp.tsx` da linha do `import` até o `return`, mantendo o bloco de comentário sobre o snapshot nulo:

```tsx
import { useEffect } from 'react'

import { STRATEGY_HAND_CANVAS, STRATEGY_OVERLAY_CARD_BORDER } from '@shared/defaults'

import { HandRound } from '@/components/HandRound'
import { ResizeGrip } from '@/components/ResizeGrip'
import { useCounterState } from '@/useCounterState'
import { useWindowSize } from '@/useWindowSize'
```

E dentro do componente, no lugar do cálculo de escala por layout:

```tsx
  const availableWidth = Math.max(1, windowSize.width - STRATEGY_OVERLAY_CARD_BORDER)
  const availableHeight = Math.max(1, windowSize.height - STRATEGY_OVERLAY_CARD_BORDER)

  // Layout de proporção fixa: escala pela menor dimensão, senão corta.
  const scale = Math.min(
    availableWidth / STRATEGY_HAND_CANVAS.width,
    availableHeight / STRATEGY_HAND_CANVAS.height
  )
```

E o miolo do JSX:

```tsx
      <div className="p-2" style={{ width: STRATEGY_HAND_CANVAS.width, zoom: scale }}>
        <HandRound
          system={settings.shoe.system}
          decisionCount={derived.decisionCount}
          surrender={settings.shoe.surrender}
          insuranceOn={derived.insuranceOn}
          dealerFirst={settings.strategyOverlay.dealerFirst}
          showReason={settings.strategyOverlay.showReason}
          autoResetSeconds={settings.strategyOverlay.autoResetSeconds}
          keypadDensity={settings.strategyOverlay.keypadDensity}
        />
      </div>
```

Remova `layout` da desestruturação de `settings.strategyOverlay`.

- [ ] **Step 4: Delete the dead guide**

```bash
git rm src/renderer/src/components/StrategyGuide.tsx test/strategyGuide.test.tsx
```

Confirme que nada mais o cita:

```bash
grep -rn "StrategyGuide" src test
```

Expected: sem resultados.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Overlay de jogada passa a ser só o fluxo de decisão por mão"
```

---

### Task 15: Medir o canvas e ajustar os presets

**Files:**
- Modify: `src/shared/defaults.ts`

Esta task troca o valor provisório da Task 13 pelo real. É o mesmo procedimento documentado em `STRATEGY_MATRIX_CANVAS` ("MEDIDO, não estimado").

- [ ] **Step 1: Run the app**

Run: `npm run dev`

Ligue o overlay de jogada nos ajustes.

- [ ] **Step 2: Measure the canvas**

Nas DevTools da janela do overlay (menu View → Toggle Developer Tools, ou `Ctrl+Shift+I` com a janela em foco), com a rodada no passo do teclado (o estado mais alto do layout, porque teclado e decisão nunca aparecem juntos):

```js
const el = document.querySelector('[style*="zoom"]')
console.log(el.scrollWidth, el.scrollHeight / (Number(getComputedStyle(el).zoom) || 1))
```

Repita com uma separação em três mãos ativa, que acrescenta a tira — é o pior caso e é o que dita a altura.

- [ ] **Step 3: Update the constants**

Em `src/shared/defaults.ts`, ponha a altura medida (arredondada para cima) em `STRATEGY_HAND_CANVAS`, troque o comentário "VALOR PROVISÓRIO" por uma nota de medição no formato do `STRATEGY_MATRIX_CANVAS` (Chromium do Electron 43 no Windows, pior caso), e reproporcione os três presets e o piso de `OVERLAY_SIZE_LIMITS.strategyHand` para a nova razão, mantendo as larguras 200/240/290 e o piso de 170.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — os testes de proporção da Task 13 são justamente o que valida os números novos.

- [ ] **Step 5: Commit**

```bash
git add src/shared/defaults.ts
git commit -m "Mede o canvas do overlay de jogada e reproporciona os presets"
```

---

### Task 16: Versão e changelog

**Files:**
- Modify: `package.json`, `src/shared/changelog.ts`

Um teste já existente garante que a versão de `package.json` tem entrada no changelog, então os dois mudam juntos.

- [ ] **Step 1: Bump the version**

Em `package.json`, `"version": "0.4.0"`.

- [ ] **Step 2: Add the changelog entry**

No topo de `CHANGELOG` em `src/shared/changelog.ts`:

```ts
  {
    version: '0.4.0',
    date: '2026-08-23',
    changes: [
      'O overlay de jogada agora responde sobre a SUA mão: clique nas suas cartas e na do dealer e ele diz o que fazer, com a explicação do índice quando a contagem muda a jogada.',
      'Separação completa: até quatro mãos, re-separação, ases separados com uma carta só e dobra depois de separar.',
      'Desfazer no overlay: clique errado tira a última carta em vez de recomeçar a rodada.',
      'O overlay de jogada funciona no KO, mostrando a estratégia básica — antes ele só explicava por que não podia ajudar.',
      'Os modos guia e matriz saíram do overlay; os dois continuam na aba Desvios da janela principal.'
    ]
  },
```

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: PASS, incluindo `test/changelog.test.ts`.

- [ ] **Step 4: Full verification**

Run: `npm run typecheck`
Expected: sem erros.

Run: `npm run build`
Expected: build completo sem erros.

- [ ] **Step 5: Commit**

```bash
git add package.json src/shared/changelog.ts
git commit -m "Versão 0.4.0"
```
