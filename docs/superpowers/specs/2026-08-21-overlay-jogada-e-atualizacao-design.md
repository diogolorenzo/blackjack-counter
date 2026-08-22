# Overlay de jogada, overlays redimensionáveis e atualização discreta

Data: 2026-08-21 · Versão alvo: 0.3.0

## Problema

Três queixas, uma release:

1. **Não existe overlay de decisão de mão.** O app calcula a jogada correta para
   cada célula da matriz reagindo ao count (`cellDecision`), mas isso só aparece
   na aba **Desvios** da janela principal — ou seja, só para quem tira o foco do
   jogo, que é exatamente o que o app existe para evitar. Não há nem a janela
   nem ajustes para ela.
2. **Os overlays só têm três tamanhos.** `small`/`medium`/`large` cobrem mal
   monitores fora do comum e não deixam encaixar a janela num vão específico da
   mesa.
3. **A tela de atualização é um `dialog.showMessageBox` do Windows.** Funciona,
   mas destoa do resto do app, e a checagem só acontece 30 s depois do boot e a
   cada 6 h — uma release recém-publicada demora horas para ser vista.

## Escopo

Entra:

- segunda janela de overlay com guia de jogada, com ajustes próprios;
- redimensionamento livre com o mouse nos **dois** overlays, além dos presets;
- substituição do diálogo nativo por uma pílula discreta na janela principal;
- checagem de atualização mais frequente.

Não entra: mudar a estratégia básica ou a tabela de índices; tabela de índices
própria para o KO; overlay de jogada interativo (escolher mão e carta do dealer
no clique).

## Decisões de fundo

**Janela separada, não um layout do overlay atual.** O jogador quer contagem e
guia de jogada ao mesmo tempo, em cantos diferentes. Um terceiro valor de
`OverlaySettings.layout` obrigaria a escolher um dos dois.

**No KO o overlay mostra estratégia básica pura.** `deviationsForSystem('ko')`
devolve `[]` de propósito: os índices publicados são de Hi-Lo e a escala do KO é
outra (running count em torno do pivô). Alimentar `cellDecision` com o número de
decisão do KO produziria conselho errado com cara de certo. O app já esconde a
aba Desvios fora do Hi-Lo; o overlay segue a mesma regra e diz por quê.

**A alça de redimensionar é do renderer, não do Windows.** `resizable: true`
nativo numa janela `frame: false` + `transparent: true` põe a borda de arrasto
na região transparente, fora do retângulo arredondado visível, e `focusable:
false` piora o hit-test. Uma alça desenhada no canto inferior direito, ativa só
com o overlay destravado, é previsível e usa o mesmo modelo mental que o arrasto
já tem.

**A pílula de atualização não precisa de gate de foco.** O diálogo precisava:
roubar a tela no meio de uma mão é o pior momento possível. Uma pílula passiva
no rodapé da janela principal não interrompe nada, então `shouldPromptForUpdate`
e o estado `mainWindowFocused` deixam de existir.

## Arquitetura

### Tipos compartilhados (`src/shared/types.ts`)

```ts
export interface OverlayPlacement {
  corner: Corner
  margin: number
  opacity: number
  locked: boolean
  visible: boolean
  customPosition: { x: number; y: number } | null
  /** Tamanho vindo do arrasto da alça. null = usar o preset. */
  customSize: { width: number; height: number } | null
}

export interface OverlaySettings extends OverlayPlacement {
  size: OverlaySize
  layout: OverlayLayout          // 'full' | 'minimal'
  historyLength: number
  showCurrency: boolean
}

export type StrategyOverlayLayout = 'guide' | 'matrix'

export interface StrategyOverlaySettings extends OverlayPlacement {
  size: OverlaySize
  layout: StrategyOverlayLayout
}

export interface Settings {
  // ...campos existentes
  overlay: OverlaySettings
  strategyOverlay: StrategyOverlaySettings
}
```

`strategyOverlay` é chave nova de primeiro nível e `customSize` é campo novo
dentro de duas existentes. Ambos são aditivos: `sanitizeSettings` faz merge
profundo sobre `DEFAULT_SETTINGS` antes de validar campo a campo, então todo
`settings.json` já gravado ganha os valores padrão sem migração escrita à mão.

