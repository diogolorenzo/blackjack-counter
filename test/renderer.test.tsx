// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/renderer/src/App'
import { OverlayApp } from '../src/renderer/src/OverlayApp'
import { DEFAULT_BET_SPREADS, DEFAULT_SETTINGS } from '../src/shared/defaults'
import { computeDerived } from '../src/shared/domain/shoe'
import type { CounterApi } from '../src/shared/ipc'
import { HOTKEY_ACTIONS } from '../src/shared/types'
import type { AppSnapshot, Entry, Settings } from '../src/shared/types'

function entries(count: number): Entry[] {
  return Array.from({ length: count }, (_, i) => ({ id: `e${i}`, delta: 1 as const, at: i }))
}

function snapshot(patch: Partial<Settings> = {}, cards = 0): AppSnapshot {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...patch }
  const list = entries(cards)
  const status = {} as AppSnapshot['hotkeyStatus']
  for (const action of HOTKEY_ACTIONS) {
    status[action] = settings.bindings[action] === '' ? 'disabled' : 'ok'
  }

  return {
    recentEntries: [...list].reverse(),
    derived: computeDerived(list, settings.shoe, DEFAULT_BET_SPREADS[settings.shoe.system]),
    canUndo: cards > 0,
    canRedo: false,
    undoRestoresShoe: false,
    settings,
    hotkeyStatus: status,
    numLockOn: true,
    sessionRestored: false,
    session: { active: false, id: null, startedAt: null, shoes: 0 },
    shoeStats: { startedAt: 0, maxDecisionCount: 0, minDecisionCount: 0, msAtAdvantage: 0 },
    applyTick: 0,
    lastBucket: null
  }
}

/**
 * Ponte falsa para o processo main.
 *
 * O renderer inteiro depende de `window.counter`; sem este stub nem o primeiro
 * render acontece. Cada método devolve o snapshot fixo, que é o suficiente para
 * verificar o que o renderer desenha a partir dele.
 */
function stubApi(state: AppSnapshot): CounterApi {
  const api = {
    getState: vi.fn(async () => state),
    applyCount: vi.fn(async () => state),
    undo: vi.fn(async () => state),
    redo: vi.fn(async () => state),
    newShoe: vi.fn(async () => state),
    acknowledgeRestore: vi.fn(async () => state),
    startSession: vi.fn(async () => state),
    endSession: vi.fn(async () => state),
    getSettings: vi.fn(async () => state.settings),
    updateSettings: vi.fn(async () => state),
    setBinding: vi.fn(async () => ({ ok: true, effective: 'F1' })),
    clearBinding: vi.fn(async () => ({ ok: true, effective: '' })),
    setCaptureMode: vi.fn(async () => undefined),
    setHotkeysEnabled: vi.fn(async () => state),
    setOverlayVisible: vi.fn(async () => state),
    setOverlayLocked: vi.fn(async () => state),
    setOverlayCorner: vi.fn(async () => state),
    setOverlaySize: vi.fn(async () => state),
    getHistory: vi.fn(async () => []),
    setShoeResult: vi.fn(async () => []),
    clearHistory: vi.fn(async () => []),
    simulateRisk: vi.fn(async () => null),
    reportNumLock: vi.fn(async () => undefined),
    minimizeWindow: vi.fn(async () => undefined),
    closeWindow: vi.fn(async () => undefined),
    onStateChanged: vi.fn(() => () => undefined)
  } satisfies CounterApi

  window.counter = api
  return api
}

afterEach(() => {
  cleanup()
})

