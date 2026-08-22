import { useState } from 'react'
import type { ReactNode } from 'react'

import { ALLOWED_DECK_COUNTS, BINDING_PRESETS, CURRENCY_PRESETS } from '@shared/defaults'
import { systemProfile } from '@shared/domain/system'
import type { DeepPartial } from '@shared/ipc'
import { HOTKEY_ACTIONS, isOptionalHotkeyAction } from '@shared/types'
import type {
  BetSpreadRule,
  BindingProfile,
  Corner,
  CountingSystem,
  DeviationsLayout,
  HotkeyAction,
  HotkeyStatus,
  OverlayLayout,
  OverlaySize,
  Palette,
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

const SYSTEM_OPTIONS: readonly Option<CountingSystem>[] = [
  { value: 'hilo', label: 'Hi-Lo' },
  { value: 'ko', label: 'KO' }
]

const ROUNDING_OPTIONS: readonly Option<TrueCountRounding>[] = [
  { value: 'floor', label: 'Para baixo' },
  { value: 'nearest', label: 'Mais próximo' }
]

const SIZE_OPTIONS: readonly Option<OverlaySize>[] = [
  { value: 'small', label: 'P' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'G' }
]

const LAYOUT_OPTIONS: readonly Option<OverlayLayout>[] = [
  { value: 'full', label: 'Completo' },
  { value: 'minimal', label: 'Mínimo' }
]

const PALETTE_OPTIONS: readonly Option<Palette>[] = [
  { value: 'default', label: 'Padrão' },
  { value: 'colorblind', label: 'Daltonismo' }
]

const DEVIATIONS_LAYOUT_OPTIONS: readonly Option<DeviationsLayout>[] = [
  { value: 'list', label: 'Lista' },
  { value: 'matrix', label: 'Mão × dealer' }
]

const CORNER_OPTIONS: readonly Option<Corner>[] = [
  { value: 'top-left', label: 'Sup. esq.' },
  { value: 'top-right', label: 'Sup. dir.' },
  { value: 'bottom-left', label: 'Inf. esq.' },
  { value: 'bottom-right', label: 'Inf. dir.' }
]

const RISK_OPTIONS: readonly Option<number>[] = [
  { value: 0.01, label: '1%' },
  { value: 0.05, label: '5%' },
  { value: 0.135, label: '13,5%' }
]

const HOTKEY_LABELS: Record<HotkeyAction, string> = {
  low: 'Carta baixa · +1',
  neutral: 'Carta neutra · 0',
  high: 'Carta alta · −1',
  undo: 'Desfazer última carta',
  redo: 'Refazer',
  newShoe: 'Novo shoe',
  toggleOverlay: 'Mostrar/esconder overlay'
}

const CORE_ACTIONS = HOTKEY_ACTIONS.filter((action) => !isOptionalHotkeyAction(action))
const OPTIONAL_ACTIONS = HOTKEY_ACTIONS.filter(isOptionalHotkeyAction)

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

/**
 * Slot de teclas salvo pelo usuário.
 *
 * Salvar sobrescreve sem perguntar: são três slots nomeados e visíveis, e o
 * estado de cada um está na tela — pedir confirmação para um botão cujo efeito
 * já está descrito ao lado só atrapalha.
 */
function BindingProfileSlot({
  profile,
  current,
  onRename,
  onSave,
  onLoad
}: {
  profile: BindingProfile
  current: Record<HotkeyAction, string>
  onRename: (name: string) => void
  onSave: () => void
  onLoad: () => void
}) {
  const [draft, setDraft] = useState(profile.name)
  const [applied, setApplied] = useState(profile.name)

  if (applied !== profile.name) {
    setApplied(profile.name)
    setDraft(profile.name)
  }

  const saved = profile.bindings
  const inUse =
    saved !== null && HOTKEY_ACTIONS.every((action) => saved[action] === current[action])

  const preview =
    saved === null
      ? 'vazio'
      : CORE_ACTIONS.map((action) => saved[action])
          .filter((accelerator) => accelerator !== '')
          .join(' · ')

  const commitName = (): void => {
    const next = draft.trim()
    if (next === '') {
      setDraft(profile.name)
      return
    }
    if (next !== profile.name) onRename(next)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg p-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          maxLength={24}
          aria-label={`Nome do ${profile.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="h-6 min-w-0 flex-1 select-text rounded border border-transparent bg-transparent px-1 text-[12px] text-fg outline-none hover:border-border focus:border-muted"
        />

        <button
          type="button"
          onClick={onSave}
          title="Guardar as teclas atuais neste perfil"
          className="h-6 shrink-0 rounded border border-border px-2 text-[11px] text-muted transition-colors duration-100 hover:text-fg"
        >
          Salvar
        </button>

        <button
          type="button"
          onClick={onLoad}
          disabled={saved === null || inUse}
          title={saved === null ? 'Perfil vazio' : 'Aplicar as teclas deste perfil'}
          className={`h-6 shrink-0 rounded border px-2 text-[11px] transition-colors duration-100 disabled:opacity-30 ${
            inUse
              ? 'border-pos/50 bg-pos/10 text-pos'
              : 'border-border text-muted hover:text-fg'
          }`}
        >
          {inUse ? 'Em uso' : 'Usar'}
        </button>
      </div>

      <span className="truncate text-[10px] text-muted">{preview}</span>
    </div>
  )
}

export function SettingsPanel({ settings, hotkeyStatus, onPatch }: SettingsPanelProps) {
  const { shoe, overlay, bankroll, feedback, currency } = settings
  const profile = systemProfile(shoe.system)

  // null = o usuário regravou alguma tecla individualmente e saiu dos perfis.
  // A comparação é só sobre as teclas que o perfil define; as opcionais são
  // escolha independente.
  const activePreset =
    BINDING_PRESETS.find((preset) =>
      Object.entries(preset.bindings).every(
        ([action, accelerator]) => settings.bindings[action as HotkeyAction] === accelerator
      )
    )?.id ?? null

  const patchShoe = (patch: DeepPartial<Settings['shoe']>): void => onPatch({ shoe: patch })
  const patchOverlay = (patch: DeepPartial<Settings['overlay']>): void => onPatch({ overlay: patch })
  const patchBankroll = (patch: DeepPartial<Settings['bankroll']>): void =>
    onPatch({ bankroll: patch })
  const patchFeedback = (patch: DeepPartial<Settings['feedback']>): void =>
    onPatch({ feedback: patch })

  const setBetSpread = (rules: BetSpreadRule[]): void => {
    onPatch({ betSpreads: { ...settings.betSpreads, [shoe.system]: rules } })
  }

  const patchProfile = (id: string, patch: Partial<BindingProfile>): void => {
    onPatch({
      bindingProfiles: settings.bindingProfiles.map((slot) =>
        slot.id === id ? { ...slot, ...patch } : slot
      )
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Section title="Sistema">
        <Field label="Contagem" hint={profile.balanced ? 'Balanceado' : 'Desbalanceado (IRC)'}>
          <Segmented
            value={shoe.system}
            options={SYSTEM_OPTIONS}
            onSelect={(system) => patchShoe({ system })}
          />
        </Field>
        <p className="text-[10px] leading-snug text-muted">
          {shoe.system === 'hilo'
            ? 'Hi-Lo: 2-6 valem +1, 7-9 valem 0, 10-A valem −1. O true count divide o running count pelos baralhos restantes.'
            : 'KO: o 7 vale +1, então a contagem não fecha em zero e não se divide por baralhos. O running count começa no IRC e o pivô fica sempre em +4. Os desvios do Illustrious 18 não valem nesta escala.'}
        </p>
      </Section>

      <Section title="Shoe">
        <Field label="Baralhos">
          <Segmented
            value={shoe.deckCount}
            options={DECK_OPTIONS}
            onSelect={(deckCount) => patchShoe({ deckCount })}
          />
        </Field>

        <Field label="Penetração" hint={`${Math.round(shoe.penetration * 100)}%`} stacked>
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

        <Field label="Rendição tardia" hint="A mesa aceita render metade da aposta?">
          <Toggle
            checked={shoe.surrender}
            label="Rendição tardia"
            onChange={(surrender) => patchShoe({ surrender })}
          />
        </Field>

        {profile.balanced && (
          <Field label="True count" hint="Arredondamento usado no bet spread">
            <Segmented
              value={shoe.trueCountRounding}
              options={ROUNDING_OPTIONS}
              onSelect={(trueCountRounding) => patchShoe({ trueCountRounding })}
            />
          </Field>
        )}
      </Section>

      <Section title="Aposta">
        <Field label="Valor da unidade" hint={`${currency.code} por unidade`}>
          <NumberField
            value={settings.unitValue}
            min={1}
            step={5}
            onCommit={(unitValue) => onPatch({ unitValue })}
          />
        </Field>

        <Field label="Moeda">
          <Segmented
            value={currency.code}
            options={CURRENCY_PRESETS.map((preset) => ({
              value: preset.code,
              label: preset.label
            }))}
            onSelect={(code) => {
              const preset = CURRENCY_PRESETS.find((item) => item.code === code)
              if (preset !== undefined) onPatch({ currency: { code, locale: preset.locale } })
            }}
          />
        </Field>

        <Field label="Mostrar em moeda" hint="Em vez de unidades">
          <Toggle
            checked={overlay.showCurrency}
            label="Mostrar em moeda"
            onChange={(showCurrency) => patchOverlay({ showCurrency })}
          />
        </Field>

        <div className="border-t border-border pt-3">
          <BetSpreadEditor
            rules={settings.betSpreads[shoe.system]}
            countLabel={profile.countLabel}
            onChange={setBetSpread}
          />
        </div>
      </Section>

      <Section title="Banca">
        <Field label="Banca total" hint="0 esconde o risco de ruína">
          <NumberField
            value={bankroll.amount}
            min={0}
            step={500}
            onCommit={(amount) => patchBankroll({ amount })}
          />
        </Field>

        <Field label="Mãos por hora" hint="Converte EV por mão em EV por hora">
          <NumberField
            value={bankroll.handsPerHour}
            min={10}
            step={10}
            onCommit={(handsPerHour) => patchBankroll({ handsPerHour })}
          />
        </Field>

        <Field label="Risco de ruína alvo" hint="Base da unidade sugerida">
          <Segmented
            value={bankroll.targetRiskOfRuin}
            options={RISK_OPTIONS}
            onSelect={(targetRiskOfRuin) => patchBankroll({ targetRiskOfRuin })}
          />
        </Field>
      </Section>

      <Section title="Confirmação de tecla">
        <Field label="Som" hint="Tom diferente por bucket">
          <Toggle
            checked={feedback.sound}
            label="Som ao registrar carta"
            onChange={(sound) => patchFeedback({ sound })}
          />
        </Field>

        {feedback.sound && (
          <Field label="Volume" hint={`${Math.round(feedback.volume * 100)}%`} stacked>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={feedback.volume}
              aria-label="Volume"
              onChange={(event) => patchFeedback({ volume: Number(event.target.value) })}
              className="w-full accent-fg"
            />
          </Field>
        )}

        <Field label="Pulso visual" hint="Piscada curta na borda">
          <Toggle
            checked={feedback.flash}
            label="Pulso ao registrar carta"
            onChange={(flash) => patchFeedback({ flash })}
          />
        </Field>

        <Field label="Som no treino" hint="Acerto, erro e ritmo das cartas">
          <Toggle
            checked={feedback.drillSound}
            label="Som no modo de treino"
            onChange={(drillSound) => patchFeedback({ drillSound })}
          />
        </Field>

        <p className="text-[10px] leading-snug text-muted">
          Com o jogo em foco, isto é a única prova de que a tecla chegou. Uma tecla perdida corrompe
          o shoe inteiro sem nenhum outro sinal.
        </p>
      </Section>

      <Section title="Overlay">
        <Field label="Tamanho">
          <Segmented
            value={overlay.size}
            options={SIZE_OPTIONS}
            onSelect={(size) => patchOverlay({ size })}
          />
        </Field>

        <Field label="Layout" hint="Mínimo mostra só count e aposta">
          <Segmented
            value={overlay.layout}
            options={LAYOUT_OPTIONS}
            onSelect={(layout) => patchOverlay({ layout })}
          />
        </Field>

        <Field label="Opacidade" hint={`${Math.round(overlay.opacity * 100)}%`} stacked>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.02}
            value={overlay.opacity}
            aria-label="Opacidade do overlay"
            onChange={(event) => patchOverlay({ opacity: Number(event.target.value) })}
            className="w-full accent-fg"
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
                onClick={() => patchOverlay({ corner: option.value, customPosition: null })}
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

        <Field label="Histórico" hint={`${overlay.historyLength} cartas`} stacked>
          <input
            type="range"
            min={4}
            max={16}
            step={1}
            value={overlay.historyLength}
            aria-label="Tamanho do histórico"
            onChange={(event) => patchOverlay({ historyLength: Number(event.target.value) })}
            className="w-full accent-fg"
          />
        </Field>
      </Section>

      <Section title="Desvios">
        <Field label="Layout" hint="Como a aba Desvios se apresenta" stacked>
          <Segmented
            value={settings.deviationsLayout}
            options={DEVIATIONS_LAYOUT_OPTIONS}
            onSelect={(deviationsLayout) => onPatch({ deviationsLayout })}
          />
        </Field>
        <p className="text-[10px] leading-snug text-muted">
          A lista mostra só as exceções e quais estão valendo. A matriz é o chart completo: acha a
          mão na esquerda e a carta do dealer em cima, e a célula diz o que fazer no count atual.
        </p>
      </Section>

      <Section title="Aparência">
        <Field label="Paleta" hint="Daltonismo troca verde/vermelho por azul/laranja">
          <Segmented
            value={settings.palette}
            options={PALETTE_OPTIONS}
            onSelect={(palette) => onPatch({ palette })}
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
          {CORE_ACTIONS.map((action) => (
            <HotkeyRecorder
              key={action}
              action={action}
              label={HOTKEY_LABELS[action]}
              accelerator={settings.bindings[action]}
              status={hotkeyStatus[action]}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          <span className="ui-label">Opcionais</span>
          {OPTIONAL_ACTIONS.map((action) => (
            <HotkeyRecorder
              key={action}
              action={action}
              label={HOTKEY_LABELS[action]}
              accelerator={settings.bindings[action]}
              status={hotkeyStatus[action]}
              optional
            />
          ))}
          <p className="text-[10px] leading-snug text-muted">
            Nascem sem tecla: cada atalho global toma a tecla do sistema inteiro. "Novo shoe" e
            "overlay" são os que mais poupam alt-tab no meio da mesa.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="ui-label">Meus perfis</span>
          {settings.bindingProfiles.map((slot) => (
            <BindingProfileSlot
              key={slot.id}
              profile={slot}
              current={settings.bindings}
              onRename={(name) => patchProfile(slot.id, { name })}
              onSave={() => patchProfile(slot.id, { bindings: { ...settings.bindings } })}
              onLoad={() => {
                if (slot.bindings !== null) onPatch({ bindings: { ...slot.bindings } })
              }}
            />
          ))}
          <p className="text-[10px] leading-snug text-muted">
            Guardam o jogo de teclas inteiro, incluindo as opcionais. Úteis para alternar entre
            teclado com e sem numpad, ou entre o notebook e a mesa de casa.
          </p>
        </div>

        <p className="text-[10px] leading-snug text-muted">
          Prefira as teclas de operador do numpad (+ − × ÷): os dígitos do numpad só disparam com o
          NumLock ligado.
        </p>
      </Section>
    </div>
  )
}
