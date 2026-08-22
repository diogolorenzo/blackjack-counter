export type Tab = 'count' | 'deviations' | 'drill' | 'history' | 'settings' | 'help'

export interface TabBarProps {
  active: Tab
  onSelect: (tab: Tab) => void
  /** Desvios só existem no Hi-Lo; a aba some no KO em vez de mentir. */
  showDeviations: boolean
  /** Ponto de atenção na aba Sessões enquanto nenhuma sessão está aberta. */
  sessionIdle: boolean
}

const TABS: readonly { id: Tab; label: string; title: string }[] = [
  { id: 'count', label: 'Contar', title: 'Contagem ao vivo' },
  { id: 'deviations', label: 'Desvios', title: 'Illustrious 18, Fab 4 e matriz mão × dealer' },
  { id: 'drill', label: 'Treino', title: 'Drill de velocidade, precisão e contagem mental' },
  { id: 'history', label: 'Sessões', title: 'Sessão, histórico de shoes e dimensionamento de banca' },
  { id: 'settings', label: 'Ajustes', title: 'Configurações' },
  { id: 'help', label: 'Ajuda', title: 'Manual do app e glossário' }
]

export function TabBar({ active, onSelect, showDeviations, sessionIdle }: TabBarProps) {
  const visible = TABS.filter((tab) => tab.id !== 'deviations' || showDeviations)

  return (
    <nav className="flex shrink-0 border-b border-border bg-surface">
      {visible.map((tab) => (
        <button
          key={tab.id}
          type="button"
          title={tab.title}
          aria-current={tab.id === active}
          onClick={() => onSelect(tab.id)}
          className={`relative flex-1 border-b-2 px-0.5 py-1.5 text-[10px] transition-colors duration-100 ${
            tab.id === active
              ? 'border-fg/60 text-fg'
              : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {tab.label}
          {tab.id === 'history' && sessionIdle && (
            <span
              aria-hidden="true"
              title="Nenhuma sessão aberta"
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warn"
            />
          )}
        </button>
      ))}
    </nav>
  )
}
