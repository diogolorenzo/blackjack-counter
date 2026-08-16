import { useEffect, useRef, useState } from 'react'

import type { SetBindingResult } from '@shared/ipc'
import type { HotkeyAction, HotkeyStatus } from '@shared/types'

export interface HotkeyRecorderProps {
  action: HotkeyAction
  label: string
  accelerator: string
  status: HotkeyStatus
}

interface Notice {
  tone: 'error' | 'warn'
  text: string
}

/**
 * Teclas de operador do numpad. Não são `Numpad<dígito>`: mapeiam para
 * VK_ADD/SUBTRACT/MULTIPLY/DIVIDE e disparam com o NumLock em qualquer estado.
 */
const NUMPAD_OPERATORS: Record<string, string | undefined> = {
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec'
}

const NAMED_KEYS: Record<string, string | undefined> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`'
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight'
])

/**
 * Traduz pelo `code` (tecla física), nunca pelo `key`: com o NumLock desligado o
 * numpad 1 chega como key 'End', e gravar 'End' bindaria a tecla errada.
 */
function baseKey(code: string): string | null {
  const operator = NUMPAD_OPERATORS[code]
  if (operator !== undefined) return operator
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return NAMED_KEYS[code] ?? null
}

export function toAccelerator(event: KeyboardEvent): string | null {
  const key = baseKey(event.code)
  if (key === null) return null

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Super')
  parts.push(key)
  return parts.join('+')
}

function describeResult(result: SetBindingResult, requested: string): Notice | null {
  if (result.ok) {
    // Em teclado ABNT2 o AltGr É Ctrl+Alt: reservar essa combinação sequestra a
    // digitação de `/`, `°` e `₢` no sistema inteiro.
    if (requested.startsWith('Ctrl+Alt+')) {
      return { tone: 'warn', text: 'Ctrl+Alt é o AltGr do teclado ABNT2 e atrapalha a digitação.' }
    }
    return null
  }
  if (result.reason === 'conflict') {
    return { tone: 'error', text: `Tecla já em uso. Mantida: ${result.effective}.` }
  }
  return { tone: 'error', text: 'Tecla inválida para atalho global.' }
}

export function HotkeyRecorder({ action, label, accelerator, status }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    if (!recording) return

    submitting.current = false
    void window.counter.setCaptureMode(true)

    const onKeyDown = (event: KeyboardEvent): void => {
      // Modificador sozinho não é atalho; espera a tecla de verdade.
      if (MODIFIER_CODES.has(event.code)) return
      // Sem stopPropagation: o detector de NumLock do App precisa ver este evento.
      event.preventDefault()
      if (submitting.current) return

      if (event.code === 'Escape') {
        setRecording(false)
        return
      }

      const next = toAccelerator(event)
      if (next === null) {
        setNotice({ tone: 'error', text: 'Tecla não suportada como atalho global.' })
        return
      }

      submitting.current = true
      window.counter
        .setBinding(action, next)
        .then((result) => setNotice(describeResult(result, next)))
        .catch(() => setNotice({ tone: 'error', text: 'Falha ao registrar o atalho.' }))
        // Sair do modo de captura só depois da resposta: encerrar antes faria o
        // main re-registrar as bindings ANTIGAS por cima da que acabou de entrar.
        .finally(() => setRecording(false))
    }

    // Recarregar a página (HMR, F5) não desmonta o componente. Sem isto o main
    // ficaria preso em captura, ou seja, sem nenhuma hotkey registrada.
    const onUnload = (): void => {
      void window.counter.setCaptureMode(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('beforeunload', onUnload)
      void window.counter.setCaptureMode(false)
    }
  }, [recording, action])

  const toggle = (): void => {
    setNotice(null)
    setRecording((value) => !value)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px]">{label}</span>

        <div className="flex shrink-0 items-center gap-1.5">
          {!recording && status === 'conflict' && <span className="ui-label text-neg">ocupada</span>}
          {!recording && status === 'disabled' && <span className="ui-label">off</span>}

          <button
            type="button"
            onClick={toggle}
            className={`h-6 min-w-[86px] rounded-md border px-2 text-[11px] transition-colors duration-100 ${
              recording
                ? 'border-warn/60 bg-warn/10 text-warn'
                : 'border-border bg-bg text-fg hover:bg-fg/5'
            }`}
          >
            {recording ? 'Pressione…' : accelerator}
          </button>
        </div>
      </div>

      {recording && (
        <p className="text-right text-[10px] text-muted">Esc cancela.</p>
      )}
      {!recording && notice !== null && (
        <p className={`text-[10px] leading-snug ${notice.tone === 'error' ? 'text-neg' : 'text-warn'}`}>
          {notice.text}
        </p>
      )}
    </div>
  )
}
