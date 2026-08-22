export interface ChangelogEntry {
  version: string
  /** ISO curto, `YYYY-MM-DD`. */
  date: string
  changes: readonly string[]
}

/**
 * O que mudou em cada versão, da mais nova para a mais antiga.
 *
 * Mora aqui, e não num CHANGELOG.md, porque o destino dele é a tela da Ajuda:
 * markdown exigiria um parser dentro do app para virar UI. Um teste garante que
 * a versão em `package.json` tem entrada nesta lista — sem ele, uma release
 * sairia sem dizer o que mudou, que é exatamente quando o usuário pergunta.
 */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '0.2.1',
    date: '2026-08-21',
    changes: [
      'A versão instalada agora aparece na Ajuda, junto desta lista de mudanças.'
    ]
  },
  {
    version: '0.2.0',
    date: '2026-08-21',
    changes: [
      'O app se atualiza sozinho: checa novas versões e oferece o reinício sem atrapalhar o jogo.',
      'Estratégia básica por mão, com os desvios do Illustrious 18 e do Fab 4.',
      'Três modos de treino: velocidade, precisão e contagem mental.',
      'Sessões com histórico de shoes e dimensionamento de banca.',
      'Sistema KO além do Hi-Lo.',
      'Manual completo dentro do app, na aba Ajuda.',
      'Paleta para daltonismo e escolha de moeda.',
      'A contagem em andamento sobrevive a um fechamento inesperado.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-08-16',
    changes: [
      'Contador Hi-Lo com atalhos globais, overlay sobre o jogo e ícone na bandeja.'
    ]
  }
]

/** A versão que está rodando, injetada do `package.json` no build. */
export const APP_VERSION: string = __APP_VERSION__
