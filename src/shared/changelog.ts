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
    version: '0.4.2',
    date: '2026-08-30',
    changes: [
      'O overlay de decisão de mão e a aba Desvios agora usam os mesmos nomes de jogada em toda parte — antes o texto da jogada e o botão de clique podiam mostrar palavras diferentes para a mesma decisão.',
      'Novo seletor de idioma para os nomes das jogadas, em Ajustes > Aparência: Português (Pedir, Ficar, Dobrar, Separar, Cashout) ou English (Ask, Stay, Double, Split, Cashout).'
    ]
  },
  {
    version: '0.4.1',
    date: '2026-08-25',
    changes: [
      'Correção da atualização automática em quem instalou o app "para todos os usuários": o instalador agora aparece na tela em vez de pedir permissão numa janela escondida — era isso que travava o computador por alguns segundos e fechava o app sem instalar nada.',
      'O updater agora guarda um log (updater.log, na pasta de dados do app), para uma falha de atualização deixar rastro em vez de sumir em silêncio.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-08-24',
    changes: [
      'O overlay de jogada agora responde sobre a SUA mão: clique nas suas cartas e na do dealer e ele diz o que fazer, com a explicação do índice quando a contagem muda a jogada.',
      'Separação completa: até quatro mãos, re-separação, ases separados com uma carta só e dobra depois de separar.',
      'Desfazer no overlay: clique errado tira a última carta em vez de recomeçar a rodada.',
      'O overlay de jogada funciona no KO, mostrando a estratégia básica — antes ele só explicava por que não podia ajudar.',
      'Os modos guia e matriz saíram do overlay; os dois continuam na aba Desvios da janela principal.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-08-22',
    changes: [
      'Overlay de jogada: uma segunda janela sobre o jogo com a jogada correta para cada mão no count atual, em modo guia ou matriz completa.',
      'Os dois overlays agora se redimensionam com o mouse, pela alça no canto, além dos três tamanhos prontos.',
      'A atualização deixou de abrir uma janela do Windows: agora é uma faixa discreta no rodapé, com o progresso do download.',
      'Atualizações chegam mais rápido: o app confere novidades 10 segundos depois de abrir e a cada 30 minutos, não mais a cada 6 horas.'
    ]
  },
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
