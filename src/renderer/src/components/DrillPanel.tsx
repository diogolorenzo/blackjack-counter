import { useCallback, useEffect, useRef, useState } from 'react'

import { DEFAULT_DRILL_SPEED, DRILL_CARD_FLASH_MS, DRILL_SPEEDS } from '@shared/defaults'
import { buildDrillDeck, summarizeDrill, summarizeMentalDrill } from '@shared/domain/drill'
import type { DrillAnswer, DrillCard, DrillSummary, MentalSummary } from '@shared/domain/drill'
import { bucketRankLabel } from '@shared/domain/system'
import { formatRatio, formatSigned } from '@shared/format'
import type { Bucket, CountingSystem, FeedbackSettings, HotkeyAction } from '@shared/types'

import { playCardFlip, playCorrect, playFinish, playMiss, playWrong } from '@/audio'
import { toAccelerator } from '@/components/HotkeyRecorder'

export interface DrillPanelProps {
  system: CountingSystem
  bindings: Record<HotkeyAction, string>
  feedback: FeedbackSettings
}

type Phase = 'idle' | 'running' | 'answer' | 'done'

/**
 * `manual` e `speed` treinam a classificação carta a carta. `mental` treina o
 * que a mesa realmente cobra: carregar um número na cabeça enquanto as cartas
 * passam, sem tecla nenhuma e sem correção no meio do caminho.
 */
type Mode = 'manual' | 'speed' | 'mental'

const MODE_OPTIONS: readonly { value: Mode; label: string; hint: string }[] = [
  {
    value: 'manual',
    label: 'No seu ritmo',
    hint: 'A carta troca quando você responde. Bom para fixar quais cartas são de cada bucket.'
  },
  {
    value: 'speed',
    label: 'Velocidade',
    hint: 'A carta troca sozinha; não responder conta como erro. Treina acompanhar o dealer.'
  },
  {
    value: 'mental',
    label: 'Contagem mental',
    hint: 'Sem teclas: você só olha e conta de cabeça. No fim o app pergunta o running count — é o cenário da mesa.'
  }
]

const DRILL_DECKS = [1, 2] as const

const BUCKET_BY_ACTION: Partial<Record<HotkeyAction, Bucket>> = {
  low: 'low',
  neutral: 'neutral',
  high: 'high'
}

const BUCKETS: readonly Bucket[] = ['low', 'neutral', 'high']

function accuracyTone(accuracy: number): string {
  if (accuracy >= 0.98) return 'text-pos'
  if (accuracy >= 0.9) return 'text-warn'
  return 'text-neg'
}

/**
 * Modo de treino.
 *
 * O app é o único que sabe a carta aqui — no jogo é o contrário — e é isso que
 * permite medir ACERTO, não só velocidade. Contar rápido e errado é o modo de
 * falha que custa dinheiro; um cronômetro sozinho não pega.
 *
 * Enquanto o treino roda, os atalhos globais são liberados (`setCaptureMode`):
 * sem isso cada tecla do treino também entraria na contagem real e corromperia
 * o shoe em andamento.
 */