describe('App', () => {
  it('mostra a contagem depois do primeiro snapshot', async () => {
    stubApi(snapshot({}, 4))
    render(<App />)

    expect(screen.getByText('Carregando')).toBeDefined()
    await waitFor(() => expect(screen.getByText('+4')).toBeDefined())
    expect(screen.getByText('Running')).toBeDefined()
    expect(screen.getByText('True')).toBeDefined()
  })

  it('rotula os botões com as cartas do sistema ativo', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByText('2-6')).toBeDefined())
    expect(screen.getByText('7-9')).toBeDefined()
    expect(screen.getByText('10-A')).toBeDefined()
  })

  it('no KO troca o 7 de bucket, mostra o pivô e esconde a aba de desvios', async () => {
    stubApi(snapshot({ shoe: { ...DEFAULT_SETTINGS.shoe, system: 'ko' } }))
    render(<App />)

    await waitFor(() => expect(screen.getByText('2-7')).toBeDefined())
    expect(screen.getByText('8-9')).toBeDefined()
    expect(screen.getByText('Pivô')).toBeDefined()
    expect(screen.queryByText('True')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Desvios' })).toBeNull()
  })

  it('a aba de desvios conta quantos estão valendo no count atual', async () => {
    // 12 cartas baixas em 6 baralhos: running +12 sobre 5,77 baralhos = TC +2.
    // Nesse ponto 12 dos 22 desvios estão ativos e o seguro (índice +3) não.
    stubApi(snapshot({}, 12))
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desvios' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Desvios' }))

    expect(screen.getByText('12 de 22 valendo')).toBeDefined()
    expect(screen.getByText('sem seguro')).toBeDefined()
  })

  it('aplica a carta pelo botão', async () => {
    const api = stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByText('2-6')).toBeDefined())
    fireEvent.click(screen.getByText('2-6'))
    expect(api.applyCount).toHaveBeenCalledWith(1)
  })

  it('novo shoe pede confirmação antes de zerar', async () => {
    const api = stubApi(snapshot({}, 3))
    render(<App />)

    await waitFor(() => expect(screen.getByText('Novo shoe')).toBeDefined())
    fireEvent.click(screen.getByText('Novo shoe'))
    expect(api.newShoe).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Confirmar?'))
    expect(api.newShoe).toHaveBeenCalledTimes(1)
  })

  it('avisa quando o shoe veio de uma recuperação', async () => {
    const state = { ...snapshot({}, 7), sessionRestored: true }
    stubApi(state)
    render(<App />)

    await waitFor(() => expect(screen.getByText(/Shoe recuperado/)).toBeDefined())
    expect(screen.getByText(/7 cartas/)).toBeDefined()
  })

  it('aplica a paleta escolhida no body', async () => {
    stubApi(snapshot({ palette: 'colorblind' }))
    render(<App />)
    await waitFor(() => expect(document.body.dataset.palette).toBe('colorblind'))
  })
})

describe('matriz mão × dealer', () => {
  it('mostra o chart completo com legenda quando o layout é matriz', async () => {
    stubApi(snapshot({ deviationsLayout: 'matrix' }, 12))
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desvios' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Desvios' }))

    // Cabeçalho de colunas e linhas de mão.
    expect(screen.getByText('Mão')).toBeDefined()
    expect(screen.getByText('Mão dura')).toBeDefined()
    expect(screen.getByText('Par')).toBeDefined()
    // Legenda das letras em português.
    expect(screen.getByText('pedir')).toBeDefined()
    expect(screen.getByText('separar')).toBeDefined()
  })

  it('a célula sabe a jogada do count atual', async () => {
    // TC +2: 12 vs 3 já virou "parar"; 12 vs 2 (índice +3) ainda não.
    stubApi(snapshot({ deviationsLayout: 'matrix' }, 12))
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desvios' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Desvios' }))

    expect(screen.getByRole('button', { name: '12 contra 3: parar' })).toBeDefined()
    expect(screen.getByRole('button', { name: '12 contra 2: pedir' })).toBeDefined()
  })

  it('clicar numa célula explica o índice dela', async () => {
    stubApi(snapshot({ deviationsLayout: 'matrix' }, 12))
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desvios' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Desvios' }))
    fireEvent.click(screen.getByRole('button', { name: '12 contra 2: pedir' }))

    expect(screen.getByText(/12 vs 2/)).toBeDefined()
    expect(screen.getByText(/TC \+3/)).toBeDefined()
  })

  it('trocar de layout grava a preferência', async () => {
    const api = stubApi(snapshot({}, 4))
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Desvios' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Desvios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mão × dealer' }))

    expect(api.updateSettings).toHaveBeenCalledWith({ deviationsLayout: 'matrix' })
  })
})

