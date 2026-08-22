# Overlay de jogada, overlays redimensionáveis e atualização discreta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a 0.3.0 do Counter com uma segunda janela de overlay que mostra a jogada correta para cada mão reagindo ao count, redimensionamento livre com o mouse nos dois overlays, e uma pílula discreta de atualização no lugar do diálogo nativo do Windows.

**Architecture:** `createOverlayController` deixa de ter `overlay.html` e `settings.overlay` cravados e vira `createOverlayWindow(spec)`, parametrizado por página, getters de placement/tamanho/limites e callbacks de `moved`/`resized`; duas instâncias passam a existir no main. O tamanho efetivo de cada overlay sai de uma função pura em `shared/` que combina preset, tamanho arrastado e limites. O renderer para de deduzir a escala do preset e passa a medir a própria janela. O updater troca `dialog.showMessageBox` por uma máquina de estado pura e um evento de broadcast que só a janela principal desenha.

**Tech Stack:** Electron 43 + electron-vite 5, React 19, TypeScript 5.9 (strict), Tailwind 4, Vitest 4 (`node` por padrão, `jsdom` por docblock), electron-updater 6.8.

**Spec:** [`docs/superpowers/specs/2026-08-21-overlay-jogada-e-atualizacao-design.md`](../specs/2026-08-21-overlay-jogada-e-atualizacao-design.md)

## Global Constraints

- **`src/shared/` não pode importar `electron`.** Regra escrita no topo de `src/shared/types.ts`. Main executa a lógica; os renderers importam só os tipos.
- **Comentários e strings de UI em português**, seguindo o resto do código. Comentário explica *por quê*, não *o quê* — o repositório inteiro segue esse padrão e o revisor vai cobrar.
- **Nada de `any`.** `tsconfig` em strict; payload vindo do renderer é `unknown` até passar por type guard.
- **Payload IPC inválido devolve o estado atual, nunca lança.** Exceção em `ipcMain.handle` vira rejeição do `invoke` do outro lado e derruba a UI.
- **Sistema KO nunca recebe índices de Hi-Lo.** `deviationsForSystem('ko')` devolve `[]` de propósito; alimentar `cellDecision` com o número de decisão do KO dá conselho errado com cara de certo.
- **Verificação:** `npm test` e `npm run typecheck` precisam passar ao fim de toda task. `npm run typecheck` roda os dois tsconfigs (node e web).
- **Commits frequentes**, um por task, mensagem em português no imperativo.
- Versão alvo no fim do plano: **0.3.0**. `test/changelog.test.ts` falha se `package.json` subir sem entrada correspondente em `src/shared/changelog.ts`.

---

### Task 1: Tamanho efetivo e clamp dos overlays

Função pura que decide o tamanho de uma janela de overlay a partir do preset, do tamanho arrastado e dos limites. Base de tudo que vem depois: main, sanitização e renderer consomem a mesma regra.

**Files:**
- Create: `src/shared/domain/overlaySize.ts`
- Modify: `src/shared/defaults.ts` (acrescentar `STRATEGY_OVERLAY_SIZES` e `OVERLAY_SIZE_LIMITS` no fim, junto de `OVERLAY_SIZES`)
- Test: `test/overlaySize.test.ts`

**Interfaces:**
- Consumes: `OverlaySize` de `@shared/types` (já existe: `'small' | 'medium' | 'large'`).
- Produces:
  - `interface Size { width: number; height: number }`
  - `interface SizeLimits { min: Size; max: Size }`
  - `clampOverlaySize(desired: Size, limits: SizeLimits, area: Size): Size`
  - `effectiveOverlaySize(preset: Size, custom: Size | null, limits: SizeLimits, area: Size): Size`
  - `STRATEGY_OVERLAY_SIZES: Record<StrategyOverlayLayout, Record<OverlaySize, Size>>` — **atenção:** `StrategyOverlayLayout` só nasce na Task 2. Nesta task declare a tabela com a chave literal `Record<'guide' | 'matrix', Record<OverlaySize, Size>>`; a Task 2 troca pelo tipo nomeado.
  - `OVERLAY_SIZE_LIMITS: Record<'count' | 'strategyGuide' | 'strategyMatrix', SizeLimits>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/overlaySize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { clampOverlaySize, effectiveOverlaySize } from '../src/shared/domain/overlaySize'
import { OVERLAY_SIZE_LIMITS, OVERLAY_SIZES, STRATEGY_OVERLAY_SIZES } from '../src/shared/defaults'

const limits = { min: { width: 100, height: 80 }, max: { width: 400, height: 300 } }
const bigArea = { width: 1920, height: 1040 }

describe('clampOverlaySize', () => {
  it('deixa passar o que está dentro dos limites', () => {
    expect(clampOverlaySize({ width: 250, height: 150 }, limits, bigArea)).toEqual({
      width: 250,
      height: 150
    })
  })

  it('sobe até o piso', () => {
    expect(clampOverlaySize({ width: 10, height: 10 }, limits, bigArea)).toEqual({
      width: 100,
      height: 80
    })
  })

  it('desce até o teto', () => {
    expect(clampOverlaySize({ width: 9999, height: 9999 }, limits, bigArea)).toEqual({
      width: 400,
      height: 300
    })
  })

  it('nunca passa da workArea', () => {
    expect(clampOverlaySize({ width: 400, height: 300 }, limits, { width: 320, height: 240 })).toEqual({
      width: 320,
      height: 240
    })
  })

  /**
   * O caso que decide a ordem dos clamps. Num monitor menor que o piso, ganhar
   * o piso produziria uma janela maior que a tela — impossível de arrastar de
   * volta para dentro. A workArea vem por último de propósito.
   */
  it('workArea menor que o piso ganha do piso', () => {
    expect(clampOverlaySize({ width: 100, height: 80 }, limits, { width: 60, height: 50 })).toEqual({
      width: 60,
      height: 50
    })
  })

  it('arredonda para inteiro', () => {
    expect(clampOverlaySize({ width: 200.6, height: 150.2 }, limits, bigArea)).toEqual({
      width: 201,
      height: 150
    })
  })

  it('tamanho não finito cai no piso em vez de virar NaN', () => {
    expect(clampOverlaySize({ width: Number.NaN, height: 150 }, limits, bigArea)).toEqual({
      width: 100,
      height: 150
    })
  })
})

describe('effectiveOverlaySize', () => {
  const preset = { width: 232, height: 150 }

  it('sem tamanho customizado usa o preset', () => {
    expect(effectiveOverlaySize(preset, null, limits, bigArea)).toEqual({ width: 232, height: 150 })
  })

  it('com tamanho customizado o customizado ganha', () => {
    expect(effectiveOverlaySize(preset, { width: 300, height: 200 }, limits, bigArea)).toEqual({
      width: 300,
      height: 200
    })
  })

  it('o customizado também passa pelo clamp', () => {
    expect(effectiveOverlaySize(preset, { width: 9999, height: 9999 }, limits, bigArea)).toEqual({
      width: 400,
      height: 300
    })
  })

  it('o preset também passa pelo clamp, para monitor pequeno', () => {
    expect(effectiveOverlaySize(preset, null, limits, { width: 200, height: 120 })).toEqual({
      width: 200,
      height: 120
    })
  })
})

describe('tabelas de tamanho', () => {
  it('todo preset de contagem cabe nos limites de contagem', () => {
    const { min, max } = OVERLAY_SIZE_LIMITS.count
    for (const size of Object.values(OVERLAY_SIZES)) {
      expect(size.width).toBeGreaterThanOrEqual(min.width)
      expect(size.height).toBeGreaterThanOrEqual(min.height)
      expect(size.width).toBeLessThanOrEqual(max.width)
      expect(size.height).toBeLessThanOrEqual(max.height)
    }
  })

  /**
   * Um preset fora dos limites seria redimensionado no primeiro applyPlacement
   * e o seletor de tamanho passaria a mostrar um valor que a janela não tem.
   */
  it('todo preset de jogada cabe nos limites do layout dele', () => {
    const pairs = [
      [STRATEGY_OVERLAY_SIZES.guide, OVERLAY_SIZE_LIMITS.strategyGuide],
      [STRATEGY_OVERLAY_SIZES.matrix, OVERLAY_SIZE_LIMITS.strategyMatrix]
    ] as const

    for (const [table, { min, max }] of pairs) {
      for (const size of Object.values(table)) {
        expect(size.width).toBeGreaterThanOrEqual(min.width)
        expect(size.height).toBeGreaterThanOrEqual(min.height)
        expect(size.width).toBeLessThanOrEqual(max.width)
        expect(size.height).toBeLessThanOrEqual(max.height)
      }
    }
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

```bash
npx vitest run test/overlaySize.test.ts
```

Esperado: FAIL — `Failed to resolve import "../src/shared/domain/overlaySize"`.

- [ ] **Step 3: Escrever `src/shared/domain/overlaySize.ts`**

```ts
export interface Size {
  width: number
  height: number
}

export interface SizeLimits {
  min: Size
  max: Size
}

function clampAxis(value: number, min: number, max: number, area: number): number {
  // Valor não finito vem de settings.json corrompido ou de um arrasto que
  // perdeu a referência da janela; cair no piso é o único resultado usável.
  const base = Number.isFinite(value) ? value : min
  return Math.round(Math.min(Math.min(Math.max(base, min), max), area))
}

/**
 * Piso -> teto -> workArea, nessa ordem.
 *
 * A workArea vem por último porque num monitor menor que o piso o piso perde:
 * uma janela maior que a tela não tem como ser arrastada de volta para dentro,
 * e overlay inalcançável é pior que overlay apertado.
 */
export function clampOverlaySize(desired: Size, limits: SizeLimits, area: Size): Size {
  return {
    width: clampAxis(desired.width, limits.min.width, limits.max.width, area.width),
    height: clampAxis(desired.height, limits.min.height, limits.max.height, area.height)
  }
}

/** O customizado tem prioridade sobre o preset; os dois passam pelo mesmo clamp. */
export function effectiveOverlaySize(
  preset: Size,
  custom: Size | null,
  limits: SizeLimits,
  area: Size
): Size {
  return clampOverlaySize(custom ?? preset, limits, area)
}
```

- [ ] **Step 4: Acrescentar as tabelas em `src/shared/defaults.ts`**

Logo abaixo do bloco `OVERLAY_SIZES` que já existe. Importe o tipo:

```ts
import type { Size, SizeLimits } from './domain/overlaySize'
```

```ts
/**
 * Tabela própria do overlay de jogada, indexada por layout: guia e matriz têm
 * proporções incomparáveis (uma lista de 6 linhas contra um chart de 27 linhas
 * por 10 colunas), então um único conjunto de presets serviria mal aos dois.
 */
export const STRATEGY_OVERLAY_SIZES: Record<'guide' | 'matrix', Record<OverlaySize, Size>> = {
  guide: {
    small: { width: 200, height: 124 },
    medium: { width: 240, height: 156 },
    large: { width: 290, height: 190 }
  },
  matrix: {
    small: { width: 244, height: 334 },
    medium: { width: 292, height: 400 },
    large: { width: 344, height: 470 }
  }
}

/**
 * Faixa do redimensionamento livre pela alça.
 *
 * O piso não é estético: sem ele dá para encolher a janela até a própria alça
 * sumir, e aí o overlay fica num tamanho do qual não se sai mais pelo mouse.
 */
export const OVERLAY_SIZE_LIMITS: Record<
  'count' | 'strategyGuide' | 'strategyMatrix',
  SizeLimits
> = {
  count: { min: { width: 150, height: 92 }, max: { width: 560, height: 340 } },
  strategyGuide: { min: { width: 170, height: 105 }, max: { width: 520, height: 420 } },
  strategyMatrix: { min: { width: 210, height: 288 }, max: { width: 620, height: 840 } }
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

```bash
npx vitest run test/overlaySize.test.ts
```

Esperado: PASS, 13 testes.

- [ ] **Step 6: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/shared/domain/overlaySize.ts src/shared/defaults.ts test/overlaySize.test.ts
git commit -m "Tamanho efetivo e clamp dos overlays"
```

---

### Task 2: Tipos, defaults e sanitização de `strategyOverlay` e `customSize`

Abre espaço nas settings para a segunda janela e para o tamanho arrastado. Puramente de dados: nada na tela muda ainda.

**Files:**
- Modify: `src/shared/types.ts` (extrair `OverlayPlacement`, acrescentar `customSize`, `StrategyOverlayLayout`, `StrategyOverlaySettings`, campo `strategyOverlay` em `Settings`)
- Modify: `src/shared/defaults.ts` (`DEFAULT_SETTINGS.overlay.customSize`, `DEFAULT_SETTINGS.strategyOverlay`, trocar a chave literal da Task 1 pelo tipo nomeado)
- Modify: `src/main/state/store.ts` (`sanitizeCustomSize`, `sanitizePlacement`, `sanitizeStrategyOverlay`, ligar em `sanitizeSettings`)
- Test: `test/store.test.ts` (acrescentar um `describe`)

**Interfaces:**
- Consumes: `Size`, `SizeLimits`, `clampOverlaySize`, `OVERLAY_SIZE_LIMITS`, `STRATEGY_OVERLAY_SIZES` da Task 1.
- Produces:
  - `interface OverlayPlacement { corner; margin; opacity; locked; visible; customPosition: {x,y} | null; customSize: Size | null }`
  - `interface OverlaySettings extends OverlayPlacement { size: OverlaySize; layout: OverlayLayout; historyLength: number; showCurrency: boolean }`
  - `type StrategyOverlayLayout = 'guide' | 'matrix'`
  - `interface StrategyOverlaySettings extends OverlayPlacement { size: OverlaySize; layout: StrategyOverlayLayout }`
  - `Settings.strategyOverlay: StrategyOverlaySettings`

- [ ] **Step 1: Escrever o teste que falha**

Acrescente no fim de `test/store.test.ts`, e ajuste os imports do topo do arquivo para incluir `STRATEGY_OVERLAY_SIZES` e `OVERLAY_SIZE_LIMITS` de `../src/shared/defaults`:

```ts
describe('sanitização do overlay de jogada', () => {
  it('settings antiga sem a chave ganha os defaults', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ shoe: { deckCount: 8 } }))
    expect(new SettingsStore(p).get().strategyOverlay).toEqual(DEFAULT_SETTINGS.strategyOverlay)
  })

  it('layout inválido cai no default', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { layout: 'holograma' } }))
    expect(new SettingsStore(p).get().strategyOverlay.layout).toBe('guide')
  })

  it('opacidade fora de faixa é clampada', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { opacity: 9 } }))
    expect(new SettingsStore(p).get().strategyOverlay.opacity).toBe(1)
  })

  it('layout válido sobrevive', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ strategyOverlay: { layout: 'matrix', visible: true } }))
    const saved = new SettingsStore(p).get().strategyOverlay
    expect(saved.layout).toBe('matrix')
    expect(saved.visible).toBe(true)
  })
})