export function DrillPanel({ system, bindings, feedback }: DrillPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [mode, setMode] = useState<Mode>('manual')
  const [speed, setSpeed] = useState<number>(DEFAULT_DRILL_SPEED)
  const [decks, setDecks] = useState<number>(1)
  const [summary, setSummary] = useState<DrillSummary | null>(null)
  const [mental, setMental] = useState<MentalSummary | null>(null)
  const [mentalAnswer, setMentalAnswer] = useState('')
  const [position, setPosition] = useState(0)

  const deckRef = useRef<DrillCard[]>([])
  const answersRef = useRef<DrillAnswer[]>([])
  const positionRef = useRef(0)
  const answeredRef = useRef(false)
  const startedAtRef = useRef(0)
  const shownAtRef = useRef(0)
  const elapsedRef = useRef(0)
  /**
   * Quantas cartas o usuário VIU, que não é o índice atual.
   *
   * Parando no meio, a carta na tela já foi vista e conta; chegando ao fim do
   * baralho, o índice já passou da última e não pode contar duas vezes. Sem
   * separar os dois casos, o modo mental cobraria uma carta a mais ou a menos
   * do que mostrou.
   */
  const shownRef = useRef(0)

  const soundOn = feedback.drillSound
  const volume = feedback.volume
  const intervalMs = Math.max(150, 60000 / speed)

  const release = useCallback(() => {
    void window.counter.setCaptureMode(false)
  }, [])

  const finish = useCallback(() => {
    elapsedRef.current = performance.now() - startedAtRef.current
    shownRef.current = Math.min(deckRef.current.length, positionRef.current + 1)

    // No modo mental o treino não acaba aqui: acaba quando o usuário disser o
    // número que carregou. Sem essa etapa não haveria nada para medir.
    if (mode === 'mental') {
      setPhase('answer')
      release()
      return
    }

    setSummary(summarizeDrill(deckRef.current, answersRef.current, elapsedRef.current))
    setPhase('done')
    if (soundOn) playFinish(volume)
    release()
  }, [mode, release, soundOn, volume])

  const advance = useCallback(
    (missed: boolean) => {
      const index = positionRef.current
      const card = deckRef.current[index]
      if (card === undefined) {
        finish()
        return
      }

      if (mode !== 'mental' && missed && !answeredRef.current) {
        answersRef.current.push({ index, chosen: null, expected: card.bucket, ms: null })
        if (soundOn) playMiss(volume)
      }

      const next = index + 1
      positionRef.current = next
      answeredRef.current = false
      shownAtRef.current = performance.now()
      setPosition(next)

      if (next >= deckRef.current.length) {
        finish()
        return
      }
      shownRef.current = next + 1
      // No mental não existe som de acerto/erro para marcar a passagem; a
      // batida faz esse papel e ainda dá o ritmo da contagem.
      if (mode === 'mental' && soundOn) playCardFlip(volume)
    },
    [finish, mode, soundOn, volume]
  )

  const answer = useCallback(
    (bucket: Bucket) => {
      if (mode === 'mental' || answeredRef.current) return
      const index = positionRef.current
      const card = deckRef.current[index]
      if (card === undefined) return

      answeredRef.current = true
      const correct = bucket === card.bucket
      answersRef.current.push({
        index,
        chosen: bucket,
        expected: card.bucket,
        ms: performance.now() - shownAtRef.current
      })

      if (soundOn) {
        if (correct) playCorrect(volume)
        else playWrong(volume)
      }

      // No modo velocidade quem manda no relógio é o intervalo: avançar aqui
      // faria o ritmo depender do jogador, que é justamente o que se quer medir.
      if (mode === 'manual') advance(false)
    },
    [advance, mode, soundOn, volume]
  )

  const start = useCallback(() => {
    // A semente vem do relógio: sequência nova a cada treino, mas o domínio
    // continua puro e testável com semente fixa.
    deckRef.current = buildDrillDeck(system, decks, Date.now() >>> 0)
    answersRef.current = []
    positionRef.current = 0
    answeredRef.current = false
    startedAtRef.current = performance.now()
    shownAtRef.current = startedAtRef.current
    elapsedRef.current = 0
    shownRef.current = 1
    setPosition(0)
    setSummary(null)
    setMental(null)
    setMentalAnswer('')
    setPhase('running')
    void window.counter.setCaptureMode(true)
    // A primeira carta também merece a batida: sem ela o ritmo do modo mental
    // só começa a existir na segunda.
    if (mode === 'mental' && soundOn) playCardFlip(volume)
  }, [decks, mode, soundOn, system, volume])

  const stop = useCallback(() => {
    finish()
  }, [finish])

  const confirmMental = useCallback(() => {
    const parsed = Number(mentalAnswer.trim().replace(',', '.'))
    if (!Number.isFinite(parsed)) return

    const result = summarizeMentalDrill(
      deckRef.current,
      shownRef.current,
      parsed,
      elapsedRef.current
    )
    setMental(result)
    setPhase('done')
    if (soundOn) {
      if (result.correct) playFinish(volume)
      else playWrong(volume)
    }
  }, [mentalAnswer, soundOn, volume])

  // Atalhos globais soltos enquanto o treino roda; devolvidos ao sair da aba,
  // inclusive por recarregamento do renderer.
  useEffect(() => {
    if (phase !== 'running') return
    window.addEventListener('beforeunload', release)
    return () => {
      window.removeEventListener('beforeunload', release)
      release()
    }
  }, [phase, release])

  useEffect(() => {
    if (phase !== 'running') return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code === 'Escape') {
        event.preventDefault()
        stop()
        return
      }
      if (mode === 'mental') return

      const accelerator = toAccelerator(event)
      if (accelerator === null) return

      const normalized = accelerator.toLowerCase()
      for (const [action, bucket] of Object.entries(BUCKET_BY_ACTION)) {
        const bind = bindings[action as HotkeyAction]
        if (bind !== '' && bind.toLowerCase() === normalized && bucket !== undefined) {
          event.preventDefault()
          answer(bucket)
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [phase, mode, bindings, answer, stop])

  useEffect(() => {
    if (phase !== 'running') return
    if (mode === 'manual') return
    const interval = window.setInterval(() => advance(true), intervalMs)
    return () => window.clearInterval(interval)
  }, [phase, mode, intervalMs, advance])

  const deck = deckRef.current
  const card = phase === 'running' ? deck[position] : undefined
  const markMs = mode === 'manual' ? DRILL_CARD_FLASH_MS : intervalMs

  return (
    <div className="flex flex-col gap-3">
      {phase === 'idle' && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex flex-col gap-1.5">
              <span className="ui-label">Modo</span>
              <div className="grid grid-cols-3 gap-1">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={`rounded-md border px-1 py-1.5 text-[11px] leading-tight transition-colors duration-100 ${
                      mode === option.value
                        ? 'border-pos/50 bg-pos/10 text-pos'
                        : 'border-border text-muted hover:text-fg'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <span className="min-h-[26px] text-[10px] leading-tight text-muted">
                {MODE_OPTIONS.find((option) => option.value === mode)?.hint}
              </span>
            </div>

            {mode !== 'manual' && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-[12px]">Cartas por minuto</span>
                <div className="flex overflow-hidden rounded-md border border-border">
                  {DRILL_SPEEDS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={speed === option}
                      onClick={() => setSpeed(option)}
                      className={`tnum px-2 py-1 text-[11px] transition-colors duration-100 ${
                        speed === option ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-[12px]">Baralhos</span>
              <div className="flex overflow-hidden rounded-md border border-border">
                {DRILL_DECKS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={decks === option}
                    onClick={() => setDecks(option)}
                    className={`tnum min-w-[28px] px-2 py-1 text-[11px] transition-colors duration-100 ${
                      decks === option ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={start}
            className="h-9 rounded-md border border-pos/40 bg-pos/10 text-[12px] text-pos transition-colors duration-100 hover:bg-pos/20"
          >
            Começar
          </button>

          <p className="text-[10px] leading-snug text-muted">
            {mode === 'mental'
              ? 'Não aperte nada: só acompanhe as cartas e some de cabeça. Esc encerra e o app pergunta o número.'
              : 'Use as mesmas teclas da contagem. Esc encerra.'}{' '}
            Os atalhos globais ficam suspensos durante o treino, então nada aqui entra no shoe de
            verdade.
          </p>

          {!soundOn && (
            <p className="text-[10px] leading-snug text-muted">
              O som do treino está desligado em Ajustes → Confirmação de tecla.
            </p>
          )}
        </>
      )}

      {phase === 'running' && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="ui-label">
              {position + 1} / {deck.length}
            </span>
            <button
              type="button"
              onClick={stop}
              className="rounded border border-border px-2 py-1 text-[11px] text-muted transition-colors duration-100 hover:text-fg"
            >
              {mode === 'mental' ? 'Parar e conferir' : 'Encerrar'}
            </button>
          </div>

          <div
            className={`relative flex h-[132px] items-center justify-center overflow-hidden rounded-lg border border-border ${
              // Fundo alternado por carta: garante mudança visível mesmo quando o
              // rank repete e a animação passa despercebida.
              position % 2 === 0 ? 'bg-surface' : 'bg-fg/[0.06]'
            }`}
          >
            <span
              key={position}
              aria-hidden="true"
              style={{ ['--card-mark-ms' as string]: `${Math.round(markMs)}ms` }}
              className="counter-card-mark absolute inset-x-0 top-0 h-[3px] bg-pos"
            />
            <span
              key={`card-${position}`}
              className="counter-card-in tnum text-[64px] font-semibold leading-none tracking-tight"
            >
              {card?.rank ?? '—'}
            </span>
          </div>

          {mode === 'mental' ? (
            <p className="text-[11px] leading-snug text-muted">
              Conte de cabeça. O app pergunta o running count quando terminar.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {BUCKETS.map((bucket) => (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => answer(bucket)}
                  className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-surface text-[12px] transition-colors duration-100 hover:bg-fg/5"
                >
                  <span className="tnum font-semibold leading-none">
                    {bucketRankLabel(system, bucket)}
                  </span>
                  <span className="tnum text-[10px] leading-none opacity-70">
                    {bindings[bucket] === '' ? '—' : bindings[bucket]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {phase === 'answer' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <span className="ui-label">Running count</span>
            <p className="text-[11px] leading-snug text-muted">
              Quanto deu depois de {shownRef.current} cartas?
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={mentalAnswer}
              aria-label="Running count contado"
              onChange={(event) => setMentalAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmMental()
              }}
              className="tnum h-10 w-full select-text rounded border border-border bg-bg px-2 text-center text-[24px] text-fg outline-none focus:border-muted"
            />
          </div>

          <button
            type="button"
            onClick={confirmMental}
            disabled={mentalAnswer.trim() === ''}
            className="h-9 rounded-md border border-pos/40 bg-pos/10 text-[12px] text-pos transition-colors duration-100 hover:bg-pos/20 disabled:opacity-30"
          >
            Conferir
          </button>
        </div>
      )}

      {phase === 'done' && mental !== null && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="ui-label">Resultado</span>
              <span
                className={`text-[20px] font-semibold leading-none ${
                  mental.correct ? 'text-pos' : 'text-neg'
                }`}
              >
                {mental.correct ? 'Certo' : `Errou por ${formatSigned(mental.error)}`}
              </span>
            </div>

            <dl className="flex flex-col gap-1 border-t border-border pt-2 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Você contou</dt>
                <dd className="tnum">{formatSigned(mental.answeredRunningCount)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Correto</dt>
                <dd className="tnum">{formatSigned(mental.expectedRunningCount)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Cartas</dt>
                <dd className="tnum">{mental.cards}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Ritmo</dt>
                <dd className="tnum">{Math.round(mental.cardsPerMinute)} cartas/min</dd>
              </div>
            </dl>

            {!mental.correct && (
              <p className="text-[10px] leading-snug text-muted">
                {mental.error > 0
                  ? 'Contou alto demais: sobrou carta baixa somada ou faltou carta alta subtraída.'
                  : 'Contou baixo demais: faltou somar carta baixa ou sobrou carta alta.'}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={start}
            className="h-9 rounded-md border border-border bg-surface text-[12px] transition-colors duration-100 hover:bg-fg/5"
          >
            De novo
          </button>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="h-8 rounded-md border border-border text-[11px] text-muted transition-colors duration-100 hover:text-fg"
          >
            Mudar configuração
          </button>
        </>
      )}

      {phase === 'done' && summary !== null && (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="ui-label">Precisão</span>
              <span className={`tnum text-[26px] font-semibold leading-none ${accuracyTone(summary.accuracy)}`}>
                {formatRatio(summary.accuracy)}
              </span>
            </div>

            <dl className="flex flex-col gap-1 border-t border-border pt-2 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Cartas</dt>
                <dd className="tnum">{summary.cards}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Erros</dt>
                <dd className="tnum">{summary.wrong}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Não respondidas</dt>
                <dd className="tnum">{summary.missed}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Ritmo</dt>
                <dd className="tnum">{Math.round(summary.cardsPerMinute)} cartas/min</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Tempo médio</dt>
                <dd className="tnum">{Math.round(summary.averageMs)} ms</dd>
              </div>
            </dl>

            <div className="flex justify-between gap-2 border-t border-border pt-2 text-[12px]">
              <span className="text-muted">Running count</span>
              <span className="tnum">
                <span
                  className={
                    summary.answeredRunningCount === summary.expectedRunningCount
                      ? 'text-pos'
                      : 'text-neg'
                  }
                >
                  {formatSigned(summary.answeredRunningCount)}
                </span>
                <span className="text-muted"> / {formatSigned(summary.expectedRunningCount)}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={start}
            className="h-9 rounded-md border border-border bg-surface text-[12px] transition-colors duration-100 hover:bg-fg/5"
          >
            De novo
          </button>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="h-8 rounded-md border border-border text-[11px] text-muted transition-colors duration-100 hover:text-fg"
          >
            Mudar configuração
          </button>
        </>
      )}
    </div>
  )
}