describe('sessão', () => {
  it('avisa e oferece abrir quando nenhuma sessão está em curso', async () => {
    const api = stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sessões' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Sessões' }))

    expect(screen.getByText(/Nenhuma sessão aberta/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }))
    expect(api.startSession).toHaveBeenCalledTimes(1)
  })

  it('com sessão aberta mostra o contador e o botão de encerrar', async () => {
    const state = {
      ...snapshot(),
      session: { active: true, id: 's1', startedAt: Date.now() - 65000, shoes: 3 }
    }
    const api = stubApi(state)
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sessões' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Sessões' }))

    expect(screen.getByText('Shoes nesta sessão')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    expect(api.endSession).toHaveBeenCalledTimes(1)
  })
})

describe('treino', () => {
  it('o modo mental esconde os botões de bucket', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Treino' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Treino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Contagem mental' }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))

    expect(screen.getByText(/Conte de cabeça/)).toBeDefined()
    // Os rótulos de bucket só existem no modo por tecla.
    expect(screen.queryByText('2-6')).toBeNull()
  })

  it('parar o modo mental na primeira carta cobra uma carta, não zero', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Treino' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Treino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Contagem mental' }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Parar e conferir' }))

    // A carta na tela já foi vista pelo usuário e tem que entrar na conta.
    expect(screen.getByText(/depois de 1 cartas/)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Conferir' })).toBeDefined()
  })

  it('o modo por tecla mostra os buckets e a tecla de cada um', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Treino' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Treino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Começar' }))

    expect(screen.getByText('2-6')).toBeDefined()
    expect(screen.getByText('F1')).toBeDefined()
  })
})

describe('ajuda', () => {
  it('tem manual com o significado dos termos', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajuda' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }))

    expect(screen.getByText('Começando em 5 passos')).toBeDefined()
    expect(screen.getByText('Os números da tela')).toBeDefined()
    expect(screen.getByText('Glossário rápido')).toBeDefined()
    expect(screen.getByText('Running count')).toBeDefined()
  })

  it('os atalhos do texto levam para a aba citada', async () => {
    stubApi(snapshot())
    render(<App />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajuda' })).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }))
    // "Ajustes" aparece duas vezes: a aba e o atalho dentro do texto. A aba
    // carrega aria-current; o atalho não.
    const link = screen
      .getAllByRole('button', { name: 'Ajustes' })
      .find((button) => !button.hasAttribute('aria-current'))
    expect(link).toBeDefined()
    fireEvent.click(link as HTMLElement)

    expect(screen.getByText('Sistema')).toBeDefined()
  })
})

describe('OverlayApp', () => {
  it('layout completo mostra shoe, aposta e histórico', async () => {
    stubApi(snapshot({}, 3))
    render(<OverlayApp />)

    await waitFor(() => expect(screen.getByText('Shoe')).toBeDefined())
    expect(screen.getByText('Bet')).toBeDefined()
    expect(screen.getByText('Running')).toBeDefined()
  })

  it('layout mínimo mostra só o count e a aposta', async () => {
    stubApi(
      snapshot({ overlay: { ...DEFAULT_SETTINGS.overlay, layout: 'minimal', visible: true } }, 3)
    )
    render(<OverlayApp />)

    await waitFor(() => expect(screen.getByText('Bet')).toBeDefined())
    expect(screen.queryByText('Shoe')).toBeNull()
    expect(screen.getByText('True')).toBeDefined()
  })

  it('a opacidade configurada chega ao CSS', async () => {
    stubApi(snapshot({ overlay: { ...DEFAULT_SETTINGS.overlay, opacity: 0.4 } }))
    const { container } = render(<OverlayApp />)

    await waitFor(() => {
      const root = container.firstElementChild as HTMLElement | null
      expect(root?.style.getPropertyValue('--overlay-alpha')).toBe('0.4')
    })
  })
})
