import type { Bucket } from '@shared/types'

/**
 * Toda a saída de áudio do app.
 *
 * Fica num módulo só porque o AudioContext é caro e único: criar um por
 * componente esgota o limite do Chromium depois de algumas dezenas de montagens
 * (o modo de treino remonta a cada rodada).
 */

/**
 * Frequência por bucket. Grave = carta alta (contagem cai), agudo = carta baixa
 * (contagem sobe): o tom sozinho já diz para que lado foi, sem precisar olhar.
 */
const BUCKET_TONES: Record<Bucket, number> = {
  low: 880,
  neutral: 640,
  high: 440
}

/** Curto o bastante para caber entre duas cartas de um dealer rápido. */
const TICK_MS = 45

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (context !== null) return context
  try {
    context = new AudioContext()
    return context
  } catch {
    // Sem saída de áudio: o retorno visual continua funcionando sozinho.
    return null
  }
}

interface ToneSpec {
  frequency: number
  ms: number
  volume: number
  type?: OscillatorType
  /** Atraso em ms a partir de agora, para encadear notas. */
  delayMs?: number
}

function playTone(spec: ToneSpec): void {
  const ctx = audioContext()
  if (ctx === null) return

  // A janela do overlay não recebe foco e a principal pode estar em segundo
  // plano; sem o resume o contexto fica suspenso e o som nunca sai.
  if (ctx.state === 'suspended') void ctx.resume()

  const start = ctx.currentTime + (spec.delayMs ?? 0) / 1000
  const seconds = spec.ms / 1000
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = spec.type ?? 'sine'
  oscillator.frequency.value = spec.frequency

  // Rampa em vez de liga/desliga: corte seco em onda periódica estala.
  const peak = Math.max(0, Math.min(1, spec.volume)) * 0.25
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + seconds + 0.02)
}

/** Confirmação de carta registrada durante o jogo. */
export function playBucketTick(bucket: Bucket, volume: number): void {
  playTone({ frequency: BUCKET_TONES[bucket], ms: TICK_MS, volume })
}

/**
 * Acerto no treino: duas notas subindo.
 *
 * Difere do tick de jogo de propósito — no treino o som responde "certo ou
 * errado", não "qual carta", e confundir os dois tiraria o valor do retorno.
 */
export function playCorrect(volume: number): void {
  playTone({ frequency: 784, ms: 40, volume })
  playTone({ frequency: 1175, ms: 70, volume, delayMs: 45 })
}

/** Erro no treino: nota grave e áspera, curta o bastante para não atrapalhar o ritmo. */
export function playWrong(volume: number): void {
  playTone({ frequency: 180, ms: 130, volume, type: 'square' })
}

/** Carta que passou sem resposta no modo velocidade. */
export function playMiss(volume: number): void {
  playTone({ frequency: 300, ms: 90, volume, type: 'triangle' })
}

/** Batida seca a cada carta nova no modo mental, onde não há resposta para soar. */
export function playCardFlip(volume: number): void {
  playTone({ frequency: 520, ms: 28, volume: volume * 0.6, type: 'triangle' })
}

/** Fim de rodada de treino: três notas subindo. */
export function playFinish(volume: number): void {
  playTone({ frequency: 523, ms: 90, volume })
  playTone({ frequency: 659, ms: 90, volume, delayMs: 95 })
  playTone({ frequency: 784, ms: 160, volume, delayMs: 190 })
}
