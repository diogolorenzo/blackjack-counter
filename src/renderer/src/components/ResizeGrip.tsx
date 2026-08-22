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