describe('sanitização de customSize', () => {
  it('ausente vira null nos dois overlays', () => {
    const s = new SettingsStore(tmpFile()).get()
    expect(s.overlay.customSize).toBeNull()
    expect(s.strategyOverlay.customSize).toBeNull()
  })

  it('tamanho válido sobrevive', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 300, height: 200 } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toEqual({ width: 300, height: 200 })
  })

  /**
   * settings.json editado à mão ou corrompido não pode produzir uma janela de
   * 9999px: ela nasceria maior que a tela e sem como voltar.
   */
  it('tamanho absurdo é clampado para o teto do tipo', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 9999, height: 9999 } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toEqual(OVERLAY_SIZE_LIMITS.count.max)
  })

  it('o clamp do overlay de jogada segue o layout salvo', () => {
    const p = tmpFile()
    writeFileSync(
      p,
      JSON.stringify({ strategyOverlay: { layout: 'matrix', customSize: { width: 1, height: 1 } } })
    )
    expect(new SettingsStore(p).get().strategyOverlay.customSize).toEqual(
      OVERLAY_SIZE_LIMITS.strategyMatrix.min
    )
  })

  it('shape errado vira null em vez de derrubar a leitura', () => {
    const p = tmpFile()
    writeFileSync(p, JSON.stringify({ overlay: { customSize: { width: 'grande' } } }))
    expect(new SettingsStore(p).get().overlay.customSize).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/store.test.ts
```

Esperado: FAIL — `strategyOverlay` é `undefined`.

- [ ] **Step 3: Mexer em `src/shared/types.ts`**

Substitua a interface `OverlaySettings` existente por:

```ts
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
```

Em `interface Settings`, logo depois de `overlay: OverlaySettings`:

```ts
  strategyOverlay: StrategyOverlaySettings
```

- [ ] **Step 4: Mexer em `src/shared/defaults.ts`**

Troque a chave literal da tabela criada na Task 1 pelo tipo nomeado (importe `StrategyOverlayLayout` de `./types`):

```ts
export const STRATEGY_OVERLAY_SIZES: Record<StrategyOverlayLayout, Record<OverlaySize, Size>> = {
```

Em `DEFAULT_SETTINGS.overlay`, acrescente `customSize: null` depois de `customPosition: null`. Depois do bloco `overlay`, acrescente:

```ts
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
```

- [ ] **Step 5: Mexer em `src/main/state/store.ts`**

Nos imports de tipo acrescente `StrategyOverlayLayout`, `StrategyOverlaySettings`, `OverlayPlacement`; nos imports de valor acrescente `OVERLAY_SIZE_LIMITS`, `STRATEGY_OVERLAY_SIZES` de `@shared/defaults` e `clampOverlaySize` de `@shared/domain/overlaySize`, mais o tipo `SizeLimits` do mesmo módulo. Junto das outras listas de enum:

```ts
const STRATEGY_OVERLAY_LAYOUTS: readonly StrategyOverlayLayout[] = ['guide', 'matrix']
```

Acrescente, ao lado de `sanitizeCustomPosition`:

```ts
/**
 * Sem workArea aqui: a sanitização roda no boot, antes de qualquer janela, e
 * `screen` do Electron não pode ser importado em código compartilhado. O teto
 * dos limites já impede o caso patológico; o ajuste fino à tela acontece no
 * applyPlacement, que conhece o monitor.
 */
function sanitizeCustomSize(value: unknown, limits: SizeLimits): { width: number; height: number } | null {
  if (!isPlainObject(value)) return null
  const { width, height } = value
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return clampOverlaySize({ width, height }, limits, limits.max)
}
```

Extraia os campos comuns:

```ts
function sanitizePlacement(
  raw: Record<string, unknown>,
  fallback: OverlayPlacement,
  limits: SizeLimits
): OverlayPlacement {
  return {
    corner: pickEnum(raw.corner, CORNERS, fallback.corner),
    margin: pickInteger(raw.margin, MARGIN_RANGE.min, MARGIN_RANGE.max, fallback.margin),
    opacity: pickNumber(
      raw.opacity,
      OVERLAY_OPACITY_RANGE.min,
      OVERLAY_OPACITY_RANGE.max,
      fallback.opacity
    ),
    locked: pickBoolean(raw.locked, fallback.locked),
    visible: pickBoolean(raw.visible, fallback.visible),
    customPosition: sanitizeCustomPosition(raw.customPosition),
    customSize: sanitizeCustomSize(raw.customSize, limits)
  }
}
```

`sanitizeOverlay` passa a delegar:

```ts
function sanitizeOverlay(value: unknown): OverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.overlay
  return {
    ...sanitizePlacement(raw, fallback, OVERLAY_SIZE_LIMITS.count),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    layout: pickEnum(raw.layout, OVERLAY_LAYOUTS, fallback.layout),
    historyLength: pickInteger(
      raw.historyLength,
      HISTORY_LENGTH_RANGE.min,
      HISTORY_LENGTH_RANGE.max,
      fallback.historyLength
    ),
    showCurrency: pickBoolean(raw.showCurrency, fallback.showCurrency)
  }
}

function sanitizeStrategyOverlay(value: unknown): StrategyOverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.strategyOverlay
  // O limite depende do layout: a matriz tem piso muito maior que o guia, e
  // usar o limite errado gravaria um tamanho que o outro modo não aceita.
  const layout = pickEnum(raw.layout, STRATEGY_OVERLAY_LAYOUTS, fallback.layout)
  const limits =
    layout === 'matrix' ? OVERLAY_SIZE_LIMITS.strategyMatrix : OVERLAY_SIZE_LIMITS.strategyGuide
  return {
    ...sanitizePlacement(raw, fallback, limits),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    layout
  }
}
```

E em `sanitizeSettings`, depois de `overlay: sanitizeOverlay(merged.overlay)`:

```ts
    strategyOverlay: sanitizeStrategyOverlay(merged.strategyOverlay)
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run test/store.test.ts
```

Esperado: PASS. Se `renderer.test.tsx` quebrar por snapshot incompleto, ele monta `Settings` a partir de `DEFAULT_SETTINGS` com spread, então não deve — confirme com a suíte inteira:

```bash
npm test
```

- [ ] **Step 7: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/state/store.ts test/store.test.ts
git commit -m "Settings do overlay de jogada e do tamanho arrastado"
```

---

### Task 3: Generalizar o controlador de janela de overlay

`createOverlayController` vira `createOverlayWindow(spec)`. Ainda existe uma instância só (a de contagem) — a segunda janela entra na Task 10. Aqui também nascem `writeBounds`, a guarda de eco de tamanho e `resizeTo`.

**Files:**
- Modify: `src/main/windows/overlayWindow.ts` (reescrita da assinatura; `clampToArea` e `cornerPosition` ficam como estão)
- Modify: `src/main/index.ts:105-115` (a chamada de criação)
- Modify: `src/main/ipc/handlers.ts` (`placementChanged` e `syncOverlay`)
- Test: `test/overlayWindow.test.ts`

**Interfaces:**
- Consumes: `effectiveOverlaySize`, `Size`, `SizeLimits` (Task 1); `OverlayPlacement` (Task 2).
- Produces:
  - `interface OverlayWindowSpec { page: string; getPlacement: () => OverlayPlacement; getPresetSize: () => Size; getLimits: () => SizeLimits; onMoved: (pos: { x: number; y: number }) => void; onResized: (size: Size) => void }`
  - `interface OverlayController { ensure(): BrowserWindow; setVisible(v: boolean): void; setLocked(v: boolean): void; applyPlacement(): void; resizeTo(size: Size): void; get(): BrowserWindow | null; destroy(): void }`
  - `createOverlayWindow(spec: OverlayWindowSpec): OverlayController`

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/overlayWindow.test.ts`. O mock de `electron` segue o padrão de `test/ipc.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

const listeners = new Map<string, (() => void)[]>()
let bounds: Bounds = { x: 0, y: 0, width: 232, height: 150 }
let resizable = false
let loaded = ''

class FakeWindow {
  destroyed = false
  on(event: string, cb: () => void): void {
    const list = listeners.get(event) ?? []
    list.push(cb)
    listeners.set(event, list)
  }
  removeAllListeners(): void {}
  isDestroyed(): boolean {
    return this.destroyed
  }
  isResizable(): boolean {
    return resizable
  }
  setResizable(next: boolean): void {
    resizable = next
  }
  getBounds(): Bounds {
    return { ...bounds }
  }
  getPosition(): [number, number] {
    return [bounds.x, bounds.y]
  }
  getSize(): [number, number] {
    return [bounds.width, bounds.height]
  }
  setBounds(next: Bounds): void {
    // O Windows ignora setBounds com resizable false; o fake reproduz isso para
    // que a ausência do destrave apareça como teste vermelho e não em produção.
    if (!resizable) return
    bounds = { ...next }
  }
  setAlwaysOnTop(): void {}
  setVisibleOnAllWorkspaces(): void {}
  setIgnoreMouseEvents(): void {}
  showInactive(): void {}
  hide(): void {}
  destroy(): void {
    this.destroyed = true
  }
  loadFile(file: string): Promise<void> {
    loaded = file
    return Promise.resolve()
  }
  loadURL(url: string): Promise<void> {
    loaded = url
    return Promise.resolve()
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
  }
}))

const { createOverlayWindow } = await import('../src/main/windows/overlayWindow')
const { DEFAULT_SETTINGS, OVERLAY_SIZE_LIMITS, OVERLAY_SIZES } = await import(
  '../src/shared/defaults'
)
import type { OverlayPlacement } from '../src/shared/types'

function fire(event: string): void {
  for (const cb of listeners.get(event) ?? []) cb()
}

function setup(placement: Partial<OverlayPlacement> = {}) {
  const moves: { x: number; y: number }[] = []
  const resizes: { width: number; height: number }[] = []
  const current: OverlayPlacement = { ...DEFAULT_SETTINGS.overlay, ...placement }

  const controller = createOverlayWindow({
    page: 'overlay.html',
    getPlacement: () => current,
    getPresetSize: () => OVERLAY_SIZES.medium,
    getLimits: () => OVERLAY_SIZE_LIMITS.count,
    onMoved: (pos) => moves.push(pos),
    onResized: (size) => resizes.push(size)
  })

  return { controller, moves, resizes, current }
}

beforeEach(() => {
  listeners.clear()
  bounds = { x: 0, y: 0, width: 232, height: 150 }
  resizable = false
  loaded = ''
})