Defaults do overlay de jogada: canto `bottom-right`, margem 16, `layout:
'guide'`, `size: 'medium'`, opacidade 0.82, `locked: true`, `visible: false`,
`customPosition: null`, `customSize: null`.

`locked: true` no default é deliberado: destravado, o overlay recebe os cliques
que deveriam ir para o jogo. Quem quiser mover ou redimensionar destrava em
Ajustes, ajusta e trava de volta — o hint do toggle já diz "Destravado permite
arrastar" e passa a dizer "arrastar e redimensionar".

### Tamanhos (`src/shared/defaults.ts`)

`OVERLAY_SIZES` continua servindo o overlay de contagem. O de jogada tem tabela
própria indexada por layout, porque guia e matriz têm proporções incomparáveis:

```ts
export const STRATEGY_OVERLAY_SIZES: Record<
  StrategyOverlayLayout,
  Record<OverlaySize, { width: number; height: number }>
> = {
  guide:  { small: { width: 200, height: 124 }, medium: { width: 240, height: 156 }, large: { width: 290, height: 190 } },
  matrix: { small: { width: 244, height: 334 }, medium: { width: 292, height: 400 }, large: { width: 344, height: 470 } }
}
```

Limites do redimensionamento livre:

```ts
export const OVERLAY_SIZE_LIMITS = {
  count:          { min: { width: 150, height:  92 }, max: { width: 560, height: 340 } },
  strategyGuide:  { min: { width: 170, height: 105 }, max: { width: 520, height: 420 } },
  strategyMatrix: { min: { width: 210, height: 288 }, max: { width: 620, height: 840 } }
}
```

### Clamp de tamanho (`src/shared/domain/overlaySize.ts`, novo)

```ts
export interface SizeLimits { min: Size; max: Size }

/**
 * Ordem: piso -> teto -> workArea. A workArea vem por último porque um monitor
 * menor que o piso deve devolver a workArea, não o piso: janela maior que a
 * tela não tem como ser arrastada de volta.
 */
export function clampOverlaySize(desired: Size, limits: SizeLimits, area: Size): Size
```

Função pura, sem `electron`, testável direto. Usada em três lugares: no arrasto
da alça, na sanitização das settings e na hora de resolver o tamanho efetivo.

```ts
/** Tamanho efetivo: o customizado se houver, senão o preset. Sempre clampado. */
export function effectiveOverlaySize(
  preset: Size,
  custom: Size | null,
  limits: SizeLimits,
  area: Size
): Size
```

### Controlador de janela (`src/main/windows/overlayWindow.ts`)

Deixa de conhecer `overlay.html` e `settings.overlay`; passa a ser
parametrizado:

```ts
export interface OverlayWindowSpec {
  /** Arquivo em src/renderer: 'overlay.html' | 'strategy.html'. */
  page: string
  getPlacement: () => OverlayPlacement
  /** Tamanho do preset em vigor, já resolvido por layout. */
  getPresetSize: () => Size
  getLimits: () => SizeLimits
  onMoved: (pos: { x: number; y: number }) => void
  onResized: (size: Size) => void
}

export interface OverlayController {
  ensure(): BrowserWindow
  setVisible(visible: boolean): void
  setLocked(locked: boolean): void
  /** Sem argumento: lê tudo pelos getters do spec. */
  applyPlacement(): void
  /** Arrasto da alça. Clampa e escreve os bounds; a persistência vem do evento 'resized'. */
  resizeTo(size: Size): void
  get(): BrowserWindow | null
  destroy(): void
}

export function createOverlayWindow(spec: OverlayWindowSpec): OverlayController
```

O que se mantém intacto: `clampToArea` (a janela nunca vai para coordenadas de
um monitor desconectado), `cornerPosition`, as flags da janela (`transparent`,
`frame: false`, `focusable: false`, `skipTaskbar`, `hasShadow: false`,
`alwaysOnTop` em nível `screen-saver`, `setVisibleOnAllWorkspaces`),
`showInactive` em vez de `show`, e a guarda de eco do evento `moved`.

O que muda:

- **Helper único de escrita de bounds.** O Windows ignora `setBounds` enquanto
  a janela está com `resizable: false`; hoje `applyPlacement` destrava e
  retrava em volta da chamada. Isso vira `writeBounds(win, bounds)`, usado
  também por `resizeTo`.
- **Guarda de eco para tamanho.** `placedAt` ganha um irmão `placedSize`. Todo
  `setBounds` emite `resize` além de `moved`; sem a guarda, aplicar um preset
  gravaria o preset de volta como `customSize` e o seletor de tamanho nunca
  mais grudaria — o mesmo bug que a guarda de `moved` já evita, no outro eixo.
- **`resized` persiste o tamanho**, do mesmo jeito que `moved` persiste a
  posição, passando pelo debounce de 300 ms de `SETTINGS_WRITE_DEBOUNCE_MS` que
  já existe. O IPC do arrasto não escreve settings: só chama `resizeTo`.
- **`applyPlacement` resolve o tamanho por `effectiveOverlaySize`**, combinando
  `getPresetSize()`, `placement.customSize` e `getLimits()` contra a workArea do
  monitor mais próximo. É o único lugar que decide qual dos dois tamanhos vale.

### Segunda janela

- `src/renderer/strategy.html` — cópia da CSP e do esqueleto de `overlay.html`,
  `data-window="strategy"`, aponta para `src/strategyOverlay.tsx`.
- Entrada `strategy` em `rollupOptions.input` no `electron.vite.config.ts`.
- Em `main/index.ts`, dois `createOverlayWindow`. `liveWindows()` passa a
  incluir os dois, de forma que o broadcast do snapshot alcance a janela nova.
- `handlers.ts`: `syncOverlay` passa a receber `(before, after, controller)` e é
  chamada duas vezes em `applyPatch`. `placementChanged` compara também `layout`
  e `customSize` — no overlay de jogada, trocar guia↔matriz muda o tamanho da
  janela, não só o conteúdo. No de contagem `layout` não mexe no tamanho, e um
  `applyPlacement` a mais ali é inócuo: ele reescreve os mesmos bounds.

### IPC

Canais novos em `IPC`:

| canal | payload | efeito |
| --- | --- | --- |
| `overlay:resizeTo` | `kind: 'count' \| 'strategy'`, `width`, `height` | clampa e escreve os bounds da janela |
| `update:install` | — | `autoUpdater.quitAndInstall(true, true)` |
| `update:dismiss` | — | esconde a pílula até a próxima pendência |

Evento novo em `IPC_EVENTS`: `update:status`, main → todas as janelas.

`CounterApi` ganha `resizeOverlay(kind, size)`, `installUpdate()`,
`dismissUpdate()` e `onUpdateStatus(cb)`. Como em todo canal existente, o main
trata o payload como `unknown` e devolve o estado atual em vez de lançar quando
o argumento é inválido.

### Renderer — overlay de jogada

`src/renderer/src/StrategyOverlayApp.tsx`, consumindo o mesmo
`useCounterState()` das outras janelas.

**Escala do conteúdo.** Hoje `contentScale` lê `OVERLAY_SIZES[size]`, o que
passaria a mentir assim que existisse tamanho livre. Nasce
`src/renderer/src/useWindowSize.ts` (`innerWidth`/`innerHeight` + listener de
`resize`) e a escala passa a ser `min(innerW / DESIGN_WIDTH, innerH /
designHeight)` nas duas janelas de overlay. Ganho colateral: a escala fica certa
durante o gesto de redimensionar, sem latência de IPC, e o renderer para de
precisar consultar a tabela de presets.

**Modo `guide`, Hi-Lo:**

- cabeçalho: `JOGADA` à esquerda, `TC +3` tabular à direita;
- linha de seguro, no tom âmbar que o app já usa para insurance;
- bloco **valendo agora**: desvios ativos ordenados por `sortForCount` (ativos
  primeiro, índice mais alto na frente — o mais caro de esquecer), cada linha
  no formato `16 vs 10 · FICAR · ≥0`;
- bloco **próximo**: o índice mais perto de virar, com a distância
  (`10 vs 10 → DOBRAR em +4, 1 ponto daqui`);
- count neutro ou negativo não deixa a janela vazia: mostra "estratégia básica,
  nada mudou" e os dois índices mais próximos;
