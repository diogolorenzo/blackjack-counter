import { useCallback, useEffect, useMemo, useState } from 'react'

import type { RiskResult } from '@shared/domain/risk'
import {
  formatCompact,
  formatDuration,
  formatMoney,
  formatRatio,
  formatSigned,
  formatUnits
} from '@shared/format'
import { systemProfile } from '@shared/domain/system'
import type { CurrencySettings, SessionState, Settings, ShoeRecord } from '@shared/types'

export interface HistoryPanelProps {
  settings: Settings
  session: SessionState
  /** Muda quando um shoe novo começa; serve de gatilho para recarregar o histórico. */
  shoeStartedAt: number
}

function Metric({
  label,
  value,
  hint,
  tone
}: {
  label: string
  value: string
  hint?: string
  tone?: 'pos' | 'neg' | 'warn'
}) {
  const toneClass =
    tone === 'pos' ? 'text-pos' : tone === 'neg' ? 'text-neg' : tone === 'warn' ? 'text-warn' : ''
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] text-muted">{label}</span>
        {hint !== undefined && <span className="text-[10px] text-muted/70">{hint}</span>}
      </div>
      <span className={`tnum shrink-0 text-[12px] ${toneClass}`}>{value}</span>
    </div>
  )
}

function riskTone(risk: number, target: number): 'pos' | 'warn' | 'neg' {
  if (risk <= target) return 'pos'
  if (risk <= target * 3) return 'warn'
  return 'neg'
}

