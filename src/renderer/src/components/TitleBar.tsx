export interface TitleBarProps {
  /** Rótulo curto do sistema ativo, ex: "Hi-Lo". Fica ao lado do nome do app. */
  systemLabel: string
}

const CONTROL_CLASS =
  'flex h-8 w-9 items-center justify-center text-muted transition-colors duration-100 hover:text-fg'

/**
 * A janela é frameless: esta faixa é o único lugar por onde ela pode ser
 * arrastada. Os botões voltam a receber clique pela regra .app-drag button
 * (no-drag) definida em styles.css.
 */
export function TitleBar({ systemLabel }: TitleBarProps) {
  return (
    <header className="app-drag flex h-8 shrink-0 items-center border-b border-border bg-surface">
      <span className="ui-label flex-1 truncate pl-3">Counter · {systemLabel}</span>

      <button
        type="button"
        aria-label="Minimizar"
        onClick={() => void window.counter.minimizeWindow()}
        className={`${CONTROL_CLASS} hover:bg-fg/10`}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true" className="h-2.5 w-2.5">
          <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="Fechar"
        onClick={() => void window.counter.closeWindow()}
        className={`${CONTROL_CLASS} hover:bg-neg hover:text-bg`}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true" className="h-2.5 w-2.5">
          <path
            d="M1.5 1.5l7 7M8.5 1.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </header>
  )
}
