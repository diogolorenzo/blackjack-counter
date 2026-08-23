import { useEffect, useMemo, useReducer, useState } from 'react'

import { PLAY_LABELS } from '@shared/domain/deviations'
import { handValue } from '@shared/domain/hand'
import type { Rank } from '@shared/domain/hand'
import { decideHand } from '@shared/domain/handDecision'
import { initialRound, roundReducer } from '@shared/domain/round'
import type { HandStatus } from '@shared/domain/round'
import { formatSigned } from '@shared/format'
import type { CountingSystem, KeypadDensity } from '@shared/types'

import { DecisionPanel } from '@/components/DecisionPanel'
import { HandStrip } from '@/components/HandStrip'
import { RankKeypad } from '@/components/RankKeypad'

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
      dispatch({ type: 'reset', dealerFirst })
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

  /*
    Uma mão recém-saída de uma separação chega com uma carta só e nenhuma
    decisão a tomar ainda — ela sempre precisa de carta, independente do
    último botão apertado. `awaitingCard` cobre os casos que o estado da
    rodada não expressa (pedir, e a carta que fecha um dobrar); a contagem de
    cartas cobre este.
  */
  const needsCard = awaitingCard || hand.cards.length < 2

  const decision =
    round.step === 'playing' && round.upcard !== null && !needsCard
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
