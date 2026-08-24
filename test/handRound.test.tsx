// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HandRound } from '../src/renderer/src/components/HandRound'

afterEach(cleanup)

const defaults = {
  system: 'hilo' as const,
  decisionCount: 0,
  surrender: false,
  insuranceOn: false,
  dealerFirst: false,
  showReason: true,
  autoResetSeconds: 0,
  keypadDensity: 'comfortable' as const
}

const pick = (rank: string) => fireEvent.click(screen.getByRole('button', { name: `carta ${rank}` }))

describe('HandRound', () => {
  it('pede a mão, depois o dealer, depois decide', () => {
    render(<HandRound {...defaults} decisionCount={-2} />)
    expect(screen.getByText('Sua mão')).toBeTruthy()

    pick('10')
    pick('6')
    expect(screen.getByText('Dealer')).toBeTruthy()

    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('pedir')
  })

  it('com dealerFirst pede o upcard primeiro', () => {
    render(<HandRound {...defaults} dealerFirst />)
    expect(screen.getByText('Dealer')).toBeTruthy()
  })

  /** Illustrious 18: 16 vs 10 vira parar a partir de TC 0. */
  it('mostra o desvio e o porquê no count alto', () => {
    render(<HandRound {...defaults} decisionCount={3} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('parar')
    expect(screen.getByTestId('reason').textContent).toContain('desvio')
  })

  it('esconde o porquê quando desligado', () => {
    render(<HandRound {...defaults} showReason={false} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.queryByTestId('reason')).toBe(null)
  })

  it('pedir carta recalcula a decisão', () => {
    render(<HandRound {...defaults} decisionCount={-2} />)
    pick('10')
    pick('6')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Pedir' }))
    pick('3')
    expect(screen.getByTestId('decision').textContent).toContain('parar')
  })

  it('estourar encerra e oferece nova mão', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Pedir' }))
    pick('10')
    expect(screen.getByText(/Estourou/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nova mão' })).toBeTruthy()
  })

  it('separar mostra a tira de mãos e joga a primeira', () => {
    render(<HandRound {...defaults} />)
    pick('8')
    pick('8')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Separar' }))
    expect(screen.getByTestId('hand-strip').textContent).toContain('2:')
    expect(screen.getByText(/Mão 1/)).toBeTruthy()
  })

  /**
   * A segunda mão de uma separação nasce com uma carta só. Encerrar a
   * primeira não pode pular direto para o painel de decisão nela: sem
   * segunda carta não há decisão, só o teclado.
   */
  it('a segunda mão de uma separação pede carta antes de decidir', () => {
    render(<HandRound {...defaults} />)
    pick('8')
    pick('8')
    pick('10')
    fireEvent.click(screen.getByRole('button', { name: 'Separar' }))
    pick('3')
    fireEvent.click(screen.getByRole('button', { name: 'Ficar' }))
    expect(screen.getByRole('button', { name: 'carta A' })).toBeTruthy()
    expect(screen.queryByTestId('decision')).toBe(null)
  })

  it('a tira não aparece com uma mão só', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.queryByTestId('hand-strip')).toBe(null)
  })

  it('desfazer tira a última carta', () => {
    render(<HandRound {...defaults} />)
    pick('10')
    pick('6')
    expect(screen.getByText('Dealer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByText('Sua mão')).toBeTruthy()
  })

  /**
   * `doubling` some do estado de tela quando o desfazer restaura a mão: sem
   * incluir `hand.doubling` em `needsCard`, uma mão que já dobrou volta a
   * mostrar o painel de decisão, oferecendo pedir/separar/ficar numa mão que
   * a mesa já fechou.
   */
  it('desfazer depois de dobrar e fechar a mão devolve o teclado, não o painel', () => {
    render(<HandRound {...defaults} />)
    pick('5')
    pick('5')
    pick('9')
    fireEvent.click(screen.getByRole('button', { name: 'Dobrar' }))
    pick('9')
    expect(screen.getByRole('button', { name: 'Nova mão' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByRole('button', { name: 'carta 9' })).toBeTruthy()
    expect(screen.queryByTestId('decision')).toBe(null)
  })

  it('mostra o seguro só contra ás', () => {
    render(<HandRound {...defaults} insuranceOn />)
    pick('10')
    pick('6')
    expect(screen.queryByTestId('insurance')).toBe(null)
    pick('A')
    expect(screen.getByTestId('insurance').textContent).toContain('fazer seguro')
  })

  /**
   * Em KO os índices de Hi-Lo não valem. 16 vs 10 sem rendição é pedir na
   * básica e parar no Illustrious 18: se a fiação de countAware estivesse
   * invertida, este teste mostraria "parar".
   */
  it('em KO mostra a básica, não o desvio de Hi-Lo', () => {
    render(<HandRound {...defaults} system="ko" decisionCount={3} />)
    pick('10')
    pick('6')
    pick('10')
    expect(screen.getByTestId('decision').textContent).toContain('pedir')
  })
})
