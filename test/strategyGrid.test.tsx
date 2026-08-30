// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyGrid } from '../src/renderer/src/components/StrategyGrid'

afterEach(cleanup)

describe('StrategyGrid', () => {
  it('em TC 0 manda ficar em 16 vs 10, que é o desvio mais famoso', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware />)
    const cell = screen.getByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('Ficar')
  })

  it('em inglês, a mesma célula lê "Stay"', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware language="en" />)
    const cell = screen.getByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('Stay')
  })

  it('em TC -1 volta a pedir em 16 vs 10 numa mesa sem rendição', () => {
    render(<StrategyGrid decisionCount={-1} surrender={false} countAware />)
    const cell = screen.getByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('Pedir')
  })

  /**
   * Com rendição na mesa a básica de 16 vs 10 já é render (código `R` na
   * tabela), e o índice do Illustrious 18 só troca render por parar a partir
   * de TC 0. Abaixo do índice a jogada certa continua sendo render — não
   * pedir. Este é o caso que enganou a primeira versão deste teste.
   */
  it('com rendição na mesa, 16 vs 10 abaixo do índice é render', () => {
    render(<StrategyGrid decisionCount={-1} surrender countAware />)
    const cell = screen.getByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('Cashout')
  })

  /**
   * O ponto do countAware=false. Os índices publicados são de Hi-Lo; aplicá-los
   * ao running count do KO daria conselho errado com cara de certo.
   */
  it('sem countAware ignora a contagem e mostra só a básica', () => {
    render(<StrategyGrid decisionCount={8} surrender={false} countAware={false} />)
    const cell = screen.getByRole('img', { name: /^16 contra 10:/ })
    expect(cell.getAttribute('aria-label')).toContain('Pedir')
  })

  it('sem rendição na mesa, 16 vs A vira pedir e não render', () => {
    render(<StrategyGrid decisionCount={0} surrender={false} countAware />)
    const cell = screen.getByRole('img', { name: /^16 contra A:/ })
    expect(cell.getAttribute('aria-label')).toContain('Pedir')
  })

  /**
   * No overlay a grade é só leitura, e ali um <button> por célula não é neutro:
   * `-webkit-app-region: no-drag` vale por CSS mesmo em botão desabilitado, e
   * as ~270 células roubariam a área de arrasto da janela inteira.
   */
  it('sem onSelect as células não são botões', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware />)
    expect(screen.getByRole('img', { name: /^16 contra 10:/ }).tagName).toBe('SPAN')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('com onSelect as células voltam a ser botões clicáveis', () => {
    render(<StrategyGrid decisionCount={0} surrender countAware onSelect={() => undefined} />)
    const cell = screen.getByRole('button', { name: /^16 contra 10:/ })
    expect(cell.hasAttribute('disabled')).toBe(false)
  })
})
