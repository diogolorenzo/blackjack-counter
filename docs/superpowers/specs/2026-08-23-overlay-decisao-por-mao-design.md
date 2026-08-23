# Overlay de decisão por mão

Data: 2026-08-23

## Problema

O overlay de jogada entregue em 0.3.0 responde a pergunta errada.

O app inteiro é construído sobre a invariante declarada em `src/shared/types.ts`:
ele só recebe `+1 / 0 / -1` pelas hotkeys e **nunca sabe o rank de uma carta**.
Consequência direta: não sabe a mão do jogador nem o upcard do dealer. O overlay
só consegue então ser *count-cêntrico* — "o que mudou neste true count?" — quando
a pergunta real na mesa é *hand-cêntrica*: "tenho 16 contra 10, e agora?".

O sintoma, medido em sessões reais:

- **TC baixo, que é o caso mais frequente**: a lista de desvios ativos fica vazia
  e o guia mostra "Nada mudou: estratégia básica em todas as mãos". Correto e
  inútil — não ajuda na mão que está na mesa.
- **TC alto**: aparecem 5–10 desvios ordenados por índice. A chance de a mão do
  jogador estar entre eles é pequena; ele lê uma lista de mãos hipotéticas.
- **Layout `matrix`**: resolve a relevância (tem tudo) e destrói a velocidade —
  ~270 células de letras codificadas para varrer em segundos, sob pressão social.

Ou seja: `guide` é rápido e pouco relevante, `matrix` é relevante e lento. Falta
exatamente o meio: a resposta sobre *esta* mão.

O spec de 2026-08-21 listou "overlay de jogada interativo (escolher mão e carta
do dealer no clique)" como fora de escopo. Este spec é esse item.

## Escopo

Entra:

- o overlay de estratégia passa a ter **uma única forma**: decisão por mão, guiada
  por cliques em ranks de carta;
- domínio novo de mão (cartas → total/soft/par → chave de linha da tabela);
- reducer puro de rodada, com pedir, dobrar, separar, estourar e desfazer;
- **separação (split)** completa: até 4 mãos, re-split, ases separados com uma
  carta só, dobra após separar;
- ajustes próprios do overlay (ordem do fluxo, mostrar o porquê, reset automático,
  densidade do teclado);
- estratégia básica no KO, que hoje não existe no overlay.

Não entra:

- alimentar a contagem a partir dos cliques de rank — decisão explícita, ver
  "Decisões de fundo";
- mudar a tabela de estratégia básica ou os índices publicados;
- tabela de índices própria para o KO;
- seguro como passo do fluxo (continua sendo uma linha de estado, ver abaixo);
- persistir a rodada entre reinícios do app.

## Decisões de fundo

**O clique de rank NÃO entra na contagem.** Seria tentador: o jogador já está
dizendo quais cartas viu, e o app poderia derivar o bucket sozinho. Fica de fora
porque criaria uma segunda porta de entrada para o count, com desfazer próprio,
convivendo com as hotkeys e com o histórico de shoe. O count é a coisa que o app
não pode errar; a mão é efêmera. Manter os dois desacoplados significa que
nenhum bug do fluxo de mão pode corromper uma sessão de banca. O jogador segue
contando as cartas pelas hotkeys, inclusive as próprias.

**Estado da rodada vive no renderer do overlay.** A mão dura uma rodada, não vira
estatística, não precisa sobreviver a restart, e a única janela que a lê é o
overlay. Colocá-la no `AppSnapshot` acrescentaria canais IPC e estado efêmero de
UI ao dono da verdade do count, sem benefício. Subir para o main depois é fácil;
descer não é.

**A lógica de rodada é um reducer puro, não `useState` na tela.** Com split o
número de transições (qual mão está ativa, quais já encerraram, quando dobrar
deixa de ser possível, ases separados) passa do ponto em que dá para verificar
clicando. `src/shared/domain/round.ts` fica testável sem React, como o resto de
`src/shared/domain/`.

**Nenhuma lógica de estratégia é reescrita.** `cellDecision` continua sendo a
única fonte da jogada, e `fallbackAction` — que já existe em `basicStrategy.ts` —
continua resolvendo "já pediu carta, então dobrar vira pedir". O que se
acrescenta é um adaptador de cartas para chave de linha.

