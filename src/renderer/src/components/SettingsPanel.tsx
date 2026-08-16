import { useState } from 'react'
import type { ReactNode } from 'react'

import { ALLOWED_DECK_COUNTS, BINDING_PRESETS } from '@shared/defaults'
import type { DeepPartial } from '@shared/ipc'
import { HOTKEY_ACTIONS } from '@shared/types'
import type {
  BetSpreadRule,
  Corner,
  HotkeyAction,
  HotkeyStatus,
  OverlaySize,
  Settings,
  TrueCountRounding
} from '@shared/types'

import { BetSpreadEditor } from '@/components/BetSpreadEditor'
import { HotkeyRecorder } from '@/components/HotkeyRecorder'

export interface SettingsPanelProps {
  settings: Settings
  hotkeyStatus: Record<HotkeyAction, HotkeyStatus>
  onPatch: (patch: DeepPartial<Settings>) => void
}

interface Option<T> {
  value: T
  label: string
}

const DECK_OPTIONS: readonly Option<number>[] = ALLOWED_DECK_COUNTS.map((count) => ({
  value: count,
  label: String(count)
}))

const ROUNDING_OPTIONS: readonly Option<TrueCountRounding>[] = [
  { value: 'floor', label: 'Para baixo' },
  { value: 'nearest', label: 'Mais próximo' }
]

const SIZE_OPTIONS: readonly Option<OverlaySize>[] = [
  { value: 'small', label: 'P' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'G' }
]

const CORNER_OPTIONS: readonly Option<Corner>[] = [
  { value: 'top-left', label: 'Sup. esq.' },
  { value: 'top-right', label: 'Sup. dir.' },
  { value: 'bottom-left', label: 'Inf. esq.' },
  { value: 'bottom-right', label: 'Inf. dir.' }
]

const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  low: 'Carta baixa (2-6) · +1',
  neutral: 'Carta neutra (7-9) · 0',
  high: 'Carta alta (10-A) · −1',
  undo: 'Desfazer última carta'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="ui-label">{title}</h2>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
        {children}
      </div>
    </section>
  )
}