describe('createOverlayWindow', () => {
  it('aplica o preset quando não há tamanho customizado', () => {
    const { controller } = setup()
    controller.ensure()
    expect(bounds.width).toBe(OVERLAY_SIZES.medium.width)
    expect(bounds.height).toBe(OVERLAY_SIZES.medium.height)
  })

  it('o tamanho customizado ganha do preset', () => {
    const { controller } = setup({ customSize: { width: 320, height: 210 } })
    controller.ensure()
    expect(bounds.width).toBe(320)
    expect(bounds.height).toBe(210)
  })

  it('resizeTo clampa para o teto do tipo', () => {
    const { controller } = setup()
    controller.ensure()
    controller.resizeTo({ width: 9999, height: 9999 })
    expect(bounds.width).toBe(OVERLAY_SIZE_LIMITS.count.max.width)
    expect(bounds.height).toBe(OVERLAY_SIZE_LIMITS.count.max.height)
  })

  it('deixa a janela travada de novo depois de escrever bounds', () => {
    const { controller } = setup()
    controller.ensure()
    controller.resizeTo({ width: 300, height: 200 })
    expect(resizable).toBe(false)
  })

  /**
   * setBounds emite 'moved' e 'resize' também quando fomos nós que escrevemos.
   * Persistir esse eco converteria o modo de canto em posição customizada e o
   * preset em tamanho customizado sozinhos, no primeiro reposicionamento.
   */
  it('ignora o eco de moved e de resized do próprio applyPlacement', () => {
    const { controller, moves, resizes } = setup()
    controller.ensure()
    fire('moved')
    fire('resized')
    expect(moves).toEqual([])
    expect(resizes).toEqual([])
  })

  it('um arrasto de verdade é persistido', () => {
    const { controller, moves } = setup()
    controller.ensure()
    bounds = { ...bounds, x: 500, y: 400 }
    fire('moved')
    expect(moves).toEqual([{ x: 500, y: 400 }])
  })

  it('um resize de verdade é persistido', () => {
    const { controller, resizes } = setup()
    controller.ensure()
    bounds = { ...bounds, width: 300, height: 210 }
    fire('resized')
    expect(resizes).toEqual([{ width: 300, height: 210 }])
  })

  it('carrega a página indicada no spec', () => {
    const { controller } = setup()
    controller.ensure()
    expect(loaded).toContain('overlay.html')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/overlayWindow.test.ts
```

Esperado: FAIL — `createOverlayWindow is not a function`.

- [ ] **Step 3: Reescrever `src/main/windows/overlayWindow.ts`**

Mantenha `clampToArea`, `cornerPosition` e `loadOverlay` (renomeando este para receber a página). Troque o restante:

```ts
import { BrowserWindow, screen } from 'electron'
import type { Rectangle } from 'electron'
import { join } from 'node:path'
import { effectiveOverlaySize } from '@shared/domain/overlaySize'
import type { Size, SizeLimits } from '@shared/domain/overlaySize'
import type { Corner, OverlayPlacement } from '@shared/types'

export interface OverlayWindowSpec {
  /** Nome do arquivo em src/renderer, ex: 'overlay.html'. */
  page: string
  getPlacement: () => OverlayPlacement
  /** Tamanho do preset em vigor, já resolvido por layout pelo chamador. */
  getPresetSize: () => Size
  getLimits: () => SizeLimits
  onMoved: (pos: { x: number; y: number }) => void
  onResized: (size: Size) => void
}

export interface OverlayController {
  ensure(): BrowserWindow
  setVisible(visible: boolean): void
  setLocked(locked: boolean): void
  /** Sem argumento: lê placement, preset e limites pelos getters do spec. */
  applyPlacement(): void
  /** Arrasto da alça. Clampa e escreve; a persistência vem do evento 'resized'. */
  resizeTo(size: Size): void
  get(): BrowserWindow | null
  destroy(): void
}
```

`loadPage`:

```ts
function loadPage(win: BrowserWindow, page: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined && devUrl !== '') {
    void win.loadURL(`${devUrl.replace(/\/$/, '')}/${page}`)
    return
  }
  void win.loadFile(join(__dirname, `../renderer/${page}`))
}
```

O corpo da fábrica:

```ts
export function createOverlayWindow(spec: OverlayWindowSpec): OverlayController {
  let win: BrowserWindow | null = null
  /** Últimos bounds escritos por nós, para distinguir eco de gesto do usuário. */
  let placedAt: { x: number; y: number } | null = null
  let placedSize: Size | null = null

  function alive(): BrowserWindow | null {
    if (win === null || win.isDestroyed()) return null
    return win
  }

  /**
   * O Windows ignora setBounds enquanto a janela está com resizable false.
   * Destravar só durante a escrita mantém a janela sem borda de arrasto nativa
   * e ainda assim reposicionável e redimensionável por código.
   */
  function writeBounds(target: BrowserWindow, next: Rectangle): void {
    const wasResizable = target.isResizable()
    if (!wasResizable) target.setResizable(true)
    target.setBounds(next)
    if (!wasResizable) target.setResizable(false)
  }

  function resolveSize(area: Rectangle): Size {
    return effectiveOverlaySize(
      spec.getPresetSize(),
      spec.getPlacement().customSize,
      spec.getLimits(),
      { width: area.width, height: area.height }
    )
  }

  function applyPlacement(): void {
    const target = alive()
    if (target === null) return

    const placement = spec.getPlacement()
    const custom = placement.customPosition
    const bounds = target.getBounds()
    const reference = custom ?? {
      x: Math.round(bounds.x + bounds.width / 2),
      y: Math.round(bounds.y + bounds.height / 2)
    }
    const area = screen.getDisplayNearestPoint(reference).workArea
    const size = resolveSize(area)
    const desired =
      custom ?? cornerPosition(placement.corner, size.width, size.height, placement.margin, area)
    const pos = clampToArea(desired, size.width, size.height, area)

    placedAt = pos
    placedSize = size
    writeBounds(target, { x: pos.x, y: pos.y, width: size.width, height: size.height })
  }

  function resizeTo(size: Size): void {
    const target = alive()
    if (target === null) return

    const bounds = target.getBounds()
    const area = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea
    const next = clampOverlaySize(size, spec.getLimits(), {
      width: area.width,
      height: area.height
    })

    // Só o tamanho muda: a alça cresce a janela para a direita e para baixo, com
    // o canto superior esquerdo parado, que é o que o gesto promete visualmente.
    placedSize = next
    writeBounds(target, { x: bounds.x, y: bounds.y, width: next.width, height: next.height })
  }
```

Importe `clampOverlaySize` junto de `effectiveOverlaySize`. `setLocked` fica idêntico ao atual. Em `ensure`, o tamanho inicial vem de `resolveSize` da workArea do display primário — mas como `applyPlacement()` roda logo em seguida e corrige, basta criar com o preset:

```ts
    const size = spec.getPresetSize()
```

Os dois listeners:

```ts
    created.on('moved', () => {
      const current = alive()
      if (current === null) return
      const [x, y] = current.getPosition()
      if (placedAt !== null && placedAt.x === x && placedAt.y === y) return
      onMovedSafely({ x, y })
    })

    // 'resized' e não 'resize': o segundo dispara a cada frame do gesto nativo.
    // Aqui o gesto é nosso (vem de resizeTo), mas o evento final é o único que
    // vale persistir, e o eco de setBounds precisa da mesma guarda de 'moved'.
    created.on('resized', () => {
      const current = alive()
      if (current === null) return
      const [width, height] = current.getSize()
      if (placedSize !== null && placedSize.width === width && placedSize.height === height) return
      spec.onResized({ width, height })
    })
```

Onde `onMovedSafely` é só `spec.onMoved`. Em `closed`, zere `placedAt` e `placedSize`. `applyPlacement(settings.overlay)` dentro de `ensure` vira `applyPlacement()`, e `setLocked(settings.overlay.locked)` vira `setLocked(spec.getPlacement().locked)`. `loadOverlay(created)` vira `loadPage(created, spec.page)`. `setVisible` chama `applyPlacement()` sem argumento. `destroy` remove também o listener de `resized`:

```ts
    target.removeAllListeners('moved')
    target.removeAllListeners('resized')
```

E o retorno ganha `resizeTo`.

- [ ] **Step 4: Atualizar os dois chamadores**

Em `src/main/index.ts`, troque o bloco `createOverlayController(...)`:

```ts
  const overlayController = createOverlayWindow({
    page: 'overlay.html',
    getPlacement: () => controller.getSnapshot().settings.overlay,
    getPresetSize: () => OVERLAY_SIZES[controller.getSnapshot().settings.overlay.size],
    getLimits: () => OVERLAY_SIZE_LIMITS.count,
    onMoved: (customPosition) => {
      controller.updateSettings({ overlay: { customPosition } })
    },
    onResized: (customSize) => {
      controller.updateSettings({ overlay: { customSize } })
    }
  })
```

Importe `OVERLAY_SIZES` e `OVERLAY_SIZE_LIMITS` de `@shared/defaults` e troque o import de `createOverlayController` por `createOverlayWindow`.

Em `src/main/ipc/handlers.ts`, `placementChanged` passa a operar sobre o que é comum:

```ts
function placementChanged(before: OverlayPlacement, after: OverlayPlacement): boolean {
  return (
    before.corner !== after.corner ||
    before.margin !== after.margin ||
    before.customPosition?.x !== after.customPosition?.x ||
    before.customPosition?.y !== after.customPosition?.y ||
    before.customSize?.width !== after.customSize?.width ||
    before.customSize?.height !== after.customSize?.height
  )
}
```

`syncOverlay` recebe o controlador e um sinal extra de mudança de preset, já que `size`/`layout` moram nos tipos concretos e não em `OverlayPlacement`:

```ts
  /**
   * `presetChanged` entra por fora porque `size` e `layout` moram nos tipos
   * concretos de cada overlay, não em OverlayPlacement — e nos dois casos eles
   * mudam o tamanho da janela.
   */
  const syncOverlay = (
    before: OverlayPlacement,
    after: OverlayPlacement,
    presetChanged: boolean,
    target: OverlayController
  ): void => {
    if (!after.visible) {
      if (before.visible) target.setVisible(false)
      return
    }

    const appearing = !before.visible
    target.ensure()
    if (appearing || presetChanged || placementChanged(before, after)) target.applyPlacement()
    if (appearing || before.locked !== after.locked) target.setLocked(after.locked)
    if (appearing) target.setVisible(true)
  }
```

E em `applyPatch`:

```ts
    syncOverlay(
      before.overlay,
      after.overlay,
      before.overlay.size !== after.overlay.size || before.overlay.layout !== after.overlay.layout,
      overlay
    )
```

Ajuste os imports de tipo: `OverlayPlacement` entra, `OverlaySettings` sai se não for mais usado. `IPC.overlaySetCorner` monta `DeepPartial<OverlaySettings>`, então ele continua.

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run test/overlayWindow.test.ts
```

Esperado: PASS, 8 testes.

```bash
npm test
```

Esperado: toda a suíte verde.

- [ ] **Step 6: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/main/windows/overlayWindow.ts src/main/index.ts src/main/ipc/handlers.ts test/overlayWindow.test.ts
git commit -m "Controlador de overlay parametrizado, com resizeTo e guarda de eco"
```

---

### Task 4: Escala do conteúdo medida da janela

O `zoom` do overlay hoje sai do preset. Com tamanho livre isso passaria a mentir. Passa a medir a janela real.

**Files:**
- Create: `src/renderer/src/useWindowSize.ts`
- Modify: `src/renderer/src/OverlayApp.tsx` (remover `contentScale`, usar o hook)
- Test: `test/overlayScale.test.tsx`

**Interfaces:**
- Produces: `useWindowSize(): { width: number; height: number }` — mede `window.innerWidth/innerHeight` e reassina em `resize`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/overlayScale.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useWindowSize } from '../src/renderer/src/useWindowSize'

function Probe() {
  const { width, height } = useWindowSize()
  return <span data-testid="size">{`${width}x${height}`}</span>
}

function resizeTo(width: number, height: number): void {
  window.innerWidth = width
  window.innerHeight = height
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

afterEach(cleanup)

describe('useWindowSize', () => {
  it('mede a janela no primeiro render', () => {
    resizeTo(232, 150)
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('size').textContent).toBe('232x150')
  })

  /**
   * É o que faz a escala do conteúdo acompanhar o arrasto da alça em tempo
   * real, sem passar por IPC.
   */
  it('acompanha o resize da janela', () => {
    resizeTo(232, 150)
    const { getByTestId } = render(<Probe />)
    resizeTo(400, 260)
    expect(getByTestId('size').textContent).toBe('400x260')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/overlayScale.test.tsx
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/renderer/src/useWindowSize.ts`**

```ts
import { useEffect, useState } from 'react'

/**
 * Tamanho real da janela do renderer.
 *
 * Os overlays escalam o conteúdo por `zoom` a partir daqui, e não da tabela de
 * presets: com tamanho arrastável o preset deixa de descrever a janela, e a
 * medição própria ainda tem a vantagem de acompanhar o gesto sem latência de
 * IPC.
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))

  useEffect(() => {
    const measure = (): void => {
      setSize({ width: window.innerWidth, height: window.innerHeight })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return size
}
```

- [ ] **Step 4: Trocar em `OverlayApp.tsx`**

Remova a função `contentScale` e o import de `OVERLAY_SIZES`. No componente:

```tsx
  const windowSize = useWindowSize()
```

E a `div` de conteúdo:

```tsx
      <div
        className="flex flex-col gap-1 p-2"
        style={{
          width: DESIGN_WIDTH,
          zoom: Math.min(windowSize.width / DESIGN_WIDTH, windowSize.height / designHeight)
        }}
      >
```

O tipo `OverlaySize` deixa de ser usado no arquivo; remova do import se ficar órfão.

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run test/overlayScale.test.tsx && npm test
```

Esperado: PASS em ambos.

- [ ] **Step 6: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/useWindowSize.ts src/renderer/src/OverlayApp.tsx test/overlayScale.test.tsx
git commit -m "Escala do overlay medida da janela em vez do preset"
```

---

### Task 5: Alça de redimensionar

Componente compartilhado pelas duas janelas, mais o canal IPC que escreve os bounds.

**Files:**
- Create: `src/renderer/src/components/ResizeGrip.tsx`
- Modify: `src/shared/ipc.ts` (canal `overlayResizeTo`, método `resizeOverlay` em `CounterApi`, tipo `OverlayKind`)
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/handlers.ts` (handler do canal)
- Modify: `src/renderer/src/OverlayApp.tsx` (montar a alça quando destravado)
- Test: `test/resizeGrip.test.tsx`

**Interfaces:**
- Consumes: `Size` (Task 1); `OverlayController.resizeTo` (Task 3).
- Produces:
  - `type OverlayKind = 'count' | 'strategy'` em `@shared/ipc`
  - `CounterApi.resizeOverlay(kind: OverlayKind, size: Size): Promise<void>`
  - `<ResizeGrip kind={OverlayKind} />`

**Desvio deliberado do spec:** o spec cita `setPointerCapture` com listeners no
`window` como fallback. O plano vai direto no fallback. Motivo: o efeito é o
mesmo (receber `mousemove` com o ponteiro fora da janela), o jsdom não
implementa `setPointerCapture` de forma útil — o que deixaria o gesto sem teste
— e uma implementação a menos é uma a menos para manter. Se na verificação
empacotada da Task 10 o gesto engasgar, `setPointerCapture` volta como reforço.

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/resizeGrip.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResizeGrip } from '../src/renderer/src/components/ResizeGrip'

const calls: { kind: string; width: number; height: number }[] = []

function mountApi(): void {
  Object.defineProperty(window, 'counter', {
    configurable: true,
    value: {
      resizeOverlay: (kind: string, size: { width: number; height: number }) => {
        calls.push({ kind, ...size })
        return Promise.resolve()
      }
    }
  })
}

afterEach(() => {
  cleanup()
  calls.length = 0
})

describe('ResizeGrip', () => {
  it('envia o tamanho alvo a partir das coordenadas de tela', () => {
    mountApi()
    // A janela ocupa a tela de (100, 50) até (332, 200) no screen space.
    window.screenX = 100
    window.screenY = 50
    render(<ResizeGrip kind="count" />)

    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    fireEvent.mouseDown(grip, { screenX: 332, screenY: 200 })
    fireEvent.mouseMove(window, { screenX: 432, screenY: 260 })

    expect(calls).toEqual([{ kind: 'count', width: 332, height: 210 }])
  })

  it('para de enviar depois do mouseup', () => {
    mountApi()
    window.screenX = 0
    window.screenY = 0
    render(<ResizeGrip kind="strategy" />)

    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    fireEvent.mouseDown(grip, { screenX: 200, screenY: 150 })
    fireEvent.mouseUp(window, { screenX: 200, screenY: 150 })
    fireEvent.mouseMove(window, { screenX: 400, screenY: 300 })

    expect(calls).toEqual([])
  })

  /**
   * Sem no-drag a alça cai dentro da região app-drag do overlay e o mousedown
   * vira arrasto de janela: o usuário tenta redimensionar e move.
   */
  it('está fora da região de arrasto da janela', () => {
    mountApi()
    render(<ResizeGrip kind="count" />)
    const grip = screen.getByRole('slider', { name: /redimensionar/i })
    expect(grip.className).toContain('app-no-drag')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/resizeGrip.test.tsx
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `src/renderer/src/components/ResizeGrip.tsx`**

```tsx
import { useCallback, useEffect, useRef } from 'react'

import type { OverlayKind } from '@shared/ipc'

/**
 * Alça de redimensionar, canto inferior direito.
 *
 * O gesto trabalha em coordenadas de TELA, não do cliente: a janela é
 * redimensionada debaixo do cursor a cada movimento, e coordenadas relativas
 * entrariam em realimentação com o próprio efeito. Com as de tela, o alvo é
 * sempre `screenX - origem da janela`, independente do que a janela já fez.
 *
 * Só aparece com o overlay destravado — travado ele é click-through e não deve
 * ter nenhuma área que capture o mouse.
 */
export function ResizeGrip({ kind }: { kind: OverlayKind }) {
  const dragging = useRef(false)

  const onMove = useCallback(
    (event: MouseEvent) => {
      if (!dragging.current) return
      void window.counter.resizeOverlay(kind, {
        width: event.screenX - window.screenX,
        height: event.screenY - window.screenY
      })
    },
    [kind]
  )

  const stop = useCallback(() => {
    dragging.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
    }
  }, [onMove, stop])

  return (
    <span
      role="slider"
      aria-label="Redimensionar overlay"
      aria-valuetext="arraste para redimensionar"
      tabIndex={-1}
      onMouseDown={(event) => {
        event.preventDefault()
        dragging.current = true
      }}
      className="app-no-drag absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize"
    >
      <span
        aria-hidden="true"
        className="absolute bottom-[3px] right-[3px] h-2 w-2 rounded-[1px] border-b-2 border-r-2 border-fg/40"
      />
    </span>
  )
}
```

Acrescente em `src/renderer/src/styles.css`, junto da regra `.app-drag` que já existe:

```css
.app-no-drag {
  -webkit-app-region: no-drag;
}
```

Se `.app-drag` ainda não existir como classe utilitária no CSS (procure por `app-region`), crie as duas juntas.

- [ ] **Step 4: Ligar o IPC**

Em `src/shared/ipc.ts`:

```ts
/** Qual das duas janelas de overlay um canal endereça. */
export type OverlayKind = 'count' | 'strategy'
```

No objeto `IPC`, junto dos outros de overlay:

```ts
  overlayResizeTo: 'overlay:resizeTo',
```

Em `CounterApi`, depois de `setOverlaySize`:

```ts
  /** Arrasto da alça. Não devolve snapshot: a persistência vem do evento 'resized' do main. */
  resizeOverlay(kind: OverlayKind, size: { width: number; height: number }): Promise<void>
```

Em `src/preload/index.ts`:

```ts
  resizeOverlay: (kind, size) => ipcRenderer.invoke(IPC.overlayResizeTo, kind, size),
```

Em `src/main/ipc/handlers.ts`, junto dos outros type guards:

```ts
const OVERLAY_KINDS: readonly OverlayKind[] = ['count', 'strategy']

function isOverlayKind(value: unknown): value is OverlayKind {
  return typeof value === 'string' && (OVERLAY_KINDS as readonly string[]).includes(value)
}

function asSize(value: unknown): { width: number; height: number } | null {
  if (!isPlainObject(value)) return null
  const { width, height } = value
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  return { width, height }
}
```

E o handler. Nesta task só existe o overlay de contagem; a Task 10 acrescenta o outro braço:

```ts
  handle(IPC.overlayResizeTo, (kind, size) => {
    const target = asSize(size)
    if (!isOverlayKind(kind) || target === null) return
    if (kind === 'count') overlay.resizeTo(target)
  })
```

- [ ] **Step 5: Montar a alça no overlay de contagem**

Em `OverlayApp.tsx`, ao lado do bloco `{!locked && (<span ... alcinha />)}`, acrescente:

```tsx
      {!locked && <ResizeGrip kind="count" />}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run test/resizeGrip.test.tsx && npm test
```

- [ ] **Step 7: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/components/ResizeGrip.tsx src/renderer/src/OverlayApp.tsx src/renderer/src/styles.css src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts test/resizeGrip.test.tsx
git commit -m "Alça de redimensionar nos overlays"
```

---

### Task 6: Ajustes reconhecem o tamanho arrastado

O seletor de tamanho precisa dizer que está sendo ignorado, e voltar a mandar quando clicado.

**Files:**
- Modify: `src/renderer/src/components/SettingsPanel.tsx` (seção Overlay)
- Test: `test/renderer.test.tsx` (acrescentar casos)

**Interfaces:**
- Consumes: `Settings['overlay'].customSize` (Task 2).

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `test/renderer.test.tsx`. O `stubApi(state)` que já existe no arquivo instala o duplo em `window.counter` e devolve a referência, com todos os métodos em `vi.fn()` — use-o como está, sem inventar wrapper novo:

```tsx
describe('tamanho arrastado nos ajustes', () => {
  it('avisa quando o overlay está em tamanho ajustado', async () => {
    stubApi(
      snapshot({
        overlay: { ...DEFAULT_SETTINGS.overlay, customSize: { width: 300, height: 200 } }
      })
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustes' }))
    expect(await screen.findByText('Em tamanho ajustado')).toBeDefined()
  })

  /**
   * O customizado tem prioridade sobre o preset. Escolher um preset sem limpar
   * customSize calcularia o tamanho e o ignoraria em seguida — o botão pareceria
   * quebrado.
   */
  it('escolher um preset limpa o tamanho arrastado', async () => {
    const api = stubApi(
      snapshot({
        overlay: { ...DEFAULT_SETTINGS.overlay, customSize: { width: 300, height: 200 } }
      })
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'G' }))

    expect(api.updateSettings).toHaveBeenCalledWith({
      overlay: { size: 'large', customSize: null }
    })
  })
})
```

O nome do botão da aba vem do `TabBar`; se `Ajustes` não bater, confira o rótulo lá antes de mudar o teste.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/renderer.test.tsx
```

Esperado: FAIL — o texto `Em tamanho ajustado` não existe.

- [ ] **Step 3: Implementar**

Na seção Overlay de `SettingsPanel.tsx`, o campo de tamanho:

```tsx
        <Field
          label="Tamanho"
          hint={overlay.customSize !== null ? 'Em tamanho ajustado' : undefined}
        >
          <Segmented
            value={overlay.size}
            options={SIZE_OPTIONS}
            // Limpar customSize junto: o tamanho arrastado tem prioridade, e o
            // preset seria calculado e ignorado em seguida.
            onSelect={(size) => patchOverlay({ size, customSize: null })}
          />
        </Field>
```

E no hint do toggle de travar, troque o texto para refletir a alça:

```tsx
        <Field label="Travar (click-through)" hint="Destravado permite arrastar e redimensionar">
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run test/renderer.test.tsx && npm test
```

- [ ] **Step 5: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/components/SettingsPanel.tsx test/renderer.test.tsx
git commit -m "Ajustes avisam e limpam o tamanho arrastado do overlay"
```

---

### Task 7: Extrair `StrategyGrid` de `StrategyMatrix`

A grade vai servir a duas telas. Extrair antes de duplicar.

**Files:**
- Create: `src/renderer/src/components/StrategyGrid.tsx`
- Modify: `src/renderer/src/components/StrategyMatrix.tsx` (passa a consumir a grade; mantém cabeçalho, caixa de detalhe, legenda e rodapé)
- Test: `test/strategyGrid.test.tsx`

**Interfaces:**
- Consumes: `cellDecision`, `basicAction`, `HAND_ROWS`, `KIND_LABELS`, `UPCARDS`, `PLAY_CODES`, `PLAY_LABELS`, `deviationsForCell` — todos já existentes.
- Produces:
  ```ts
  interface StrategyGridProps {
    decisionCount: number
    surrender: boolean
    /** false no KO: só básica, sem índices e sem destaque. */
    countAware: boolean
    compact?: boolean
    selected?: { handKey: string; upcard: Upcard } | null
    onSelect?: (cell: { handKey: string; upcard: Upcard } | null) => void
  }
  ```

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/strategyGrid.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyGrid } from '../src/renderer/src/components/StrategyGrid'

afterEach(cleanup)

describe('StrategyGrid', () => {
  it('em TC 0 manda ficar em 16 vs 10, que é o desvio mais famoso', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware />)
    const cell = screen.getByRole('button', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('parar')
  })

  it('em TC -1 volta a pedir em 16 vs 10', () => {
    render(<StrategyGrid decisionCount={-1} surrender countAware />)
    const cell = screen.getByRole('button', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('pedir')
  })

  /**
   * O ponto do countAware=false. Os índices publicados são de Hi-Lo; aplicá-los
   * ao running count do KO daria conselho errado com cara de certo.
   */
  it('sem countAware ignora a contagem e mostra só a básica', () => {
    render(<StrategyGrid decisionCount={8} surrender={false} countAware={false} />)
    const cell = screen.getByRole('button', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('pedir')
  })

  it('sem rendição na mesa, 16 vs A vira pedir e não render', () => {
    render(<StrategyGrid decisionCount={0} surrender={false} countAware />)
    const cell = screen.getByRole('button', { name: /^16 contra A:/ })
    expect(cell.getAttribute('aria-label')).toContain('pedir')
  })

  it('sem onSelect as células não são clicáveis', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware />)
    const cell = screen.getByRole('button', { name: /^16 contra 10:/ })
    expect(cell.hasAttribute('disabled')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/strategyGrid.test.tsx
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Criar `StrategyGrid.tsx`**

Mova para lá, sem alterar a aparência: `KIND_ORDER`, `ACTION_TONE`, a construção de `grid` via `useMemo` e a `<table>` inteira (do `<thead>` ao último `</tbody>`). Duas mudanças de comportamento:

```tsx
/**
 * `countAware` false = KO. Os índices publicados são de Hi-Lo e a escala do KO é
 * outra; a grade cai em `basicAction` puro, sem destaque de desvio e sem o
 * pontinho de "a contagem mexe aqui".
 */
const decisionFor = (handKey: string, upcard: Upcard) =>
  countAware
    ? cellDecision(handKey, upcard, decisionCount, rules)
    : { action: basicAction(handKey, upcard, rules) ?? 'hit', deviated: false, index: null, distance: null }
```

E a célula, que sem `onSelect` vira estática:

```tsx
                          <button
                            type="button"
                            disabled={onSelect === undefined}
                            onClick={() =>
                              onSelect?.(isSelected ? null : { handKey: line.row.id, upcard: cell.upcard })
                            }
                            aria-label={`${line.row.label} contra ${cell.upcard}: ${PLAY_LABELS[action]}`}
                            ...
```

O pontinho de célula com desvio disponível fica condicionado a `countAware`:

```tsx
                            {countAware && cell.hasDeviation && !deviated && (
```

`compact` (default `false`) reduz a altura da célula de `h-5` para `h-4` e o espaçamento de `border-spacing-[2px]` para `border-spacing-[1px]` — é o que faz a matriz caber num overlay.

- [ ] **Step 4: `StrategyMatrix` consome a grade**

`StrategyMatrix` mantém o contador de jogadas mudadas, a faixa de seguro, a caixa de detalhe, a legenda e o parágrafo de rodapé, e troca a `<table>` por:

```tsx
      <div className="overflow-x-auto">
        <StrategyGrid
          decisionCount={decisionCount}
          surrender={surrender}
          countAware
          selected={selected}
          onSelect={setSelected}
        />
      </div>
```

`Selection` passa a ser `{ handKey: string; upcard: Upcard }`; `buildDetail` já recebe `row.id`, então ajuste-o para receber `handKey` direto e buscar o rótulo em `HAND_ROWS`:

```tsx
const rowLabel = (handKey: string): string =>
  HAND_ROWS.find((row) => row.id === handKey)?.label ?? handKey
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run test/strategyGrid.test.tsx && npm test
```

Esperado: PASS. `test/renderer.test.tsx` e qualquer teste que já cubra a aba Desvios precisam continuar verdes — a aparência não mudou.

- [ ] **Step 6: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/components/StrategyGrid.tsx src/renderer/src/components/StrategyMatrix.tsx test/strategyGrid.test.tsx
git commit -m "Extrai StrategyGrid, com modo sem contagem para o KO"
```

---

### Task 8: Guia de jogada

O conteúdo do modo `guide`: o que a contagem mudou agora e o que vira em seguida.

**Files:**
- Create: `src/renderer/src/components/StrategyGuide.tsx`
- Test: `test/strategyGuide.test.tsx`

**Interfaces:**
- Consumes: `DEVIATIONS`, `deviationsForSystem`, `sortForCount`, `isDeviationActive`, `currentPlay`, `PLAY_LABELS` de `@shared/domain/deviations`; `formatSigned` de `@shared/format`.
- Produces:
  ```ts
  interface StrategyGuideProps {
    system: CountingSystem
    decisionCount: number
    insuranceOn: boolean
    surrender: boolean
    /** Quantas linhas de desvio cabem. Vem da altura medida da janela. */
    maxRows: number
  }
  ```

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/strategyGuide.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyGuide } from '../src/renderer/src/components/StrategyGuide'

afterEach(cleanup)

describe('StrategyGuide', () => {
  it('lista os desvios que estão valendo no count atual', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={4} insuranceOn surrender maxRows={9} />
    )
    expect(screen.getByText(/15 vs 10/)).toBeTruthy()
    expect(screen.getByText(/16 vs 10/)).toBeTruthy()
  })

  /**
   * Ordenação de sortForCount: entre os ativos, o índice mais alto primeiro —
   * é o que acabou de virar e o mais caro de esquecer.
   */
  it('põe o índice mais alto na frente entre os ativos', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={5} insuranceOn surrender maxRows={9} />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    const dezDez = rows.findIndex((text) => text.includes('10,10 vs 5'))
    const dezesseisDez = rows.findIndex((text) => text.includes('16 vs 10'))
    expect(dezDez).toBeLessThan(dezesseisDez)
  })

  it('em count negativo não fica vazio: diz que é a básica e mostra o próximo', () => {
    render(
      <StrategyGuide
        system="hilo"
        decisionCount={-3}
        insuranceOn={false}
        surrender
        maxRows={9}
      />
    )
    expect(screen.getByText(/estratégia básica/i)).toBeTruthy()
    expect(screen.getByTestId('next-index').textContent).toContain('vs')
  })

  it('mostra o seguro ligado quando o derivado diz que sim', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={3} insuranceOn surrender maxRows={9} />
    )
    expect(screen.getByTestId('insurance').textContent).toContain('fazer seguro')
  })

  it('trunca a lista em maxRows e diz quantos sobraram', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={9} insuranceOn surrender maxRows={4} />
    )
    expect(screen.getAllByTestId('deviation-row')).toHaveLength(4)
    expect(screen.getByText(/\+\d+ mais/)).toBeTruthy()
  })

  /**
   * A regra que o app inteiro respeita: índice de Hi-Lo em running count de KO
   * é conselho errado com cara de certo.
   */
  it('no KO não mostra desvio nenhum e explica por quê', () => {
    render(
      <StrategyGuide system="ko" decisionCount={6} insuranceOn={false} surrender maxRows={9} />
    )
    expect(screen.queryAllByTestId('deviation-row')).toHaveLength(0)
    expect(screen.getByText(/Hi-Lo/)).toBeTruthy()
  })

  it('sem rendição na mesa, os desvios de render somem da lista', () => {
    render(
      <StrategyGuide
        system="hilo"
        decisionCount={9}
        insuranceOn
        surrender={false}
        maxRows={30}
      />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    expect(rows.some((text) => text.includes('render'))).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/strategyGuide.test.tsx
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever `StrategyGuide.tsx`**

```tsx
import { useMemo } from 'react'

import {
  PLAY_LABELS,
  currentPlay,
  deviationsForSystem,
  isDeviationActive,
  sortForCount
} from '@shared/domain/deviations'
import type { Deviation } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'
import type { CountingSystem } from '@shared/types'

export interface StrategyGuideProps {
  system: CountingSystem
  decisionCount: number
  insuranceOn: boolean
  surrender: boolean
  /** Quantas linhas de desvio cabem. Vem da altura medida da janela, não do preset. */
  maxRows: number
}

/** O seguro não é decisão de mão: sai da lista e vira a linha fixa do topo. */
const isHandDeviation = (item: Deviation): boolean => item.handKey !== null

export function StrategyGuide({
  system,
  decisionCount,
  insuranceOn,
  surrender,
  maxRows
}: StrategyGuideProps) {
  const pool = useMemo(
    () =>
      deviationsForSystem(system)
        .filter(isHandDeviation)
        .filter((item) => surrender || item.deviation !== 'surrender'),
    [system, surrender]
  )

  const sorted = useMemo(() => sortForCount(pool, decisionCount), [pool, decisionCount])
  const active = sorted.filter((item) => isDeviationActive(item, decisionCount))
  const shown = active.slice(0, maxRows)
  const hidden = active.length - shown.length
  const next = sorted.find((item) => !isDeviationActive(item, decisionCount)) ?? null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label text-[9px]">Jogada</span>
        <span className="tnum text-[11px] text-muted">
          {system === 'hilo' ? 'TC' : 'RC'} {formatSigned(decisionCount)}
        </span>
      </div>

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

      {system !== 'hilo' ? (
        <p className="text-[10px] leading-snug text-muted">
          Os índices publicados são de Hi-Lo. O KO tem tabela própria, então aqui vale a
          estratégia básica.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-[10px] leading-snug text-muted">
          Nada mudou: estratégia básica em todas as mãos.
        </p>
      ) : (
        <ul className="flex flex-col gap-[3px]">
          {shown.map((item) => (
            <li
              key={item.id}
              data-testid="deviation-row"
              className="flex items-baseline justify-between gap-2 text-[11px]"
            >
              <span className="tnum truncate text-muted">
                {item.hand} vs {item.upcard}
              </span>
              <span className="shrink-0 font-semibold text-pos uppercase">
                {PLAY_LABELS[currentPlay(item, decisionCount)]}
              </span>
            </li>
          ))}
          {hidden > 0 && <li className="text-[10px] text-muted">+{hidden} mais</li>}
        </ul>
      )}

      {system === 'hilo' && next !== null && (
        <p data-testid="next-index" className="tnum text-[10px] leading-snug text-muted">
          Próximo: {next.hand} vs {next.upcard} → {PLAY_LABELS[next.deviation]} em{' '}
          {formatSigned(next.index)}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run test/strategyGuide.test.tsx
```

Esperado: PASS, 7 testes. Se a ordenação do segundo teste falhar, confira `sortForCount` — ele já ordena ativos por índice decrescente; o teste apenas verifica que o componente não reordena por cima.

- [ ] **Step 5: Typecheck e commit**

```bash
npm run typecheck && npm test
```

```bash
git add src/renderer/src/components/StrategyGuide.tsx test/strategyGuide.test.tsx
git commit -m "Guia de jogada: desvios valendo agora e o próximo a virar"
```

---

### Task 9: Janela do overlay de jogada (renderer)

Junta guia e matriz numa janela transparente, com arrasto e alça.

**Files:**
- Create: `src/renderer/strategy.html`
- Create: `src/renderer/src/strategyOverlay.tsx`
- Create: `src/renderer/src/StrategyOverlayApp.tsx`
- Create: `test/reactHelpers.tsx` (extração de `snapshot` e `stubApi`)
- Modify: `test/renderer.test.tsx` (passa a importar os helpers extraídos)
- Modify: `tsconfig.web.json` (incluir `test/**/*.tsx`, não só `test/**/*.test.tsx`)
- Modify: `electron.vite.config.ts` (entrada `strategy`)
- Test: `test/strategyOverlayApp.test.tsx`

**Interfaces:**
- Consumes: `useCounterState`, `useWindowSize` (Task 4), `StrategyGuide` (Task 8), `StrategyGrid` (Task 7), `ResizeGrip` (Task 5).
- Produces: `StrategyOverlayApp` — sem props, lê tudo do snapshot.

- [ ] **Step 1: Extrair os helpers de renderer para um arquivo próprio**

Dois arquivos de teste passam a precisar de `snapshot()` e `stubApi()`. Mova-os de `test/renderer.test.tsx` para `test/reactHelpers.tsx`, exportando-os, e deixe em `renderer.test.tsx` só a importação:

```tsx
import { snapshot, stubApi } from './reactHelpers'
```

`test/reactHelpers.tsx` recebe, sem alteração de conteúdo, os blocos `entries`, `snapshot` e `stubApi` que hoje vivem no topo de `renderer.test.tsx`, mais os imports que eles usam (`vi` de vitest, `DEFAULT_BET_SPREADS`/`DEFAULT_SETTINGS`, `computeDerived`, `HOTKEY_ACTIONS` e os tipos). Cada um ganha `export`. Mantenha o comentário que explica por que o stub existe — ele é o que impede alguém de "simplificar" o duplo depois.

Em `tsconfig.web.json`, o `include` de teste hoje é `test/**/*.test.tsx` e deixaria o helper fora do typecheck:

```json
    "test/**/*.tsx"
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `test/strategyOverlayApp.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyOverlayApp } from '../src/renderer/src/StrategyOverlayApp'
import { DEFAULT_SETTINGS } from '../src/shared/defaults'
import { snapshot, stubApi } from './reactHelpers'

afterEach(cleanup)

describe('StrategyOverlayApp', () => {
  it('no modo guia mostra a lista de desvios', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, layout: 'guide', locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    expect(await screen.findByText('Jogada')).toBeTruthy()
  })

  it('no modo matriz mostra a grade', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, layout: 'matrix', locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    expect(await screen.findByRole('button', { name: /^16 contra 10:/ })).toBeTruthy()
  })

  /**
   * Travado o overlay é click-through: qualquer área que capture o mouse
   * roubaria clique do jogo.
   */
  it('travado não mostra a alça de redimensionar', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: true }
      })
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Jogada')
    expect(screen.queryByRole('slider', { name: /redimensionar/i })).toBeNull()
  })

  it('destravado mostra a alça', async () => {
    stubApi(
      snapshot({
        strategyOverlay: { ...DEFAULT_SETTINGS.strategyOverlay, locked: false }
      })
    )
    render(<StrategyOverlayApp />)
    await screen.findByText('Jogada')
    expect(screen.getByRole('slider', { name: /redimensionar/i })).toBeTruthy()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
npx vitest run test/strategyOverlayApp.test.tsx
```

Esperado: FAIL — módulo não encontrado. Rode também `npx vitest run test/renderer.test.tsx` para confirmar que a extração dos helpers não quebrou nada.

- [ ] **Step 4: Escrever `StrategyOverlayApp.tsx`**

```tsx
import { useEffect } from 'react'

import { DEFAULT_SETTINGS } from '@shared/defaults'

import { ResizeGrip } from '@/components/ResizeGrip'
import { StrategyGrid } from '@/components/StrategyGrid'
import { StrategyGuide } from '@/components/StrategyGuide'
import { useCounterState } from '@/useCounterState'
import { useWindowSize } from '@/useWindowSize'

/** Canvas de desenho do guia, escalado por `zoom` até caber na janela real. */
const GUIDE_WIDTH = 220
/** Altura consumida por cabeçalho, seguro e linha do "próximo". */
const GUIDE_CHROME = 74
const GUIDE_ROW_HEIGHT = 15

/** A matriz tem tamanho intrínseco: o canvas é o do chart completo. */
const MATRIX_WIDTH = 268
const MATRIX_HEIGHT = 372

export function StrategyOverlayApp() {
  const { snapshot } = useCounterState()
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS
  const derived = snapshot?.derived ?? null
  const { locked, opacity, layout } = settings.strategyOverlay
  const windowSize = useWindowSize()

  useEffect(() => {
    document.body.dataset.palette = settings.palette
  }, [settings.palette])

  const matrix = layout === 'matrix'
  const designWidth = matrix ? MATRIX_WIDTH : GUIDE_WIDTH
  const scale = matrix
    ? Math.min(windowSize.width / MATRIX_WIDTH, windowSize.height / MATRIX_HEIGHT)
    : windowSize.width / GUIDE_WIDTH

  // Quantas linhas cabem sai da altura REAL, não do preset: uma regra só serve
  // aos três presets e a qualquer tamanho arrastado.
  const maxRows = Math.max(
    1,
    Math.floor((windowSize.height / scale - GUIDE_CHROME) / GUIDE_ROW_HEIGHT)
  )

  return (
    <div
      style={{ ['--overlay-alpha' as string]: String(opacity) }}
      className={`relative flex h-full w-full items-start justify-center overflow-hidden rounded-[10px] border border-border/70 bg-overlay backdrop-blur-md ${
        locked ? '' : 'app-drag cursor-move'
      }`}
    >
      {!locked && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-fg/40"
        />
      )}

      <div className="p-2" style={{ width: designWidth, zoom: scale }}>
        {matrix ? (
          <StrategyGrid
            decisionCount={derived?.decisionCount ?? 0}
            surrender={settings.shoe.surrender}
            countAware={settings.shoe.system === 'hilo'}
            compact
          />
        ) : (
          <StrategyGuide
            system={settings.shoe.system}
            decisionCount={derived?.decisionCount ?? 0}
            insuranceOn={derived?.insuranceOn ?? false}
            surrender={settings.shoe.surrender}
            maxRows={maxRows}
          />
        )}
      </div>

      {!locked && <ResizeGrip kind="strategy" />}
    </div>
  )
}
```

- [ ] **Step 5: Entrada e HTML**

`src/renderer/src/strategyOverlay.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { StrategyOverlayApp } from '@/StrategyOverlayApp'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('strategy.html sem #root')

createRoot(container).render(
  <StrictMode>
    <StrategyOverlayApp />
  </StrictMode>
)
```

`src/renderer/strategy.html`: copie `src/renderer/overlay.html` inteiro, incluindo o comentário sobre a CSP, trocando `<title>` para `Counter Jogada`, `data-window="strategy"` e o `src` do script para `/src/strategyOverlay.tsx`.

Em `electron.vite.config.ts`, na lista `input`:

```ts
          strategy: resolve(__dirname, 'src/renderer/strategy.html')
```

Atualize o comentário acima do bloco: agora são três entradas.

- [ ] **Step 6: Rodar e ver passar**

```bash
npx vitest run test/strategyOverlayApp.test.tsx && npm test
```

- [ ] **Step 7: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/strategy.html src/renderer/src/strategyOverlay.tsx src/renderer/src/StrategyOverlayApp.tsx electron.vite.config.ts tsconfig.web.json test/reactHelpers.tsx test/renderer.test.tsx test/strategyOverlayApp.test.tsx
git commit -m "Janela do overlay de jogada"
```

---

### Task 10: Segunda janela no main

Instancia o controlador, inclui no broadcast e reconcilia as settings.

**Files:**
- Modify: `src/main/index.ts` (segunda instância, `liveWindows`, `before-quit`, `window-all-closed`, visibilidade inicial, injeção nos handlers)
- Modify: `src/main/ipc/handlers.ts` (`deps.strategyOverlay`, segundo `syncOverlay`, braço `strategy` do `overlayResizeTo`)
- Test: `test/ipc.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: `createOverlayWindow` (Task 3), `STRATEGY_OVERLAY_SIZES`, `OVERLAY_SIZE_LIMITS` (Task 1), `Settings.strategyOverlay` (Task 2).
- Produces: `registerIpcHandlers` passa a exigir `strategyOverlay: OverlayController` em `deps`.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente em `test/ipc.test.ts`. O arquivo já registra handlers com um controller real; acrescente um duplo de `OverlayController` que só conta chamadas:

```ts
function fakeOverlay() {
  const calls: string[] = []
  return {
    calls,
    controller: {
      ensure: () => {
        calls.push('ensure')
        return {} as never
      },
      setVisible: (v: boolean) => calls.push(`setVisible:${String(v)}`),
      setLocked: (v: boolean) => calls.push(`setLocked:${String(v)}`),
      applyPlacement: () => calls.push('applyPlacement'),
      resizeTo: (s: { width: number; height: number }) =>
        calls.push(`resizeTo:${s.width}x${s.height}`),
      get: () => null,
      destroy: () => calls.push('destroy')
    }
  }
}

describe('overlay de jogada pelo IPC', () => {
  it('ligar o overlay de jogada não mexe no de contagem', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    const controller = newController()
    registerIpcHandlers({
      controller,
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null
    })

    await registered.get(IPC.settingsUpdate)?.({ strategyOverlay: { visible: true } })

    expect(strategy.calls).toContain('setVisible:true')
    expect(count.calls).toEqual([])
  })

  it('resizeTo é roteado pelo kind', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null
    })

    await registered.get(IPC.overlayResizeTo)?.('strategy', { width: 300, height: 200 })

    expect(strategy.calls).toEqual(['resizeTo:300x200'])
    expect(count.calls).toEqual([])
  })

  it('kind desconhecido não faz nada, em vez de lançar', async () => {
    const count = fakeOverlay()
    const strategy = fakeOverlay()
    registerIpcHandlers({
      controller: newController(),
      hotkeys: new HotkeyManager(() => {}),
      overlay: count.controller,
      strategyOverlay: strategy.controller,
      getMainWindow: () => null
    })

    await registered.get(IPC.overlayResizeTo)?.('holograma', { width: 300, height: 200 })

    expect(count.calls).toEqual([])
    expect(strategy.calls).toEqual([])
  })
})
```

As chamadas de `registerIpcHandlers` que já existem no arquivo precisam ganhar `strategyOverlay` — atualize-as no mesmo passo.

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/ipc.test.ts
```

Esperado: FAIL — `strategyOverlay` não existe em `deps`.

- [ ] **Step 3: Handlers**

Em `registerIpcHandlers`, acrescente `strategyOverlay: OverlayController` em `deps` e desestruture. Em `applyPatch`, o segundo sync:

```ts
    syncOverlay(
      before.strategyOverlay,
      after.strategyOverlay,
      before.strategyOverlay.size !== after.strategyOverlay.size ||
        before.strategyOverlay.layout !== after.strategyOverlay.layout,
      strategyOverlay
    )
```

E o braço que faltava:

```ts
  handle(IPC.overlayResizeTo, (kind, size) => {
    const target = asSize(size)
    if (!isOverlayKind(kind) || target === null) return
    if (kind === 'count') overlay.resizeTo(target)
    else strategyOverlay.resizeTo(target)
  })
```

- [ ] **Step 4: Main**

Em `src/main/index.ts`, ao lado da variável `overlay`:

```ts
let strategyOverlay: OverlayController | null = null
```

Depois do `overlayController`:

```ts
  const strategyController = createOverlayWindow({
    page: 'strategy.html',
    getPlacement: () => controller.getSnapshot().settings.strategyOverlay,
    getPresetSize: () => {
      const { layout, size } = controller.getSnapshot().settings.strategyOverlay
      return STRATEGY_OVERLAY_SIZES[layout][size]
    },
    getLimits: () =>
      controller.getSnapshot().settings.strategyOverlay.layout === 'matrix'
        ? OVERLAY_SIZE_LIMITS.strategyMatrix
        : OVERLAY_SIZE_LIMITS.strategyGuide,
    onMoved: (customPosition) => {
      controller.updateSettings({ strategyOverlay: { customPosition } })
    },
    onResized: (customSize) => {
      controller.updateSettings({ strategyOverlay: { customSize } })
    }
  })
  strategyOverlay = strategyController
```

`liveWindows()` passa a considerar as três janelas:

```ts
function liveWindows(): BrowserWindow[] {
  const candidates = [
    getMainWindow(),
    overlay === null ? null : overlay.get(),
    strategyOverlay === null ? null : strategyOverlay.get()
  ]
  return candidates.filter(
    (win): win is BrowserWindow =>
      win !== null && !win.isDestroyed() && !win.webContents.isDestroyed()
  )
}
```

Acrescente o helper de visibilidade, irmão de `applyOverlayVisibility`:

```ts
function applyStrategyOverlayVisibility(controller: SessionController, visible: boolean): void {
  controller.updateSettings({ strategyOverlay: { visible } })
  strategyOverlay?.setVisible(visible)
}

const toggleStrategyOverlayVisibility = (): void => {
  applyStrategyOverlayVisibility(
    controller,
    !controller.getSnapshot().settings.strategyOverlay.visible
  )
}
```

Passe `strategyOverlay: strategyController` para `registerIpcHandlers`. Na visibilidade inicial:

```ts
  if (settings.strategyOverlay.visible) strategyController.setVisible(true)
```

Em `window-all-closed`, a checagem de janela viva inclui a nova:

```ts
    const overlayAlive =
      (overlay !== null && overlay.get() !== null) ||
      (strategyOverlay !== null && strategyOverlay.get() !== null)
```

Em `before-quit`, junto do `overlay?.destroy()`:

```ts
    strategyOverlay?.destroy()
    strategyOverlay = null
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx vitest run test/ipc.test.ts && npm test
```

- [ ] **Step 6: Typecheck, e verificação manual no app**

```bash
npm run typecheck
```

```bash
npm run dev
```

Abra Ajustes ainda não tem a seção (Task 12), então force pela console do DevTools da janela principal:

```js
window.counter.updateSettings({ strategyOverlay: { visible: true, locked: false } })
```

Confirme: a janela aparece no canto inferior direito, arrasta pelo corpo, e a alça no canto inferior direito redimensiona. **Este é o ponto de verificação do risco listado no spec** — se `mousemove` parar de chegar ao sair da janela, o `ResizeGrip` já ouve no `window`, que é o fallback previsto; se ainda assim falhar, registre o comportamento antes de seguir.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts src/main/ipc/handlers.ts test/ipc.test.ts
git commit -m "Segunda janela de overlay no processo main"
```

---

### Task 11: Hotkey, bandeja e botão para o overlay de jogada

Sem isso, ligar o guia exige alt-tab — o que o app existe para evitar.

**Files:**
- Modify: `src/shared/types.ts` (`HotkeyAction`, `HOTKEY_ACTIONS`, `OPTIONAL_HOTKEY_ACTIONS`)
- Modify: `src/shared/defaults.ts` (`DEFAULT_BINDINGS.toggleStrategyOverlay: ''`)
- Modify: `src/main/index.ts` (`handleHotkey`, `createTray`)
- Modify: `src/main/tray.ts` (`TrayDeps.onToggleStrategyOverlay`, item de menu, assinatura do menu)
- Modify: `src/renderer/src/App.tsx` (`ACTION_LABELS`, botão)
- Modify: `src/renderer/src/components/SettingsPanel.tsx` (`HOTKEY_LABELS`)
- Test: `test/systems.test.ts` ou `test/ipc.test.ts` (a ação nova é registrável) + `test/renderer.test.tsx` (botão)

**Interfaces:**
- Produces: `HotkeyAction` ganha `'toggleStrategyOverlay'`, presente em `HOTKEY_ACTIONS` e em `OPTIONAL_HOTKEY_ACTIONS`.

- [ ] **Step 1: Escrever os testes que falham**

Em `test/ipc.test.ts`:

```ts
it('a ação de overlay de jogada é opcional e registrável', () => {
  const fired: string[] = []
  const m = new HotkeyManager((a) => fired.push(a))
  const status = m.apply(
    binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4', toggleStrategyOverlay: 'F6' }),
    true
  )

  expect(status.toggleStrategyOverlay).toBe('ok')
  shortcuts.get('F6')?.()
  expect(fired).toEqual(['toggleStrategyOverlay'])
})

it('sem tecla atribuída fica disabled, não conflict', () => {
  const m = new HotkeyManager(() => {})
  const status = m.apply(binds({ low: 'F1', neutral: 'F2', high: 'F3', undo: 'F4' }), true)
  expect(status.toggleStrategyOverlay).toBe('disabled')
})
```

Em `test/renderer.test.tsx`:

```tsx
it('o botão de guia de jogada liga o overlay de jogada', async () => {
  const api = stubApi(snapshot())
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Jogada' }))
  expect(api.updateSettings).toHaveBeenCalledWith({ strategyOverlay: { visible: true } })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/ipc.test.ts test/renderer.test.tsx
```

Esperado: FAIL — a ação não existe no tipo.

- [ ] **Step 3: Tipos e defaults**

Em `src/shared/types.ts`:

```ts
export type HotkeyAction =
  | 'low'
  | 'neutral'
  | 'high'
  | 'undo'
  | 'redo'
  | 'newShoe'
  | 'toggleOverlay'
  | 'toggleStrategyOverlay'

export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  'low',
  'neutral',
  'high',
  'undo',
  'redo',
  'newShoe',
  'toggleOverlay',
  'toggleStrategyOverlay'
]

export const OPTIONAL_HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  'redo',
  'newShoe',
  'toggleOverlay',
  'toggleStrategyOverlay'
]
```

Em `DEFAULT_BINDINGS`, acrescente `toggleStrategyOverlay: ''` — como as outras opcionais, nasce sem tecla porque cada bind global custa a tecla no sistema inteiro.

- [ ] **Step 4: Main e bandeja**

Em `handleHotkey`, a assinatura ganha o segundo toggle e o `switch` o caso:

```ts
    case 'toggleStrategyOverlay':
      toggleStrategyOverlay()
      break
```

Passe `toggleStrategyOverlayVisibility` (criado na Task 10) na construção do `HotkeyManager` e em `createTray`:

```ts
    onToggleStrategyOverlay: toggleStrategyOverlayVisibility,
```

Em `src/main/tray.ts`, `TrayDeps` ganha `onToggleStrategyOverlay: () => void`; o menu ganha o item logo abaixo de `Overlay`:

```ts
        {
          label: 'Guia de jogada',
          type: 'checkbox',
          checked: snapshot.settings.strategyOverlay.visible,
          click: () => deps.onToggleStrategyOverlay()
        },
```

E a assinatura do menu inclui o novo estado, senão o check não atualiza:

```ts
      const signature = `${String(snapshot.settings.overlay.visible)}|${String(
        snapshot.settings.strategyOverlay.visible
      )}|${String(snapshot.settings.hotkeysEnabled)}`
```

- [ ] **Step 5: Renderer**

Em `App.tsx`, `ACTION_LABELS` ganha `toggleStrategyOverlay: 'Jogada'`. No grid de ações, o quinto botão passa a ocupar a linha inteira para não deixar buraco:

```tsx
            <ActionButton
              label={settings.strategyOverlay.visible ? 'Jogada ligada' : 'Jogada'}
              tone={settings.strategyOverlay.visible ? 'active' : 'default'}
              title="Overlay com a jogada correta para cada mão no count atual"
              onClick={() =>
                patch({ strategyOverlay: { visible: !settings.strategyOverlay.visible } })
              }
            />
```

Coloque-o logo depois do botão de Overlay. Com cinco itens num `grid-cols-2` o último ficaria com meia largura e um buraco ao lado; a saída é separar em dois grids, o de contagem e o de janelas:

```tsx
          <div className="grid grid-cols-2 gap-1.5">
            {/* Desfazer, Refazer, Novo shoe — o terceiro ocupa a linha inteira */}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Overlay e Jogada, lado a lado: são as duas janelas */}
          </div>
```

Agrupar assim também diz o que os botões são: três ações sobre a contagem, dois interruptores de janela. Confirme visualmente com `npm run dev`.

Em `SettingsPanel.tsx`, `HOTKEY_LABELS` ganha:

```ts
  toggleStrategyOverlay: 'Mostrar/esconder guia de jogada'
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npm test
```

Esperado: verde. `test/persistence.test.ts` e `test/store.test.ts` iteram `HOTKEY_ACTIONS`, então absorvem a ação nova sozinhos.

- [ ] **Step 7: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/index.ts src/main/tray.ts src/renderer/src/App.tsx src/renderer/src/components/SettingsPanel.tsx test/ipc.test.ts test/renderer.test.tsx
git commit -m "Atalho, item de bandeja e botão para o guia de jogada"
```

---

### Task 12: Seção "Overlay de jogada" em Ajustes

**Files:**
- Modify: `src/renderer/src/components/SettingsPanel.tsx`
- Test: `test/renderer.test.tsx`

**Interfaces:**
- Consumes: `Settings.strategyOverlay` (Task 2).

- [ ] **Step 1: Escrever o teste que falha**

```tsx
describe('ajustes do overlay de jogada', () => {
  it('trocar para matriz emite o patch', async () => {
    const api = stubApi(snapshot())
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Matriz' }))
    expect(api.updateSettings).toHaveBeenCalledWith({
      strategyOverlay: { layout: 'matrix', customSize: null }
    })
  })

  /**
   * Trocar de guia para matriz troca a tabela de presets inteira; um tamanho
   * arrastado no guia não descreve nada no layout novo.
   */
  it('trocar de layout limpa o tamanho arrastado', async () => {
    const api = stubApi(
      snapshot({
        strategyOverlay: {
          ...DEFAULT_SETTINGS.strategyOverlay,
          customSize: { width: 300, height: 200 }
        }
      })
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ajustes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Matriz' }))
    expect(api.updateSettings).toHaveBeenCalledWith({
      strategyOverlay: { layout: 'matrix', customSize: null }
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/renderer.test.tsx
```

Esperado: FAIL — não existe botão `Matriz`.

- [ ] **Step 3: Implementar**

Junto das outras listas de opções:

```ts
const STRATEGY_LAYOUT_OPTIONS: readonly Option<StrategyOverlayLayout>[] = [
  { value: 'guide', label: 'Guia' },
  { value: 'matrix', label: 'Matriz' }
]
```

Desestruture `strategyOverlay` junto de `overlay`, e crie o patcher irmão:

```ts
  const patchStrategyOverlay = (patch: DeepPartial<Settings['strategyOverlay']>): void =>
    onPatch({ strategyOverlay: patch })
```

Logo depois da `<Section title="Overlay">`:

```tsx
      <Section title="Overlay de jogada">
        <Field label="Mostrar" hint="Janela separada, por cima do jogo">
          <Toggle
            checked={strategyOverlay.visible}
            label="Mostrar guia de jogada"
            onChange={(visible) => patchStrategyOverlay({ visible })}
          />
        </Field>

        <Field label="Modo" hint="Guia mostra só o que a contagem mudou">
          <Segmented
            value={strategyOverlay.layout}
            options={STRATEGY_LAYOUT_OPTIONS}
            // Os dois layouts têm tabelas de preset diferentes: um tamanho
            // arrastado no guia não descreve nada na matriz.
            onSelect={(layout) => patchStrategyOverlay({ layout, customSize: null })}
          />
        </Field>

        <Field
          label="Tamanho"
          hint={strategyOverlay.customSize !== null ? 'Em tamanho ajustado' : undefined}
        >
          <Segmented
            value={strategyOverlay.size}
            options={SIZE_OPTIONS}
            onSelect={(size) => patchStrategyOverlay({ size, customSize: null })}
          />
        </Field>

        <Field label="Opacidade" hint={`${Math.round(strategyOverlay.opacity * 100)}%`} stacked>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.02}
            value={strategyOverlay.opacity}
            aria-label="Opacidade do overlay de jogada"
            onChange={(event) =>
              patchStrategyOverlay({ opacity: Number(event.target.value) })
            }
            className="w-full accent-fg"
          />
        </Field>

        <Field
          label="Canto"
          hint={strategyOverlay.customPosition !== null ? 'Em posição arrastada' : undefined}
          stacked
        >
          <div className="grid grid-cols-2 gap-1.5">
            {CORNER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={
                  option.value === strategyOverlay.corner &&
                  strategyOverlay.customPosition === null
                }
                onClick={() =>
                  patchStrategyOverlay({ corner: option.value, customPosition: null })
                }
                className={`h-7 rounded-md border text-[11px] transition-colors duration-100 ${
                  option.value === strategyOverlay.corner &&
                  strategyOverlay.customPosition === null
                    ? 'border-muted bg-fg/10 text-fg'
                    : 'border-border bg-bg text-muted hover:text-fg'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Travar (click-through)" hint="Destravado permite arrastar e redimensionar">
          <Toggle
            checked={strategyOverlay.locked}
            label="Travar overlay de jogada"
            onChange={(locked) => patchStrategyOverlay({ locked })}
          />
        </Field>

        <p className="text-[10px] leading-snug text-muted">
          No KO os dois modos mostram estratégia básica: os índices publicados são de Hi-Lo e a
          escala do KO é outra.
        </p>
      </Section>
```

Os botões de canto aparecem agora em duas seções com rótulos iguais; os testes que buscam por nome de botão de canto precisam de `getAllByRole` ou de um escopo por seção. Ajuste os que quebrarem.

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

- [ ] **Step 5: Typecheck e commit**

```bash
npm run typecheck
```

```bash
git add src/renderer/src/components/SettingsPanel.tsx test/renderer.test.tsx
git commit -m "Seção de ajustes do overlay de jogada"
```

---

### Task 13: Máquina de estado da atualização

`policy.ts` deixa de decidir quando interromper e passa a descrever o que a pílula mostra.

**Files:**
- Modify: `src/main/updater/policy.ts` (reescrita)
- Modify: `src/shared/types.ts` (`UpdateStatus`, que atravessa o IPC)
- Test: `test/updater.test.ts` (reescrita)

**Interfaces:**
- Produces:
  - Em `@shared/types`: `type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'` e `interface UpdateStatus { phase: 'downloading' | 'ready'; version: string | null; percent: number }`
  - Em `policy.ts`: `interface UpdateState { phase: UpdatePhase; version: string | null; percent: number; dismissed: boolean; lastCheckAt: number | null }`, `visibleStatus(state): UpdateStatus | null`, `shouldCheck(state, now, minGapMs): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Substitua `test/updater.test.ts` inteiro:

```ts
import { describe, expect, it } from 'vitest'

import { shouldCheck, visibleStatus } from '../src/main/updater/policy'
import type { UpdateState } from '../src/main/updater/policy'

const idle: UpdateState = {
  phase: 'idle',
  version: null,
  percent: 0,
  dismissed: false,
  lastCheckAt: null
}

describe('visibleStatus', () => {
  it('parado não mostra nada', () => {
    expect(visibleStatus(idle)).toBeNull()
  })

  /** Checagem em andamento não é notícia: a pílula só aparece quando há o quê dizer. */
  it('checando não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'checking' })).toBeNull()
  })

  /**
   * Falha de atualização nunca vira alerta: o app tem que abrir e contar cartas
   * com o GitHub fora do ar.
   */
  it('erro não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'error' })).toBeNull()
  })

  it('baixando mostra versão e progresso', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', percent: 37 })
    ).toEqual({ phase: 'downloading', version: '0.3.0', percent: 37 })
  })

  it('pronta mostra a versão', () => {
    expect(visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', percent: 100 })).toEqual({
      phase: 'ready',
      version: '0.3.0',
      percent: 100
    })
  })

  it('dispensada some, mesmo pronta', () => {
    expect(
      visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })

  it('dispensada some também durante o download', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })
})

describe('shouldCheck', () => {
  it('nunca checado -> checa', () => {
    expect(shouldCheck(idle, 1_000, 300_000)).toBe(true)
  })

  it('dentro da janela mínima -> não checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 200_000, 300_000)).toBe(false)
  })

  it('passada a janela mínima -> checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 400_000, 300_000)).toBe(true)
  })

  /**
   * Já baixada e pronta, checar de novo é tráfego à toa: o autoUpdater não tem
   * o que fazer com uma segunda resposta igual.
   */
  it('com atualização pronta -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'ready', version: '0.3.0' }, 999_999, 300_000)).toBe(
      false
    )
  })

  it('baixando -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'downloading' }, 999_999, 300_000)).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/updater.test.ts
```

Esperado: FAIL — `visibleStatus` não existe.

- [ ] **Step 3: Reescrever `policy.ts`**

```ts
import type { UpdatePhase, UpdateStatus } from '@shared/types'

export interface UpdateState {
  phase: UpdatePhase
  /** Versão da atualização em curso; null enquanto não há nenhuma. */
  version: string | null
  /** 0..100. Só significativo em 'downloading'. */
  percent: number
  /** O usuário fechou a pílula desta pendência. */
  dismissed: boolean
  /** epoch ms da última checagem disparada. */
  lastCheckAt: number | null
}

/**
 * O que a pílula mostra. `null` = pílula escondida.
 *
 * `idle` e `checking` não são notícia, e `error` nunca vira alerta: o app tem
 * que abrir e contar cartas com o GitHub fora do ar. Isto substituiu o
 * `shouldPromptForUpdate`, que existia para decidir QUANDO interromper — uma
 * pílula passiva não interrompe, então o gate de foco deixou de fazer sentido.
 */
export function visibleStatus(state: UpdateState): UpdateStatus | null {
  if (state.dismissed) return null
  if (state.phase !== 'downloading' && state.phase !== 'ready') return null
  return { phase: state.phase, version: state.version, percent: state.percent }
}

/** Evita rechecar em rajada quando a janela ganha e perde foco várias vezes. */
export function shouldCheck(state: UpdateState, now: number, minGapMs: number): boolean {
  if (state.phase === 'downloading' || state.phase === 'ready') return false
  if (state.lastCheckAt === null) return true
  return now - state.lastCheckAt >= minGapMs
}
```

Em `src/shared/types.ts`, no fim:

```ts
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

/** Estado da atualização como a janela principal precisa ver. */
export interface UpdateStatus {
  phase: 'downloading' | 'ready'
  version: string | null
  /** 0..100. */
  percent: number
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx vitest run test/updater.test.ts
```

Esperado: PASS, 12 testes. `npm test` ainda vai falhar no `controller.ts`, que importa `shouldPromptForUpdate` — a Task 14 conserta.

- [ ] **Step 5: Commit**

Este é o único commit do plano que fecha com a suíte vermelha, e é deliberado: separar a máquina de estado pura do controlador de efeitos deixa cada revisão pequena. Se preferir manter todo commit verde, faça as Tasks 13 e 14 num commit só.

```bash
git add src/main/updater/policy.ts src/shared/types.ts test/updater.test.ts
git commit -m "Máquina de estado da pílula de atualização"
```

---

### Task 14: Controlador do updater

Ritmo novo, progresso de download, broadcast e adeus ao diálogo nativo.

**Files:**
- Modify: `src/main/updater/controller.ts` (reescrita do corpo)
- Modify: `src/shared/ipc.ts` (canais `updateInstall`, `updateDismiss`; evento `updateStatus`; métodos em `CounterApi`)
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts` (o updater precisa emitir para as janelas)
- Test: coberto pela Task 13 na parte pura; a parte de efeitos é verificada manualmente no Step 5.

**Interfaces:**
- Consumes: `visibleStatus`, `shouldCheck`, `UpdateState` (Task 13).
- Produces:
  - `createUpdaterController(deps: { broadcast: (status: UpdateStatus | null) => void }): UpdaterController`
  - `UpdaterController` ganha `install(): void`, `dismiss(): void`, `status(): UpdateStatus | null`
  - `IPC.updateGetStatus`, `IPC.updateInstall`, `IPC.updateDismiss`, `IPC_EVENTS.updateStatus`

**Acréscimo ao spec:** o spec lista dois canais renderer→main; o plano tem três.
`update:getStatus` existe porque a janela principal pode ser fechada e recriada
pela bandeja a qualquer momento, e sem uma leitura inicial ela só descobriria a
pendência no próximo broadcast — que pode não vir nunca, já que o estado parou
de mudar. É o mesmo motivo pelo qual `state:get` existe ao lado de
`state:changed`.
  - `CounterApi.installUpdate()`, `CounterApi.dismissUpdate()`, `CounterApi.getUpdateStatus()`, `CounterApi.onUpdateStatus(cb)`

- [ ] **Step 1: Reescrever `src/main/updater/controller.ts`**

```ts
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

import { shouldCheck, visibleStatus } from './policy'
import type { UpdateState } from './policy'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

/** Tempo até a primeira checagem: deixa a janela e os hotkeys subirem antes. */
const FIRST_CHECK_DELAY_MS = 10_000
/** O app vive dias na bandeja, então rechecar é o que mantém ele em dia. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000
/**
 * Piso entre checagens disparadas por foco. Alt-tab é frequente; sem o piso,
 * cada volta para o app viraria um GET.
 */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000

export interface UpdaterController {
  install(): void
  dismiss(): void
  status(): UpdateStatus | null
  dispose(): void
}

export function createUpdaterController(deps: {
  getMainWindow: () => BrowserWindow | null
  broadcast: (status: UpdateStatus | null) => void
}): UpdaterController {
  const state: UpdateState = {
    phase: 'idle',
    version: null,
    percent: 0,
    dismissed: false,
    lastCheckAt: null
  }

  // Em `electron-vite dev` não existe app empacotado nem app-update.yml: checar
  // aqui só produziria erro a cada boot de desenvolvimento.
  if (!app.isPackaged) {
    return {
      install: () => {},
      dismiss: () => {},
      status: () => null,
      dispose: () => {}
    }
  }

  let firstCheck: NodeJS.Timeout | null = null
  let recheck: NodeJS.Timeout | null = null
  let disposed = false

  function emit(): void {
    if (disposed) return
    deps.broadcast(visibleStatus(state))
  }

  function check(): void {
    if (disposed) return
    state.lastCheckAt = Date.now()
    if (state.phase === 'idle' || state.phase === 'error') state.phase = 'checking'
    // Sem rede o updater rejeita; o catch mantém o app em silêncio.
    autoUpdater.checkForUpdates().catch(() => {
      state.phase = 'error'
      emit()
    })
  }

  function checkOnFocus(): void {
    if (!shouldCheck(state, Date.now(), MIN_CHECK_GAP_MS)) return
    check()
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    state.phase = 'downloading'
    state.version = info.version
    state.percent = 0
    // Pendência nova desarma o "dispensar" da anterior: é outra versão.
    state.dismissed = false
    emit()
  })

  autoUpdater.on('update-not-available', () => {
    if (state.phase === 'checking') state.phase = 'idle'
    emit()
  })

  autoUpdater.on('download-progress', (progress) => {
    state.phase = 'downloading'
    state.percent = Math.round(progress.percent)
    emit()
  })

  autoUpdater.on('update-downloaded', (info) => {
    state.phase = 'ready'
    state.version = info.version
    state.percent = 100
    state.dismissed = false
    emit()
  })

  // Falha de atualização nunca vira popup: o app tem que abrir e contar cartas
  // mesmo offline ou com o GitHub fora do ar.
  autoUpdater.on('error', () => {
    state.phase = 'error'
    emit()
  })

  app.on('browser-window-focus', checkOnFocus)

  firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS)
  recheck = setInterval(check, CHECK_INTERVAL_MS)

  return {
    install: () => {
      if (state.phase !== 'ready') return
      // Silencioso (sem o assistente do NSIS) e reabrindo o app depois.
      autoUpdater.quitAndInstall(true, true)
    },
    dismiss: () => {
      state.dismissed = true
      emit()
    },
    status: () => visibleStatus(state),
    dispose: () => {
      disposed = true
      if (firstCheck !== null) clearTimeout(firstCheck)
      if (recheck !== null) clearInterval(recheck)
      firstCheck = null
      recheck = null
      app.removeListener('browser-window-focus', checkOnFocus)
      autoUpdater.removeAllListeners()
    }
  }
}
```

`deps.getMainWindow` deixou de ser usado no corpo — remova-o da assinatura e do chamador se nada mais precisar dele.

- [ ] **Step 2: IPC e preload**

Em `src/shared/ipc.ts`, no objeto `IPC`:

```ts
  updateGetStatus: 'update:getStatus',
  updateInstall: 'update:install',
  updateDismiss: 'update:dismiss',
```

Em `IPC_EVENTS`:

```ts
  updateStatus: 'update:status'
```

Em `CounterApi`:

```ts
  /** null = nenhuma atualização a anunciar. */
  getUpdateStatus(): Promise<UpdateStatus | null>
  installUpdate(): Promise<void>
  dismissUpdate(): Promise<void>
  /** Assina o estado da atualização. Retorna a função de unsubscribe. */
  onUpdateStatus(cb: (status: UpdateStatus | null) => void): () => void
```

Importe `UpdateStatus` de `./types`. Em `src/preload/index.ts`:

```ts
  getUpdateStatus: () => ipcRenderer.invoke(IPC.updateGetStatus),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  dismissUpdate: () => ipcRenderer.invoke(IPC.updateDismiss),

  onUpdateStatus: (cb: (status: UpdateStatus | null) => void) => {
    const listener = (_event: IpcRendererEvent, status: UpdateStatus | null): void => cb(status)
    ipcRenderer.on(IPC_EVENTS.updateStatus, listener)
    return () => {
      ipcRenderer.removeListener(IPC_EVENTS.updateStatus, listener)
    }
  },
```

- [ ] **Step 3: Ligar no main**

Em `src/main/index.ts`, uma função de broadcast irmã da de snapshot:

```ts
function broadcastUpdate(status: UpdateStatus | null): void {
  for (const win of liveWindows()) win.webContents.send(IPC_EVENTS.updateStatus, status)
}
```

E a criação:

```ts
  updater = createUpdaterController({ broadcast: broadcastUpdate })
```

Os três handlers, junto dos outros em `registerIpcHandlers` — o updater precisa ser injetado, então `deps` ganha `updater: UpdaterController` (com o `import type { UpdaterController } from '../updater/controller'` no topo do arquivo):

```ts
  handle(IPC.updateGetStatus, () => updater.status())
  handle(IPC.updateInstall, () => updater.install())
  handle(IPC.updateDismiss, () => updater.dismiss())
```

Ordem de bootstrap: `updater` é criado depois de `registerIpcHandlers` hoje. Mova a criação do updater para **antes** da chamada de `registerIpcHandlers` e passe a referência; `broadcastUpdate` só é chamada por callback, então não há ciclo.

Os testes de `test/ipc.test.ts` que chamam `registerIpcHandlers` precisam do duplo:

```ts
const noopUpdater = {
  install: () => {},
  dismiss: () => {},
  status: () => null,
  dispose: () => {}
}
```

- [ ] **Step 4: Rodar a suíte**

```bash
npm test && npm run typecheck
```

Esperado: verde, incluindo os testes da Task 13.

- [ ] **Step 5: Verificação manual**

```bash
npm run dev
```

Em dev o updater é um no-op por `app.isPackaged` — confirme apenas que o app sobe sem erro no console e que `window.counter.getUpdateStatus()` devolve `null`. O caminho empacotado é verificado na Task 16.

- [ ] **Step 6: Commit**

```bash
git add src/main/updater/controller.ts src/shared/ipc.ts src/preload/index.ts src/main/index.ts src/main/ipc/handlers.ts test/ipc.test.ts
git commit -m "Updater com progresso, ritmo novo e sem diálogo nativo"
```

---

### Task 15: Pílula de atualização

**Files:**
- Create: `src/renderer/src/components/UpdateToast.tsx`
- Create: `src/renderer/src/useUpdateStatus.ts`
- Modify: `src/renderer/src/App.tsx` (montar a pílula)
- Test: `test/updateToast.test.tsx`

**Interfaces:**
- Consumes: `UpdateStatus` (Task 13), `CounterApi.getUpdateStatus/onUpdateStatus/installUpdate/dismissUpdate` (Task 14).
- Produces: `useUpdateStatus(): UpdateStatus | null`; `<UpdateToast />`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `test/updateToast.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpdateToast } from '../src/renderer/src/components/UpdateToast'
import type { UpdateStatus } from '../src/shared/types'

function installApi(status: UpdateStatus | null) {
  const api = {
    getUpdateStatus: () => Promise.resolve(status),
    installUpdate: vi.fn(() => Promise.resolve()),
    dismissUpdate: vi.fn(() => Promise.resolve()),
    onUpdateStatus: () => () => {}
  }
  Object.defineProperty(window, 'counter', { configurable: true, value: api })
  return api
}

afterEach(cleanup)

describe('UpdateToast', () => {
  it('sem status não desenha nada', async () => {
    installApi(null)
    const { container } = render(<UpdateToast />)
    await Promise.resolve()
    expect(container.textContent).toBe('')
  })

  it('baixando mostra a porcentagem', async () => {
    installApi({ phase: 'downloading', version: '0.3.0', percent: 37 })
    render(<UpdateToast />)
    expect(await screen.findByText('37%')).toBeTruthy()
    expect(screen.getByText(/0\.3\.0/)).toBeTruthy()
  })

  it('pronta oferece reiniciar', async () => {
    const api = installApi({ phase: 'ready', version: '0.3.0', percent: 100 })
    render(<UpdateToast />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar' }))
    expect(api.installUpdate).toHaveBeenCalled()
  })

  it('o x dispensa', async () => {
    const api = installApi({ phase: 'ready', version: '0.3.0', percent: 100 })
    render(<UpdateToast />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dispensar' }))
    expect(api.dismissUpdate).toHaveBeenCalled()
  })

  /** Baixando ainda não dá para reiniciar: não há o que instalar. */
  it('baixando não oferece reiniciar', async () => {
    installApi({ phase: 'downloading', version: '0.3.0', percent: 37 })
    render(<UpdateToast />)
    await screen.findByText('37%')
    expect(screen.queryByRole('button', { name: 'Reiniciar' })).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx vitest run test/updateToast.test.tsx
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 3: Escrever o hook**

`src/renderer/src/useUpdateStatus.ts`, no mesmo formato de `useCounterState`:

```ts
import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let live = true
    let broadcasted = false

    // Assina ANTES do get para não perder uma mudança durante o await.
    const unsubscribe = window.counter.onUpdateStatus((next) => {
      broadcasted = true
      if (live) setStatus(next)
    })

    window.counter
      .getUpdateStatus()
      .then((initial) => {
        if (live && !broadcasted) setStatus(initial)
      })
      .catch(() => {
        // Sem estado inicial o próximo broadcast recupera a pílula.
      })

    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  return status
}
```

- [ ] **Step 4: Escrever a pílula**

`src/renderer/src/components/UpdateToast.tsx`:

```tsx
import { useUpdateStatus } from '@/useUpdateStatus'

/**
 * Pílula de atualização, rodapé da janela principal.
 *
 * Substituiu um dialog.showMessageBox nativo. A troca não é só estética: o
 * diálogo era modal e precisava esperar o jogador sair da mesa para não roubar
 * a tela no meio de uma mão. Uma pílula passiva não interrompe, então pode
 * aparecer assim que há o que dizer.
 */
export function UpdateToast() {
  const status = useUpdateStatus()
  if (status === null) return null

  const ready = status.phase === 'ready'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
      <div className="update-toast pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border bg-overlay px-3 py-1.5 text-[11px] shadow-lg backdrop-blur-md">
        <span className="truncate text-fg">
          {ready ? `Versão ${status.version} pronta` : `Baixando ${status.version}`}
        </span>

        {!ready && (
          <>
            <span
              aria-hidden="true"
              className="h-[2px] w-16 overflow-hidden rounded-full bg-fg/15"
            >
              <span
                className="block h-full rounded-full bg-fg/60 transition-[width] duration-300"
                style={{ width: `${status.percent}%` }}
              />
            </span>
            <span className="tnum shrink-0 text-muted">{status.percent}%</span>
          </>
        )}

        {ready && (
          <button
            type="button"
            onClick={() => void window.counter.installUpdate()}
            className="shrink-0 rounded-full border border-pos/40 bg-pos/10 px-2.5 py-0.5 text-pos transition-colors duration-100 hover:bg-pos/20"
          >
            Reiniciar
          </button>
        )}

        <button
          type="button"
          aria-label="Dispensar"
          onClick={() => void window.counter.dismissUpdate()}
          className="shrink-0 rounded-full px-1 text-muted transition-colors duration-100 hover:text-fg"
        >
          ×
        </button>
      </div>
    </div>
  )
}
```

Em `src/renderer/src/styles.css`, a entrada:

```css
@keyframes update-toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.update-toast {
  animation: update-toast-in 180ms ease-out;
}
```

- [ ] **Step 5: Montar no App**

Em `App.tsx`, o container raiz ganha `relative` e a pílula entra como último filho, fora do bloco de abas para valer em todas:

```tsx
    <div className="relative flex h-full flex-col">
```

```tsx
      <UpdateToast />
    </div>
```

Só a janela principal a monta — os overlays ignoram o canal de propósito: notícia de atualização por cima do jogo é o que esta mudança existe para eliminar.

O stub de `window.counter` em `test/renderer.test.tsx` passa a precisar de `getUpdateStatus` e `onUpdateStatus`; acrescente-os ao `stubApi`.

- [ ] **Step 6: Rodar e ver passar**

```bash
npm test && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/UpdateToast.tsx src/renderer/src/useUpdateStatus.ts src/renderer/src/App.tsx src/renderer/src/styles.css test/updateToast.test.tsx test/renderer.test.tsx
git commit -m "Pílula de atualização no rodapé da janela principal"
```

---

### Task 16: Versão, changelog, README e verificação empacotada

**Files:**
- Modify: `package.json` (`version`)
- Modify: `src/shared/changelog.ts` (entrada 0.3.0)
- Modify: `README.md`
- Test: `test/changelog.test.ts` (já existe; passa a exigir a entrada nova)

- [ ] **Step 1: Rodar o teste que já falha**

```bash
npx vitest run test/changelog.test.ts
```

Ainda passa, porque a versão continua 0.2.1. Suba a versão primeiro para ver o teste cumprir o papel dele:

Em `package.json`: `"version": "0.3.0"`.

```bash
npx vitest run test/changelog.test.ts
```

Esperado: FAIL — `CHANGELOG[0].version` é `0.2.1`, esperado `0.3.0`.

- [ ] **Step 2: Escrever a entrada do changelog**

No topo do array em `src/shared/changelog.ts`:

```ts
  {
    version: '0.3.0',
    date: '2026-08-22',
    changes: [
      'Overlay de jogada: uma segunda janela sobre o jogo com a jogada correta para cada mão no count atual, em modo guia ou matriz completa.',
      'Os dois overlays agora se redimensionam com o mouse, pela alça no canto, além dos três tamanhos prontos.',
      'A atualização deixou de abrir uma janela do Windows: agora é uma faixa discreta no rodapé, com o progresso do download.',
      'O app procura atualização em 10 segundos depois de abrir e a cada 30 minutos, em vez de a cada 6 horas.'
    ]
  },
```

- [ ] **Step 3: Rodar e ver passar**

```bash
npx vitest run test/changelog.test.ts && npm test && npm run typecheck
```

Esperado: tudo verde.

- [ ] **Step 4: README**

Acrescente na tabela de atalhos a nota de que agora são **quatro** ações sem tecla por padrão (era três), incluindo o guia de jogada. Depois da seção de atalhos, uma seção nova:

```markdown
## Overlay de jogada

Além do overlay de contagem, há um segundo overlay que responde a pergunta que
o primeiro não responde: **o que fazer com esta mão**. Ele lê o mesmo count e
tem dois modos:

- **Guia** (padrão) — só o que a contagem mudou agora: os desvios que estão
  valendo, o estado do seguro e qual índice vira em seguida.
- **Matriz** — o chart completo, mão × carta do dealer, com as células que a
  contagem mudou em destaque.

No KO os dois modos mostram **estratégia básica**, sem índices: os números
publicados são de Hi-Lo e a escala do KO é outra, então aplicá-los ali daria
conselho errado com cara de certo.

Liga em Ajustes, pela bandeja, pelo botão "Jogada" na aba Contagem ou por uma
tecla, se você atribuir uma.

### Mover e redimensionar

Os dois overlays nascem **travados**, o que os torna click-through: o clique
atravessa para o jogo. Destrave em Ajustes para posicionar — aí a janela ganha
uma alcinha no topo (arrastar) e uma alça no canto inferior direito
(redimensionar) — e trave de volta quando estiver do jeito que você quer.

O tamanho arrastado tem prioridade sobre os três presets. Clicar num preset
descarta o tamanho arrastado e volta para ele.
```

Na seção de Atualizações, troque a descrição do diálogo pela pílula e corrija o ritmo: primeira checagem 10 s depois de abrir, depois a cada 30 minutos e sempre que a janela principal ganha foco (no máximo uma checagem a cada 5 minutos).

- [ ] **Step 5: Verificação empacotada**

```bash
npm run build:win
```

Instale o `.exe` de `release/` e confirme, no app instalado e não em dev:

1. o overlay de jogada aparece, arrasta e **redimensiona pela alça** — é o risco listado no spec, e só o build empacotado prova;
2. os dois overlays ficam por cima de um jogo em borderless;
3. o guia muda de conteúdo conforme a contagem sobe.

A pílula de atualização só aparece com uma release publicada mais nova que a instalada; ela é verificada de fato na próxima release.

- [ ] **Step 6: Commit**

```bash
git add package.json src/shared/changelog.ts README.md
git commit -m "0.3.0: changelog e documentação"
```

---

## Publicação

Fora do plano de código, mas é o que fecha a entrega. O README já documenta o
rito e a armadilha dos rascunhos duplicados; em resumo:

```bash
gh release create v0.3.0 --draft --title 0.3.0 --notes "Overlay de jogada, overlays redimensionáveis e atualização discreta"
```

```bash
npm run build:win -- --publish always
```

```bash
gh release edit v0.3.0 --draft=false
```

Criar o rascunho **antes** do build é obrigatório: sem ele os publishers do
electron-builder correm em paralelo e criam duas releases com a mesma tag, uma
com o `.exe` e outra só com o `.blockmap`, e o auto-update quebra.