**J, Q e K entram como `10`.** Para a jogada só o valor importa, e o count é
separado. Teclado de 10 teclas em vez de 13, com teclas maiores — o que importa
num overlay clicado às pressas.

**O overlay perde os layouts `guide` e `matrix`, e nada se perde com isso.** A
lista de desvios e a matriz completa já existem na janela principal, na aba
Desvios, com seletor de layout (`DeviationTable.tsx`). Cada coisa passa a ficar
onde serve: consulta e estudo na janela, decisão na mesa no overlay.

**No KO o overlay finalmente ajuda.** Hoje o guia em KO mostra só um parágrafo
explicando por que não pode dar índices. Com decisão por mão, o KO ganha a
estratégia básica completa — a maior parte do valor de um guia de jogada — e
omite apenas a camada de desvio. A invariante do projeto (nunca aplicar índice de
Hi-Lo a um contador de KO) é preservada: `countAware` continua governando a
camada de desvio.

## Arquitetura

Três camadas, na direção de dentro para fora:

```
src/shared/domain/hand.ts     cartas  → valor da mão → chave de linha
src/shared/domain/round.ts    reducer da rodada (estado + transições)
src/renderer/.../StrategyOverlayApp.tsx + componentes de UI
```

### `src/shared/domain/hand.ts`

Puro, sem React e sem Electron.

```ts
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
export const RANKS: readonly Rank[]

export interface HandValue {
  /** Melhor total que não estoura; se todos estouram, o menor total. */
  total: number
  /** Tem um ás contado como 11. */
  soft: boolean
  /** Exatamente duas cartas de mesmo valor. */
  isPair: boolean
  busted: boolean
  /** Duas cartas somando 21, e a mão não veio de separação. */
  blackjack: boolean
}

export function handValue(cards: readonly Rank[], fromSplit: boolean): HandValue
```

Regra do ás: conta 11 enquanto não estourar, senão 1. `A,A` vale 12 e é par.

```ts
export type HandRowKey = string  // os ids que HAND_ROWS já usa

export type RowLookup =
  | { kind: 'row'; key: HandRowKey }
  | { kind: 'always'; action: 'hit' | 'stand' }

export function handRowKey(value: HandValue, canSplit: boolean): RowLookup
```

Duas bordas que `HAND_ROWS` não cobre e que precisam de resposta sem consultar a
tabela:

- **hard ≤ 7** — não existe linha abaixo de `hard-8`; a resposta é sempre pedir.
- **hard ≥ 18** e **soft ≥ 20** — não existem linhas acima de `hard-17` e
  `soft-19`; a resposta é sempre ficar.
- **soft ≤ 12** — a única mão nessa faixa é `A,A` lida sem separação (não existe
  linha `soft-12`); a resposta é sempre pedir.

`canSplit` false força a leitura pela linha hard/soft equivalente: um par de 8
que não pode mais ser separado (limite de mãos atingido) é `hard-16`, não
`pair-8`.

### `src/shared/domain/round.ts`

```ts
export type RoundStep = 'player' | 'dealer' | 'playing' | 'done'

export type HandStatus = 'pending' | 'active' | 'stood' | 'busted' | 'doubled' | 'blackjack'

export interface PlayerHand {
  id: string
  cards: Rank[]
  status: HandStatus
  /** Veio de uma separação: sem blackjack natural, e dobra depende de DAS. */
  fromSplit: boolean
  /** Ases separados: recebe uma carta e encerra. */
  splitAces: boolean
}

export interface RoundState {
  step: RoundStep
  hands: PlayerHand[]
  activeIndex: number
  upcard: Upcard | null
  /**
   * Pilha para desfazer. Guarda estados anteriores inteiros, cada um já com
   * `past` vazio — sem isso a estrutura cresceria em O(n²) ao longo da rodada.
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

export function roundReducer(state: RoundState, action: RoundAction): RoundState
export function initialRound(dealerFirst: boolean): RoundState
```

Regras de mesa como constantes nomeadas, com o motivo no comentário:

- `MAX_HANDS = 4` — três separações, regra da esmagadora maioria das mesas.
- **DAS permitido** — não é configurável porque as tabelas de básica deste
  projeto já foram construídas assumindo dobra após separar; torná-lo ajustável
  exigiria uma segunda tabela, e uma tabela errada é pior que uma regra fixa
  documentada.
- **Ases separados recebem uma carta e encerram** — padrão de cassino. Ignorar
  isso daria conselho errado com cara de certo, que é o modo de falha que este
  projeto trata como inaceitável.
- **Re-split permitido** enquanto `hands.length < MAX_HANDS`; um par que surge
  depois da separação volta a ler a linha `pair-*`.

Transições:

| Estado | Ação | Resultado |
|---|---|---|
| `player` (0–1 cartas) | `addCard` | acrescenta; com 2 cartas vai para `dealer` |
| `dealer` | `addCard` | define `upcard`; vai para `playing` |
| `playing` | `addCard` | acrescenta à mão ativa; estourou → `busted`, avança |
| `playing` | `stand` | mão ativa → `stood`, avança |
| `playing` | `double` | próxima carta encerra a mão como `doubled` |
| `playing` | `split` | mão ativa vira duas, cada uma com uma carta, status `pending` |
| qualquer | `undo` | desempilha `past` |
| qualquer | `reset` | volta a `initialRound` |

"Avança" = ativa a próxima mão `pending`; se não houver, `step` vira `done`.

Com `dealerFirst`, `initialRound` começa em `dealer` e passa a `player` depois do
upcard. É o mesmo reducer, só a ordem inicial muda.

### Derivação da decisão

Função pura, sem estado, chamada a cada render:

```ts
export interface HandDecision {
  action: PlayAction
  /** A contagem mudou esta jogada em relação à básica. */
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
): HandDecision
```

Fluxo: `handValue` → `handRowKey` → `cellDecision` (ou `basicAction` quando
`countAware` é false, exatamente como `StrategyGrid` já faz) → `fallbackAction`
quando dobrar ou render não é possível.

- `canDouble`: exatamente 2 cartas na mão (DAS permitido, então vale também após
  separar)
- `canSplit`: `isPair` e `handCount < MAX_HANDS`
- `canSurrender`: `rules.surrender`, 2 cartas e `!fromSplit`

## Interface

Um passo por vez, ocupando a janela inteira:

**Passo mão / dealer.** Título curto ("Sua mão", "Dealer", "Mão 2 — carta nova")
e um teclado de 10 ranks em grade 5×2. As cartas já escolhidas aparecem acima do
teclado como fichas pequenas, clicáveis para remover (que emite `undo`).

**Passo decisão.** Bloco grande, a jogada em caixa alta, colorida pela mesma
paleta de `ACTION_TONE` que a matriz usa — o olho procura a cor e lê a letra
depois. Abaixo, uma linha de contexto, ocultável:

```
básica
```
ou
```
desvio · índice +4 · você está em +5
```

Abaixo, os botões contextuais habilitados por `HandDecision`: **Pedir**,
**Dobrar**, **Separar**, **Render** (só quando `canSurrender`), **Ficar**,
**Nova mão**. Render encerra a rodada, como `stand` — o app não modela o valor
apostado, então não há nada a calcular além de sair da mão.

**Barra de estado, sempre visível**, em fonte pequena: sistema e count
(`TC +3` / `RC -2`), e a linha de seguro quando o upcard é ás — reaproveitando o
`derived.insuranceOn` que já existe, do mesmo jeito que o guia atual faz.

**Com mais de uma mão**, uma tira acima mostra `Mão 1 · 18 ✓` / `Mão 2 · 12 ←` /
`Mão 3 · —`, com a ativa destacada e as encerradas com seu total final.

**Estados de fim.** `busted` mostra "Estourou"; `done` mostra o resumo das mãos e
o botão de nova mão. Se o reset automático estiver ligado, um contador discreto.

**Acessibilidade.** As teclas de rank são `<button>` de verdade, com
`aria-label` explícito ("carta 10"). Isso interage com a regra
`.app-drag button { -webkit-app-region: no-drag }` já documentada em
`StrategyGrid.tsx`: com o overlay destravado, os botões não arrastam a janela.
Com poucas teclas grandes, sobra moldura suficiente para arrastar — ao contrário
das ~270 células da matriz, que foi o que motivou aquele comentário.