- quantas linhas cabem sai sempre da **altura real medida**, nunca do preset —
  uma regra só serve aos três presets e a qualquer tamanho arrastado. Nos
  presets isso dá 4 / 6 / 9 linhas. Sobrando desvio, a última linha vira
  `+N mais`.

**Modo `matrix`:** o chart completo recolorindo com o count, células desviadas
em destaque, sem caixa de detalhe e sem clique.

**KO:** os dois modos caem em `basicAction` puro, sem destaque de desvio, com a
nota de que os índices são de Hi-Lo e o KO tem tabela própria.

**Arrastar e redimensionar:** destravado, a janela ganha `app-drag`, a alcinha
no topo (igual à do overlay de contagem) e a alça de resize no canto inferior
direito. Travado, ambas somem e a janela volta a ser click-through.

### Renderer — alça de redimensionar

`src/renderer/src/components/ResizeGrip.tsx`, usada pelas duas janelas.

- `-webkit-app-region: no-drag` **obrigatório**: sem isso a alça cai dentro da
  região `app-drag` do overlay e o `mousedown` vira arrasto de janela — o
  usuário tenta redimensionar e move.
- O gesto trabalha em coordenadas de tela (`event.screenX/screenY`). Com
  coordenadas de cliente, a janela se redimensiona debaixo do cursor a cada
  frame e o cálculo entra em realimentação; com as de tela, o alvo é
  `screenX - bounds.x`, independente do que a janela já fez.
- `setPointerCapture` na alça mantém os `mousemove` chegando quando o ponteiro
  sai da janela no meio do gesto.
- Cursor `nwse-resize`, glifo de ~12px, mesma opacidade da alcinha de arrasto.

### Renderer — extração de `StrategyGrid`

A grade da matriz sai de `StrategyMatrix.tsx` para
`src/renderer/src/components/StrategyGrid.tsx`, presentacional:

```ts
interface StrategyGridProps {
  decisionCount: number
  surrender: boolean
  /** false no KO: só estratégia básica, sem índices e sem destaque de desvio. */
  countAware: boolean
  compact: boolean
  selected?: { handKey: string; upcard: Upcard } | null
  onSelect?: (cell: { handKey: string; upcard: Upcard } | null) => void
}
```

A aba **Desvios** passa a consumir o mesmo componente, mantendo a caixa de
detalhe e a legenda dela por fora. Sem isso, a grade existiria em duas cópias
que precisariam ser corrigidas em par.

### Atualizador

`src/main/updater/policy.ts` deixa de decidir "quando interromper" e passa a ser
a máquina de estado da pílula, pura e testável:

```ts
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  version: string | null
  /** 0..100, só significativo em 'downloading'. */
  percent: number
  dismissed: boolean
  lastCheckAt: number | null
}

/** O que a pílula mostra. null = pílula escondida. */
export interface UpdateStatus {
  phase: 'downloading' | 'ready'
  version: string | null
  percent: number
}

export function visibleStatus(state: UpdateState): UpdateStatus | null
export function shouldCheck(state: UpdateState, now: number, minGapMs: number): boolean
```

`visibleStatus` devolve `null` em `idle`, `checking` e `error`: checagem em
andamento não é notícia, e falha de atualização nunca vira alerta — o app tem
que abrir e contar cartas com o GitHub fora do ar. `dismissed` também zera a
pílula; só um `update-downloaded` de versão nova o desarma, então dispensar vale
para aquela pendência e não para sempre.

O evento `update:status` vai para todas as janelas pelo mesmo broadcast do
snapshot, mas só a janela principal desenha a pílula — os overlays ignoram o
canal. Notícia de atualização por cima do jogo é exatamente o que esta mudança
existe para eliminar.

`controller.ts`:

- `FIRST_CHECK_DELAY_MS`: 30 s → **10 s**;
- `CHECK_INTERVAL_MS`: 6 h → **30 min**;
- checagem também em `browser-window-focus`, com `MIN_CHECK_GAP_MS` de **5 min**
  via `shouldCheck`;
- `dialog.showMessageBox` sai; entram `download-progress` e o broadcast de
  `update:status`;