function Field({
  label,
  hint,
  stacked = false,
  children
}: {
  label: string
  hint?: string
  stacked?: boolean
  children: ReactNode
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px]">{label}</span>
          {hint !== undefined && <span className="tnum text-[11px] text-muted">{hint}</span>}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[12px]">{label}</span>
        {hint !== undefined && <span className="text-[10px] text-muted">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string | number>({
  value,
  options,
  onSelect
}: {
  value: T
  options: readonly Option<T>[]
  onSelect: (next: T) => void
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onSelect(option.value)}
          className={`min-w-[28px] px-2 py-1 text-[11px] transition-colors duration-100 ${
            option.value === value ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  checked,
  label,
  onChange
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full border transition-colors duration-100 ${
        checked ? 'border-pos/60 bg-pos/25' : 'border-border bg-bg'
      }`}
    >
      <span
        className={`absolute top-[2px] h-3.5 w-3.5 rounded-full transition-colors duration-100 ${
          checked ? 'left-[18px] bg-pos' : 'left-[2px] bg-muted'
        }`}
      />
    </button>
  )
}

function NumberField({
  value,
  min,
  step,
  onCommit
}: {
  value: number
  min: number
  step: number
  onCommit: (next: number) => void
}) {
  const [applied, setApplied] = useState(value)
  const [draft, setDraft] = useState(String(value))

  if (applied !== value) {
    setApplied(value)
    setDraft(String(value))
  }

  const commit = (): void => {
    const parsed = Number(draft.trim())
    // Valor inválido volta ao último aceito: o store descartaria em silêncio e o
    // campo ficaria mostrando algo que não está em vigor.
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(String(value))
      return
    }
    onCommit(parsed)
  }

  return (
    <input
      type="number"
      min={min}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="tnum h-6 w-20 select-text rounded border border-border bg-bg px-1.5 text-right text-[12px] text-fg outline-none focus:border-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  )
}

export function SettingsPanel({ settings, hotkeyStatus, onPatch }: SettingsPanelProps) {
  const { shoe, overlay } = settings

  // null = o usuário regravou alguma tecla individualmente e saiu dos perfis.
  const activePreset =
    BINDING_PRESETS.find((preset) =>
      HOTKEY_ACTIONS.every((action) => preset.bindings[action] === settings.bindings[action])
    )?.id ?? null

  const patchShoe = (patch: DeepPartial<Settings['shoe']>): void => onPatch({ shoe: patch })
  const patchOverlay = (patch: DeepPartial<Settings['overlay']>): void => onPatch({ overlay: patch })
  const setBetSpread = (rules: BetSpreadRule[]): void => onPatch({ betSpread: rules })

  return (
    <div className="flex flex-col gap-4">
      <Section title="Shoe">
        <Field label="Baralhos">
          <Segmented
            value={shoe.deckCount}
            options={DECK_OPTIONS}
            onSelect={(deckCount) => patchShoe({ deckCount })}
          />
        </Field>

        <Field
          label="Penetração"
          hint={`${Math.round(shoe.penetration * 100)}%`}
          stacked
        >
          <input
            type="range"
            min={0.5}
            max={0.95}
            step={0.01}
            value={shoe.penetration}
            aria-label="Penetração"
            onChange={(event) => patchShoe({ penetration: Number(event.target.value) })}
            className="w-full accent-fg"
          />
        </Field>

        <Field label="True count" hint="Arredondamento usado no bet spread">
          <Segmented
            value={shoe.trueCountRounding}
            options={ROUNDING_OPTIONS}
            onSelect={(trueCountRounding) => patchShoe({ trueCountRounding })}
          />
        </Field>
      </Section>

      <Section title="Aposta">
        <Field label="Valor da unidade" hint="R$ por unidade">
          <NumberField
            value={settings.unitValue}
            min={1}
            step={5}
            onCommit={(unitValue) => onPatch({ unitValue })}
          />
        </Field>

        <Field label="Mostrar em reais" hint="Em vez de unidades">
          <Toggle
            checked={overlay.showCurrency}
            label="Mostrar em reais"
            onChange={(showCurrency) => patchOverlay({ showCurrency })}
          />
        </Field>

        <div className="border-t border-border pt-3">
          <BetSpreadEditor rules={settings.betSpread} onChange={setBetSpread} />
        </div>
      </Section>

      <Section title="Overlay">
        <Field label="Tamanho">
          <Segmented
            value={overlay.size}
            options={SIZE_OPTIONS}
            onSelect={(size) => patchOverlay({ size })}
          />
        </Field>

        <Field
          label="Canto"
          hint={overlay.customPosition !== null ? 'Em posição arrastada' : undefined}
          stacked
        >
          <div className="grid grid-cols-2 gap-1.5">
            {CORNER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === overlay.corner && overlay.customPosition === null}
                // customPosition tem prioridade sobre o canto: escolher um canto
                // sem limpá-la calcularia a posição e a ignoraria em seguida.
                onClick={() =>
                  patchOverlay({ corner: option.value, customPosition: null })
                }
                className={`h-7 rounded-md border text-[11px] transition-colors duration-100 ${
                  option.value === overlay.corner && overlay.customPosition === null
                    ? 'border-muted bg-fg/10 text-fg'
                    : 'border-border bg-bg text-muted hover:text-fg'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Travar (click-through)" hint="Destravado permite arrastar">
          <Toggle
            checked={overlay.locked}
            label="Travar overlay"
            onChange={(locked) => patchOverlay({ locked })}
          />
        </Field>

        <Field
          label="Histórico"
          hint={`${overlay.historyLength} cartas`}
          stacked
        >
          <input
            type="range"
            min={4}
            max={16}
            step={1}
            value={overlay.historyLength}
            aria-label="Tamanho do histórico"
            onChange={(event) =>
              patchOverlay({ historyLength: Number(event.target.value) })
            }
            className="w-full accent-fg"
          />
        </Field>
      </Section>

      <Section title="Atalhos globais">
        <Field label="Ativos" hint="Funcionam com o jogo em foco">
          <Toggle
            checked={settings.hotkeysEnabled}
            label="Atalhos globais ativos"
            onChange={(hotkeysEnabled) => onPatch({ hotkeysEnabled })}
          />
        </Field>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="ui-label">Perfil</span>
          <div className="flex gap-1.5">
            {BINDING_PRESETS.map((preset) => {
              const active = preset.id === activePreset
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPatch({ bindings: { ...preset.bindings } })}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors duration-100 ${
                    active
                      ? 'border-pos/50 bg-pos/10 text-pos'
                      : 'border-border text-muted hover:text-fg'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
          <span className="min-h-[26px] text-[10px] leading-tight text-muted">
            {activePreset === null
              ? 'Perfil personalizado — as teclas abaixo foram alteradas uma a uma.'
              : BINDING_PRESETS.find((preset) => preset.id === activePreset)?.hint}
          </span>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          {HOTKEY_ACTIONS.map((action) => (
            <HotkeyRecorder
              key={action}
              action={action}
              label={HOTKEY_LABELS[action]}
              accelerator={settings.bindings[action]}
              status={hotkeyStatus[action]}
            />
          ))}
        </div>

        <p className="text-[10px] leading-snug text-muted">
          Prefira as teclas de operador do numpad (+ − × ÷): os dígitos do numpad só disparam com o
          NumLock ligado.
        </p>
      </Section>
    </div>
  )
}
