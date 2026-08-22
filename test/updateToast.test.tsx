// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UpdateToast } from '../src/renderer/src/components/UpdateToast'
import type { UpdateStatus } from '../src/shared/types'

function installApi(status: UpdateStatus | null) {
  const api = {
    getUpdateStatus: () => Promise.resolve(status),
    installUpdate: vi.fn(() => Promise.resolve()),
    dismissUpdate: vi.fn(() => Promise.resolve()),
    onUpdateStatus: () => () => {}
  }
  Object.defineProperty(window, 'counter', { configurable: true, value: api })
  return api
}

afterEach(cleanup)

describe('UpdateToast', () => {
  it('sem status não desenha nada', async () => {
    installApi(null)
    const { container } = render(<UpdateToast />)
    await Promise.resolve()
    expect(container.textContent).toBe('')
  })

  it('baixando mostra a porcentagem', async () => {
    installApi({ phase: 'downloading', version: '0.3.0', percent: 37 })
    render(<UpdateToast />)
    expect(await screen.findByText('37%')).toBeTruthy()
    expect(screen.getByText(/0\.3\.0/)).toBeTruthy()
  })

  it('pronta oferece reiniciar', async () => {
    const api = installApi({ phase: 'ready', version: '0.3.0', percent: 100 })
    render(<UpdateToast />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reiniciar' }))
    expect(api.installUpdate).toHaveBeenCalled()
  })

  it('o x dispensa', async () => {
    const api = installApi({ phase: 'ready', version: '0.3.0', percent: 100 })
    render(<UpdateToast />)
    fireEvent.click(await screen.findByRole('button', { name: 'Dispensar' }))
    expect(api.dismissUpdate).toHaveBeenCalled()
  })

  /** Baixando ainda não dá para reiniciar: não há o que instalar. */
  it('baixando não oferece reiniciar', async () => {
    installApi({ phase: 'downloading', version: '0.3.0', percent: 37 })
    render(<UpdateToast />)
    await screen.findByText('37%')
    expect(screen.queryByRole('button', { name: 'Reiniciar' })).toBeNull()
  })

  /**
   * O tipo de UpdateStatus não estreita version por phase: mesmo pronta, ele
   * continua string | null. Sem fallback, isso vira a string "null" na tela.
   */
  it('versão nula não vira a string "null" na tela', async () => {
    installApi({ phase: 'ready', version: null, percent: 100 })
    const { container } = render(<UpdateToast />)
    await screen.findByRole('button', { name: 'Reiniciar' })
    expect(container.textContent).not.toContain('null')
  })
})