- `autoDownload` e `autoInstallOnAppQuit` continuam `true`. Com a janela
  principal fechada e o app na bandeja não há pílula — igual hoje não havia
  diálogo — e `autoInstallOnAppQuit` é a rede de segurança para quem nunca
  clicar;
- a guarda `if (!app.isPackaged) return` continua: em `electron-vite dev` não
  existe `app-update.yml` e checar só produziria erro a cada boot.

### Renderer — pílula

`src/renderer/src/components/UpdateToast.tsx`, ancorada no rodapé da janela
principal, sobreposta ao conteúdo (`absolute`), cantos arredondados, fundo
translúcido com blur.

- **baixando:** `Baixando 0.3.0` + barra de progresso de 2px + `37%` tabular à
  direita;
- **pronta:** `Versão 0.3.0 pronta` + botão `Reiniciar` + `×` de dispensar;
- entrada com fade e slide de 8px; sem animação de saída ao dispensar.

## Hotkey e bandeja

`HotkeyAction` ganha `toggleStrategyOverlay`, listada em `HOTKEY_ACTIONS` e em
`OPTIONAL_HOTKEY_ACTIONS` — nasce **sem tecla**, como as outras três opcionais,
porque cada bind global custa a tecla no sistema inteiro. `sanitizeBindings` e
`sanitizeBindingProfiles` já iteram sobre `HOTKEY_ACTIONS`, então absorvem a
ação nova sem mudança. Entram junto: rótulo em `ACTION_LABELS` (App e
SettingsPanel), item na bandeja e botão na aba Contagem — sem eles, ligar o guia
exigiria alt-tab, que é o que o app existe para evitar.

## Ajustes

Seção **Overlay de jogada**, espelhando a seção Overlay existente: exibir, modo
(guia/matriz), tamanho, opacidade, canto, travar.

Nos **dois** overlays, o seletor de tamanho ganha o hint "Em tamanho ajustado"
quando `customSize !== null`, espelhando o "Em posição arrastada" que o canto já
tem, e clicar num preset limpa `customSize` — pela mesma razão que escolher um
canto limpa `customPosition`: o customizado tem prioridade, e escolher um preset
sem limpá-lo calcularia o tamanho e o ignoraria em seguida.

## Testes

| arquivo | cobre |
| --- | --- |
| `test/overlaySize.test.ts` (novo) | `clampOverlaySize`: piso, teto, workArea menor que o piso, ordem dos clamps; `effectiveOverlaySize` com e sem customizado |
| `test/strategyOverlay.test.tsx` (novo) | guia: desvios ativos no count, ordenação, estado vazio em count negativo, bloco "próximo"; aviso e ausência de destaque no KO |
| `test/updater.test.ts` (reescrito) | `visibleStatus` nos cinco phases e com `dismissed`; `shouldCheck` com e sem janela mínima |
| `test/store.test.ts` | sanitização de `strategyOverlay` (layout inválido, opacidade fora de faixa, `customSize` absurdo) e de settings antiga sem a chave |
| `test/renderer.test.tsx` | pílula nos três estados visíveis e ausente em `idle`/`error` |

`shouldPromptForUpdate` deixa de existir; os testes dele saem junto.

## Release

- `package.json` para **0.3.0**;
- entrada correspondente em `src/shared/changelog.ts` — `test/changelog.test.ts`
  falha sem ela, de propósito;
- README: seção do overlay de jogada, redimensionamento com a alça, ação de
  hotkey nova e o ritmo novo de checagem de atualização.

## Riscos

**A alça em janela transparente com `focusable: false`.** É a parte com menos
precedente no código atual. Se `setPointerCapture` não segurar o gesto ao sair
da janela, o fallback é ouvir `mousemove` no `window` durante o gesto e encerrar
no `mouseup` — mesma lógica, captura diferente. Verificar cedo, com o app
empacotado e não só em dev.

**Um segundo overlay `alwaysOnTop` em nível `screen-saver`.** Duas janelas
disputando o mesmo nível sobre um jogo em borderless podem piscar uma sobre a
outra. O `setAlwaysOnTop` reafirmado a cada `setVisible` já mitiga; se aparecer,
a saída é reafirmar também no `focus` do jogo.
