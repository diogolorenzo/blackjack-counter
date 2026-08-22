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
  // O tipo não estreita por phase: version continua string | null mesmo
  // pronta ou baixando. Sem fallback, uma falha upstream que broadcast a
  // versão como null vira literalmente "null" na cara do jogador.
  const versao = status.version ?? '—'

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center px-3">
      <div className="update-toast pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border border-border bg-overlay px-3 py-1.5 text-[11px] shadow-lg backdrop-blur-md">
        <span className="min-w-0 truncate text-fg">
          {ready ? `Versão ${versao} pronta` : `Baixando ${versao}`}
        </span>

        {!ready && (
          <>
            <span
              aria-hidden="true"
              className="h-[3px] w-16 shrink-0 overflow-hidden rounded-full bg-border"
            >
              <span
                className="block h-full rounded-full bg-muted transition-[width] duration-300"
                style={{ width: `${status.percent}%` }}
              />
            </span>
            <span className="tnum shrink-0 rounded-full bg-border/60 px-1.5 py-0.5 text-muted">
              {status.percent}%
            </span>
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
