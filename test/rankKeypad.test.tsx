// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RankKeypad } from '../src/renderer/src/components/RankKeypad'

afterEach(cleanup)

describe('RankKeypad', () => {
  it('mostra as dez teclas', () => {
    render(<RankKeypad onPick={vi.fn()} density="comfortable" />)
    expect(screen.getAllByRole('button')).toHaveLength(10)
  })

  it('entrega o rank clicado', () => {
    const onPick = vi.fn()
    render(<RankKeypad onPick={onPick} density="comfortable" />)
    fireEvent.click(screen.getByRole('button', { name: 'carta 10' }))
    expect(onPick).toHaveBeenCalledWith('10')
  })

  /**
   * O rótulo diz "carta A" e não só "A": a leitura útil de um leitor de tela
   * numa grade de dez letras soltas é a carta, não o caractere.
   */
  it('rotula o ás como carta', () => {
    render(<RankKeypad onPick={vi.fn()} density="comfortable" />)
    expect(screen.getByRole('button', { name: 'carta A' })).toBeTruthy()
  })
})