## Ajustes

Em `StrategyOverlaySettings`:

```ts
export interface StrategyOverlaySettings extends OverlayPlacement {
  size: OverlaySize
  /** Pede o upcard do dealer antes das cartas do jogador. */
  dealerFirst: boolean
  /** Mostra a linha "desvio · índice · distância" sob a jogada. */
  showReason: boolean
  /** Segundos até limpar a rodada encerrada sozinha. 0 = manual. */
  autoResetSeconds: number
  /** Tamanho das teclas de rank. */
  keypadDensity: 'compact' | 'comfortable'
}
```

`layout` é removido do tipo. O settings.json de quem já usa o app tem o campo
gravado: a leitura precisa ignorá-lo silenciosamente, sem invalidar o arquivo
inteiro — o mesmo tratamento que o comentário de `BetSpreadRule.minTrueCount`
descreve para nomes herdados.

Ficam de fora por ora, para não inventar necessidade: teclas J/Q/K separadas,
hotkeys de rank, DAS/re-split configuráveis, tema próprio do overlay.

## Dimensionamento da janela

`STRATEGY_GUIDE_CANVAS` e `STRATEGY_MATRIX_CANVAS` deixam de valer: existe um só
canvas agora. `strategyGuideRows`, que calculava quantas linhas de desvio cabiam,
some junto. O novo canvas é de proporção fixa e escala pela menor dimensão, como
`matrix` já fazia — o layout não tem lista variável, então não há o problema de
orçamento de linhas que motivou aquela função.

Os presets de tamanho precisam ser reproporcionados para o novo canvas.

## Erros e casos de borda

- **Clique errado**: `undo` remove a última carta; a ficha da carta também é
  clicável. Sem isso, a única saída seria resetar a rodada — inaceitável na mesa.
- **`decideHand` sem upcard**: impossível por construção (`playing` exige upcard),
  mas o tipo obriga a tratar; a UI só renderiza a decisão em `playing`.
- **Mão já estourada**: nenhuma ação além de avançar.
- **21 nas duas primeiras cartas**: `blackjack` encerra a mão sozinha; vindo de
  separação não é blackjack natural, e a mão segue jogável (relevante para ases
  separados, onde ela encerra por outro motivo).
- **`snapshot === null`**: o overlay continua não desenhando nada antes do primeiro
  snapshot, pelo motivo já documentado em `StrategyOverlayApp.tsx` — cair no
  default significaria `system: 'hilo'` e um jogador de KO veria um frame de
  conselho errado.
- **Troca de sistema ou novo shoe no meio da rodada**: a rodada não é resetada. O
  count muda, a decisão recalcula sozinha; a mão física na mesa continua a mesma.

## Testes

`src/shared/domain/hand.ts` — totais duros e moles, ás virando 1 no estouro,
`A,A` = 12 e par, detecção de par, blackjack natural versus 21 pós-separação, as
duas bordas de `handRowKey` (hard ≤ 7, hard ≥ 18, soft ≥ 20), e `canSplit` false
lendo par como hard.

`src/shared/domain/round.ts` — cada transição da tabela acima; separação gerando
duas mãos com uma carta cada; re-split até `MAX_HANDS` e bloqueio no limite; ases
separados recebendo uma carta e encerrando; dobra encerrando na carta seguinte;
avanço para a próxima mão pendente e chegada em `done`; `undo` atravessando uma
separação; `dealerFirst` invertendo a ordem inicial.

`decideHand` — integração com `cellDecision`: com o mesmo count, a decisão de uma
mão de duas cartas bate com a célula correspondente da matriz. Com `countAware`
false (KO), nunca vem `deviated: true`. Depois de pedir carta, dobrar vira pedir.

UI — o fluxo completo de uma rodada com separação, por cliques.

## Fases

1. `hand.ts` e `round.ts` com testes, sem UI.
2. UI do fluxo de mão única: mão, dealer, decisão, pedir, dobrar, ficar, estourar.
3. Separação: tira de mãos, navegação, re-split, ases.
4. Ajustes, remoção dos layouts antigos, migração de settings, reproporção dos
   presets.