function Distribution({ result }: { result: RiskResult }) {
  const peak = result.distribution.reduce((max, row) => Math.max(max, row.frequency), 0)
  if (peak <= 0) return null

  return (
    <div className="flex flex-col gap-1">
      <span className="ui-label">Frequência do true count</span>
      {result.distribution.map((row) => (
        <div key={row.count} className="flex items-center gap-2">
          <span className="tnum w-7 shrink-0 text-right text-[11px] text-muted">
            {formatSigned(row.count)}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full ${row.count >= 2 ? 'bg-pos' : 'bg-muted'}`}
              style={{ width: `${(row.frequency / peak) * 100}%` }}
            />
          </div>
          <span className="tnum w-14 shrink-0 text-right text-[11px] text-muted">
            {formatRatio(row.frequency)} · {formatUnits(row.units)}
          </span>
        </div>
      ))}
    </div>
  )
}

function ResultField({
  record,
  currency,
  onCommit
}: {
  record: ShoeRecord
  currency: CurrencySettings
  onCommit: (value: number | null) => void
}) {
  const [draft, setDraft] = useState(record.result === null ? '' : String(record.result))
  const [applied, setApplied] = useState(record.result)

  if (applied !== record.result) {
    setApplied(record.result)
    setDraft(record.result === null ? '' : String(record.result))
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed === '') {
      onCommit(null)
      return
    }
    const parsed = Number(trimmed.replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setDraft(record.result === null ? '' : String(record.result))
      return
    }
    onCommit(parsed)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      placeholder={formatMoney(0, currency)}
      aria-label="Resultado do shoe"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="tnum h-6 w-20 select-text rounded border border-border bg-bg px-1.5 text-right text-[11px] text-fg outline-none focus:border-muted"
    />
  )
}

/** Relógio que só existe enquanto há sessão aberta — sem sessão não há o que contar. */
function useElapsed(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (since === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [since])

  return since === null ? 0 : Math.max(0, now - since)
}

/**
 * Sessões e dimensionamento de banca.
 *
 * A sessão é explícita porque o histórico é o insumo de uma decisão de dinheiro:
 * se cada teste de tecla virasse registro, o resultado acumulado mediria o
 * tempo que o usuário passou mexendo no app, não o tempo que passou jogando.
 */
export function HistoryPanel({ settings, session, shoeStartedAt }: HistoryPanelProps) {
  const [records, setRecords] = useState<ShoeRecord[]>([])
  const [risk, setRisk] = useState<RiskResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const currency = settings.currency
  const profile = systemProfile(settings.shoe.system)
  const elapsed = useElapsed(session.active ? session.startedAt : null)

  useEffect(() => {
    let live = true
    window.counter
      .getHistory()
      .then((all) => {
        if (live) setRecords(all)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [shoeStartedAt, session.shoes, session.id])

  // A simulação depende só destes campos; refazer a cada carta seria desperdício.
  const riskSignature = JSON.stringify([
    settings.shoe.system,
    settings.shoe.deckCount,
    settings.shoe.penetration,
    settings.shoe.trueCountRounding,
    settings.betSpreads[settings.shoe.system],
    settings.unitValue,
    settings.bankroll
  ])

  const simulate = useCallback(() => {
    setSimulating(true)
    window.counter
      .simulateRisk()
      .then((result) => setRisk(result))
      .catch(() => setRisk(null))
      .finally(() => setSimulating(false))
  }, [])

  useEffect(() => {
    simulate()
  }, [riskSignature, simulate])

  const totals = useMemo(() => {
    let ms = 0
    let advantageMs = 0
    let cards = 0
    let result = 0
    let withResult = 0
    let offBalance = 0

    for (const record of records) {
      ms += Math.max(0, record.endedAt - record.startedAt)
      advantageMs += record.msAtAdvantage
      cards += record.cardsSeen
      if (record.result !== null) {
        result += record.result
        withResult++
      }
      if (record.closingRawCount !== 0) offBalance++
    }

    return { shoes: records.length, ms, advantageMs, cards, result, withResult, offBalance }
  }, [records])

  /** Agrupado por sessão: um resultado só significa alguma coisa dentro da sessão em que aconteceu. */
  const groups = useMemo(() => {
    const bySession = new Map<string, ShoeRecord[]>()
    for (const record of records) {
      const key = record.sessionId ?? 'sem-sessao'
      const list = bySession.get(key)
      if (list === undefined) bySession.set(key, [record])
      else list.push(record)
    }

    return [...bySession.entries()].map(([key, list]) => {
      const sorted = [...list].sort((a, b) => b.endedAt - a.endedAt)
      const first = sorted[sorted.length - 1]
      const last = sorted[0]
      const result = sorted.reduce((sum, item) => sum + (item.result ?? 0), 0)
      const hasResult = sorted.some((item) => item.result !== null)
      return {
        key,
        records: sorted,
        startedAt: first?.startedAt ?? 0,
        endedAt: last?.endedAt ?? 0,
        result,
        hasResult,
        live: key === session.id
      }
    })
  }, [records, session.id])

  const setResult = (id: string, value: number | null): void => {
    void window.counter.setShoeResult(id, value).then(setRecords)
  }

  const clearAll = (): void => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    setConfirmClear(false)
    void window.counter.clearHistory().then(setRecords)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5">
        <h2 className="ui-label">Sessão</h2>
        <div
          className={`flex flex-col gap-2 rounded-lg border p-3 ${
            session.active ? 'border-pos/40 bg-pos/5' : 'border-warn/40 bg-warn/5'
          }`}
        >
          {session.active ? (
            <>
              <Metric label="Em andamento" value={formatDuration(elapsed)} tone="pos" />
              <Metric label="Shoes nesta sessão" value={String(session.shoes)} />
              <button
                type="button"
                onClick={() => void window.counter.endSession()}
                className="h-8 rounded-md border border-border bg-surface text-[12px] transition-colors duration-100 hover:bg-fg/5"
              >
                Encerrar sessão
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-warn">
                Nenhuma sessão aberta. A contagem funciona normalmente, mas os shoes encerrados{' '}
                <b>não</b> entram no histórico — teste e configuração não viram estatística de
                banca.
              </p>
              <button
                type="button"
                onClick={() => void window.counter.startSession()}
                className="h-8 rounded-md border border-pos/40 bg-pos/10 text-[12px] text-pos transition-colors duration-100 hover:bg-pos/20"
              >
                Iniciar sessão
              </button>
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="ui-label">Banca e risco</h2>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          {risk === null ? (
            <p className="text-[11px] leading-snug text-muted">
              {simulating
                ? 'Simulando…'
                : `Sem modelo de vantagem para ${profile.label}. O dimensionamento de banca depende do edge por contagem, que só está publicado para Hi-Lo.`}
            </p>
          ) : (
            <>
              <Metric
                label="Aposta média"
                value={formatUnits(risk.averageBetUnits)}
                hint={`${formatRatio(risk.advantageShare)} das mãos com vantagem`}
              />
              <Metric
                label="EV por mão"
                value={formatMoney(risk.evPerHandMoney, currency)}
                tone={risk.evPerHandMoney > 0 ? 'pos' : 'neg'}
              />
              <Metric
                label="EV por hora"
                value={formatMoney(risk.evPerHourMoney, currency)}
                hint={`${settings.bankroll.handsPerHour} mãos/hora`}
                tone={risk.evPerHourMoney > 0 ? 'pos' : 'neg'}
              />
              <Metric
                label="Desvio padrão por hora"
                value={formatMoney(risk.sdPerHourMoney, currency)}
                hint="A oscilação normal de uma hora"
              />
              <Metric
                label="N0"
                value={`${formatCompact(risk.n0Hands)} mãos`}
                hint="Até o EV empatar com um desvio padrão"
              />

              <div className="border-t border-border pt-2">
                {settings.bankroll.amount <= 0 ? (
                  <p className="text-[11px] leading-snug text-muted">
                    Informe a banca em Ajustes para ver risco de ruína e unidade sugerida.
                  </p>
                ) : (
                  <>
                    <Metric
                      label="Risco de ruína"
                      value={risk.riskOfRuin === null ? '—' : formatRatio(risk.riskOfRuin)}
                      hint={`Banca de ${formatMoney(settings.bankroll.amount, currency)} a ${formatMoney(
                        settings.unitValue,
                        currency
                      )}/unidade`}
                      tone={
                        risk.riskOfRuin === null
                          ? undefined
                          : riskTone(risk.riskOfRuin, settings.bankroll.targetRiskOfRuin)
                      }
                    />
                    <Metric
                      label="Unidade sugerida"
                      value={
                        risk.suggestedUnitValue === null
                          ? '—'
                          : formatMoney(risk.suggestedUnitValue, currency)
                      }
                      hint={`Para ${formatRatio(settings.bankroll.targetRiskOfRuin, 0)} de risco alvo`}
                    />
                  </>
                )}
              </div>

              <div className="border-t border-border pt-2">
                <Distribution result={risk} />
              </div>

              <p className="text-[10px] leading-snug text-muted">
                Simulação de {formatCompact(risk.handsSimulated)} rodadas com a sua penetração e o
                seu spread. Usa `edge ≈ 0,5 × (TC − 1)` e variância 1,32 por unidade — serve para
                dimensionar banca, não para prever resultado.
              </p>

              <button
                type="button"
                onClick={simulate}
                disabled={simulating}
                className="h-7 rounded-md border border-border bg-bg text-[11px] text-muted transition-colors duration-100 hover:text-fg disabled:opacity-40"
              >
                {simulating ? 'Simulando…' : 'Recalcular'}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <h2 className="ui-label">Acumulado</h2>
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <Metric label="Shoes" value={String(totals.shoes)} />
          <Metric label="Tempo total" value={formatDuration(totals.ms)} />
          <Metric
            label="Tempo em vantagem"
            value={formatDuration(totals.advantageMs)}
            hint={totals.ms > 0 ? formatRatio(totals.advantageMs / totals.ms) : undefined}
          />
          <Metric
            label="Resultado informado"
            value={formatMoney(totals.result, currency)}
            hint={`${totals.withResult} de ${totals.shoes} shoes`}
            tone={totals.result > 0 ? 'pos' : totals.result < 0 ? 'neg' : undefined}
          />
          {profile.balanced && totals.shoes > 0 && (
            <Metric
              label="Shoes que não fecharam em 0"
              value={String(totals.offBalance)}
              hint="Contagem balanceada fecha em 0; sobrou carta perdida ou erro"
              tone={totals.offBalance === 0 ? 'pos' : 'warn'}
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="ui-label">Shoes</h2>
          {records.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className={`text-[10px] transition-colors duration-100 ${
                confirmClear ? 'text-neg' : 'text-muted hover:text-fg'
              }`}
            >
              {confirmClear ? 'Confirmar apagar tudo?' : 'Limpar'}
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface p-3 text-[11px] leading-snug text-muted">
            Nenhum shoe gravado. Com a sessão aberta, cada "Novo shoe" registra um aqui.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 border-b border-border pb-1">
                  <span className="text-[11px] text-muted">
                    {group.key === 'sem-sessao'
                      ? 'Sem sessão'
                      : new Date(group.startedAt).toLocaleString(currency.locale)}
                    {group.live && <span className="text-pos"> · em andamento</span>}
                  </span>
                  <span className="tnum text-[11px] text-muted">
                    {group.records.length} shoe{group.records.length === 1 ? '' : 's'}
                    {group.hasResult && ` · ${formatMoney(group.result, currency)}`}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5">
                  {group.records.map((record) => (
                    <li
                      key={record.id}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-2.5"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-muted">
                          {new Date(record.endedAt).toLocaleTimeString(currency.locale)}
                        </span>
                        <span className="tnum text-[11px] text-muted">
                          {formatDuration(record.endedAt - record.startedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="tnum text-muted">
                          {record.cardsSeen} cartas · pico {formatSigned(record.maxDecisionCount)} ·
                          vale {formatSigned(record.minDecisionCount)}
                        </span>
                        <ResultField
                          record={record}
                          currency={currency}
                          onCommit={(value) => setResult(record.id, value)}
                        />
                      </div>

                      {record.system === 'hilo' && record.closingRawCount !== 0 && (
                        <span className="text-[10px] leading-snug text-warn">
                          Fechou em {formatSigned(record.closingRawCount)} — um shoe contado inteiro
                          fecha em 0. Faltaram cartas ou houve erro.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
