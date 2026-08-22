// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StrategyGuide } from '../src/renderer/src/components/StrategyGuide'

afterEach(cleanup)

describe('StrategyGuide', () => {
  it('lista os desvios que estão valendo no count atual', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={4} insuranceOn surrender maxRows={30} />
    )
    expect(screen.getByText(/15 vs 10/)).toBeTruthy()
    expect(screen.getByText(/16 vs 10/)).toBeTruthy()
  })

  /**
   * Ordenação de sortForCount: entre os ativos, o índice mais alto primeiro —
   * é o que acabou de virar e o mais caro de esquecer.
   *
   * maxRows={30} de propósito: em TC 4 há 18 desvios de mão ativos depois da
   * dedup, e com maxRows={9} "16 vs 10" (índice 0) cairia fora da janela só
   * por causa do truncamento — o que testaria o corte, não a ordenação. Sem
   * truncamento no meio, este teste mede só o que se propõe a medir.
   */
  it('põe o índice mais alto na frente entre os ativos', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={5} insuranceOn surrender maxRows={30} />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    const dezDez = rows.findIndex((text) => text.includes('10,10 vs 5'))
    const dezesseisDez = rows.findIndex((text) => text.includes('16 vs 10'))
    expect(dezDez).toBeLessThan(dezesseisDez)
  })

  /**
   * Truncar tem que derrubar o índice mais antigo, nunca o mais recente: o
   * desvio que acabou de virar é o que o jogador ainda está jogando pelo
   * livro velho, e é o mais caro de esquecer agora. Em TC 5 os dois de índice
   * 5 são "10,10 vs 5" e "16 vs 9"; "16 vs 10" é índice 0 (ativou há muito
   * tempo) e tem que ser o primeiro a sair quando a janela aperta.
   *
   * maxRows={3} para sobrarem 2 desvios: a terceira vaga vai para a linha
   * "+N mais", que é uma linha como as outras.
   */
  it('ao truncar, mantém os índices que viraram mais recentemente', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={5} insuranceOn surrender maxRows={3} />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    expect(rows).toHaveLength(2)
    expect(rows.some((text) => text.includes('16 vs 10'))).toBe(false)
  })

  it('em count negativo não fica vazio: diz que é a básica e mostra o próximo', () => {
    render(
      <StrategyGuide
        system="hilo"
        decisionCount={-3}
        insuranceOn={false}
        surrender
        maxRows={9}
      />
    )
    expect(screen.getByText(/estratégia básica/i)).toBeTruthy()
    expect(screen.getByTestId('next-index').textContent).toContain('vs')
  })

  it('mostra o seguro ligado quando o derivado diz que sim', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={3} insuranceOn surrender maxRows={9} />
    )
    expect(screen.getByTestId('insurance').textContent).toContain('fazer seguro')
  })

  /**
   * A linha "+N mais" ocupa uma vaga de linha, não um espaço extra: com 4 vagas
   * e mais desvios do que isso, saem 3 desvios e o aviso. Contar 4 desvios MAIS
   * o aviso empurraria o bloco "Próximo" para fora do overflow-hidden.
   */
  it('ao truncar, a linha "+N mais" toma uma das vagas', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={9} insuranceOn surrender maxRows={4} />
    )
    expect(screen.getAllByTestId('deviation-row')).toHaveLength(3)
    expect(screen.getByText(/\+\d+ mais/)).toBeTruthy()
  })

  /** Sem truncamento a vaga não é cobrada: as 30 vagas são todas de desvio. */
  it('sem truncar, nenhuma vaga é reservada para o aviso', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={9} insuranceOn surrender maxRows={30} />
    )
    const rows = screen.getAllByTestId('deviation-row')
    expect(rows.length).toBeGreaterThan(4)
    expect(screen.queryByText(/\+\d+ mais/)).toBeNull()
  })

  /**
   * A regra que o app inteiro respeita: índice de Hi-Lo em running count de KO
   * é conselho errado com cara de certo.
   */
  it('no KO não mostra desvio nenhum e explica por quê', () => {
    render(
      <StrategyGuide system="ko" decisionCount={6} insuranceOn={false} surrender maxRows={9} />
    )
    expect(screen.queryAllByTestId('deviation-row')).toHaveLength(0)
    expect(screen.getByText(/Hi-Lo/)).toBeTruthy()
  })

  it('sem rendição na mesa, os desvios de render somem da lista', () => {
    render(
      <StrategyGuide
        system="hilo"
        decisionCount={9}
        insuranceOn
        surrender={false}
        maxRows={30}
      />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    expect(rows.some((text) => text.includes('render'))).toBe(false)
  })

  /**
   * 15 vs 10 aparece no Fab 4 (render a partir de TC 0) e no Illustrious 18
   * (parar a partir de TC +4). Em TC 4 os dois estão ativos — sem dedup a lista
   * mostraria duas linhas contraditórias para a mesma mão.
   */
  it('não duplica a mesma mão quando dois desvios estão ativos ao mesmo tempo', () => {
    render(
      <StrategyGuide system="hilo" decisionCount={4} insuranceOn surrender maxRows={30} />
    )
    const rows = screen.getAllByTestId('deviation-row').map((row) => row.textContent ?? '')
    const quinzeDez = rows.filter((text) => text.includes('15 vs 10'))
    expect(quinzeDez).toHaveLength(1)
    expect(quinzeDez[0]).toContain('parar')
  })
})
