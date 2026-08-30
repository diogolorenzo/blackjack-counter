import type { ReactNode } from 'react'

import { APP_VERSION, CHANGELOG } from '@shared/changelog'
import { systemProfile } from '@shared/domain/system'
import type { Settings } from '@shared/types'

export interface HelpPanelProps {
  settings: Settings
  /** Leva o usuário direto para a aba citada no texto. */
  onNavigate: (tab: 'count' | 'deviations' | 'drill' | 'history' | 'settings') => void
}

function Section({
  title,
  children,
  open = false
}: {
  title: string
  children: ReactNode
  open?: boolean
}) {
  return (
    <details
      open={open}
      className="rounded-lg border border-border bg-surface [&[open]>summary]:border-b [&[open]>summary]:border-border"
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-semibold marker:content-['']">
        {title}
      </summary>
      <div className="flex flex-col gap-2 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
        {children}
      </div>
    </details>
  )
}

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] font-semibold text-fg">{name}</dt>
      <dd className="text-[11px] leading-relaxed text-muted">{children}</dd>
    </div>
  )
}

function Link({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-fg underline decoration-border underline-offset-2 transition-colors duration-100 hover:decoration-fg"
    >
      {children}
    </button>
  )
}

/**
 * Manual do app.
 *
 * Mora dentro do programa, e não num README, porque quem precisa dele está com
 * o app aberto e uma dúvida específica — "o que é esse número" — e não vai
 * abrir o GitHub para descobrir. As seções nascem fechadas para que a lista de
 * títulos funcione como índice.
 */
export function HelpPanel({ settings, onNavigate }: HelpPanelProps) {
  const profile = systemProfile(settings.shoe.system)
  const decks = settings.shoe.deckCount
  const penetration = Math.round(settings.shoe.penetration * 100)

  return (
    <div className="flex flex-col gap-2">
      <Section title="Começando em 5 passos" open>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4">
          <li>
            Em <Link onClick={() => onNavigate('settings')}>Ajustes</Link>, diga como é a sua mesa:
            número de baralhos, penetração e se aceita rendição.
          </li>
          <li>
            Defina o valor da unidade e, se quiser risco de ruína, a banca. O bet spread padrão já
            serve para começar.
          </li>
          <li>
            Confira as teclas. O padrão é F1 (carta baixa), F2 (neutra), F3 (alta) e F4 (desfazer).
            Elas funcionam com o jogo em foco — é o ponto do app.
          </li>
          <li>
            Em <Link onClick={() => onNavigate('history')}>Sessões</Link>, clique em{' '}
            <b className="text-fg">Iniciar sessão</b>. Sem isso o app conta normalmente, mas não
            grava nada no histórico.
          </li>
          <li>
            Jogue. A cada carta que aparecer na mesa — inclusive as dos outros jogadores — aperte a
            tecla do grupo dela. Ao embaralhar, use <b className="text-fg">Novo shoe</b>.
          </li>
        </ol>
      </Section>

      <Section title="Os números da tela">
        <dl className="flex flex-col gap-2">
          <Term name="Running count">
            A soma bruta das cartas que você marcou. Carta baixa soma, carta alta subtrai. Sozinho
            ele não decide nada: +10 no começo de um shoe de 6 baralhos vale muito menos que +10 no
            fim, porque no começo aquele excesso está diluído em muito mais carta.
          </Term>
          <Term name="True count">
            O running count dividido pelos baralhos que ainda faltam. É este o número que decide
            aposta e jogada. Com {decks} baralho{decks === 1 ? '' : 's'}, um running de +6 com
            metade do sapato jogado dá true count +2.
          </Term>
          <Term name="Baralhos restantes">
            Quantos baralhos o app acha que sobraram, contando as cartas que você marcou. Se você
            deixar cartas passarem sem marcar, este número fica alto demais e o true count sai
            menor do que o real — você aposta menos do que deveria.
          </Term>
          <Term name="Penetração">
            Onde entra o cartão de corte, em porcentagem do sapato. Está em {penetration}%. É o
            parâmetro que mais muda o seu ganho: quanto mais fundo o dealer vai, mais tempo o count
            passa alto. Não muda o cálculo do true count; serve para a barra e para a simulação.
          </Term>
          <Term name="Bet (aposta)">
            Quantas unidades apostar no count atual, segundo o seu bet spread. Em unidades ou em
            dinheiro, conforme você configurar.
          </Term>
          <Term name="Vantagem">
            Sua margem estimada sobre a casa, em pontos percentuais. Negativa quer dizer que a casa
            está na frente — o normal na maior parte do sapato. Aproximação: 0,5% × (true count − 1).
          </Term>
          <Term name="EV">
            Quanto a mão atual vale, em média, com essa vantagem e essa aposta. É expectativa de
            longo prazo, não previsão da próxima mão.
          </Term>
          <Term name="Insurance (seguro)">
            Acende quando o count passa de +3, que é onde o seguro deixa de ser aposta ruim e vira
            aposta boa. É o desvio que mais vale dinheiro no Hi-Lo.
          </Term>
        </dl>
      </Section>

      <Section title="Configurar para o seu jogo">
        <p>
          <b className="text-fg">Baralhos</b> e <b className="text-fg">penetração</b> têm que bater
          com a mesa real. Se errar o número de baralhos, o true count sai errado desde a primeira
          carta.
        </p>
        <p>
          <b className="text-fg">Rendição</b> muda a estratégia básica de 15 e 16 contra carta alta.
          Ligue só se a sua mesa aceitar; com ela ligada a matriz mostra <b className="text-fg">R</b>{' '}
          nessas mãos.
        </p>
        <p>
          <b className="text-fg">Arredondamento do true count</b>: "para baixo" é o padrão da
          literatura e o lado conservador — TC 2,9 conta como 2. "Mais próximo" sobe a aposta um
          pouco antes.
        </p>
        <p>
          <b className="text-fg">Valor da unidade</b> é a sua aposta mínima. Todo o resto do app é
          múltiplo dela. <b className="text-fg">Banca</b> é o total que você separou para jogar — só
          serve para calcular risco de ruína e sugerir a unidade.
        </p>
        <p>
          <b className="text-fg">Sistema</b>: Hi-Lo é o padrão e tem tabela de desvios e modelo de
          vantagem. KO é mais fácil de contar (não divide por baralhos) mas não tem esses dois no
          app. Você está usando <b className="text-fg">{profile.label}</b>.
        </p>
      </Section>

      <Section title="Atalhos, perfis e NumLock">
        <p>
          Os atalhos são <b className="text-fg">globais</b>: funcionam com o jogo em foco, que é o
          motivo de o app existir. A contrapartida é que, enquanto estiverem ligados, essas teclas
          pertencem ao Counter no sistema inteiro. Desligue o toggle quando não estiver jogando.
        </p>
        <p>
          Os dígitos do numpad (num0–num9) só disparam com o <b className="text-fg">NumLock
          ligado</b>, e falham em silêncio com ele desligado — o Windows aceita registrar o atalho
          mesmo assim. Prefira as teclas de operador (+ − × ÷). O app avisa se você bindar numa
          tecla dessas.
        </p>
        <p>
          Três ações nascem sem tecla — refazer, novo shoe e overlay — porque cada atalho global
          custa a tecla no sistema inteiro. Atribua as que valerem a pena para você.
        </p>
        <p>
          Os <b className="text-fg">perfis</b> guardam jogos de teclas inteiros. Útil para trocar
          entre teclado com e sem numpad, ou entre notebook e mesa.
        </p>
      </Section>

      <Section title="Bet spread">
        <p>
          É a escada que diz quantas unidades apostar em cada faixa de count. Lê-se de cima para
          baixo: a primeira faixa cujo mínimo seja menor ou igual ao count atual é a que vale.
        </p>
        <p>
          A faixa <b className="text-fg">base</b> é a de baixo e não pode ser removida — é ela que
          responde quando o count está negativo.
        </p>
        <p>
          Spread maior ganha mais e oscila mais, e é o que chama atenção. O padrão 1-12 é um meio
          termo. Em <Link onClick={() => onNavigate('history')}>Sessões</Link> dá para ver o risco
          de ruína do seu spread com a sua banca.
        </p>
        <p>Cada sistema tem o seu spread: as escalas de Hi-Lo e KO não são comparáveis.</p>
      </Section>

      <Section title="Desvios e a matriz mão × dealer">
        <p>
          Estratégia básica é a jogada certa sem contagem. Alguns pares mão/carta do dealer mudam de
          resposta quando o count sobe ou desce — são os desvios, e os 22 mais valiosos são o
          Illustrious 18 e o Fab 4.
        </p>
        <p>
          A aba <Link onClick={() => onNavigate('deviations')}>Desvios</Link> tem duas leituras. A{' '}
          <b className="text-fg">lista</b> mostra só as exceções e quais estão valendo agora. A{' '}
          <b className="text-fg">matriz mão × dealer</b> é o chart completo: acha a sua mão na
          esquerda, a carta do dealer em cima, e a célula diz o que fazer no count atual.
        </p>
        <p>
          As letras são <b className="text-fg">P</b>edir, <b className="text-fg">F</b>icar,{' '}
          <b className="text-fg">D</b>obrar, <b className="text-fg">S</b>eparar e{' '}
          <b className="text-fg">R</b> (Cashout). Célula verde é jogada que a contagem mudou agora;
          o ponto cinza marca as células que a contagem pode mudar.
        </p>
        <p>
          Dobrar e separar valem só nas duas primeiras cartas. Se você já pediu carta, "dobrar" vira
          "pedir".
        </p>
      </Section>

      <Section title="Treino">
        <p>
          <b className="text-fg">No seu ritmo</b>: a carta troca quando você responde. Serve para
          fixar quais cartas são de cada grupo.
        </p>
        <p>
          <b className="text-fg">Velocidade</b>: a carta troca sozinha e não responder conta como
          erro. Serve para acompanhar o ritmo do dealer.
        </p>
        <p>
          <b className="text-fg">Contagem mental</b>: sem tecla nenhuma. Você só olha e soma de
          cabeça; no fim o app pergunta o running count. É o cenário da mesa — na vida real ninguém
          te corrige a cada carta, e um erro no meio some sem aviso.
        </p>
        <p>
          Enquanto o treino roda os atalhos globais ficam suspensos, então nada do treino entra no
          shoe de verdade.
        </p>
      </Section>

      <Section title="Sessões, banca e risco">
        <p>
          O histórico só grava com a <b className="text-fg">sessão iniciada</b>. É de propósito:
          teste de tecla, conferência de configuração e demonstração não podem virar estatística da
          sua banca.
        </p>
        <p>
          <b className="text-fg">N0</b> é quantas mãos você precisa jogar até o ganho esperado
          empatar com uma oscilação normal. Abaixo disso, resultado bom ou ruim não significa nada —
          e o N0 típico está na casa das dezenas de milhares de mãos.
        </p>
        <p>
          <b className="text-fg">Risco de ruína</b> é a chance de perder a banca inteira antes de o
          ganho aparecer. <b className="text-fg">Unidade sugerida</b> é a aposta base que traz esse
          risco para o alvo que você escolheu.
        </p>
        <p>
          A simulação usa a sua penetração e o seu spread de verdade. Ela não joga as mãos: serve
          para dimensionar banca, não para prever resultado.
        </p>
      </Section>

      <Section title="Overlay">
        <p>
          Uma janelinha por cima do jogo com os indicadores. Travada, o mouse atravessa ela e ela
          não rouba o foco. Destravada, dá para arrastar.
        </p>
        <p>
          O layout <b className="text-fg">mínimo</b> mostra só o count e a aposta, em corpo grande.
        </p>
        <p>
          <b className="text-fg">Limitação:</b> o overlay não aparece sobre jogos em fullscreen
          exclusivo (DirectX). Rode o jogo em janela ou borderless. Nesses casos o ícone da bandeja
          continua indicando o estado pela cor, com a contagem no tooltip.
        </p>
      </Section>

      <Section title="Se o app fechar sozinho">
        <p>
          O shoe em andamento é gravado em disco a cada carta. Ao reabrir, o app oferece de volta a
          contagem — mas só se ela for recente (até 6 horas) e do mesmo jogo. Contagem de ontem
          apareceria como número plausível e estaria errada.
        </p>
        <p>A pilha de desfazer não volta: ela é conveniência de digitação, não estado do jogo.</p>
      </Section>

      <Section title={`Versão ${APP_VERSION} e novidades`}>
        <p>
          O app se atualiza sozinho: quando sai uma versão nova, ele baixa em segundo plano e
          oferece o reinício — nunca no meio de uma mão, só quando esta janela estiver em foco.
        </p>
        <dl className="flex flex-col gap-2">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="flex flex-col">
              <dt className="text-[11px] font-semibold text-fg">
                {entry.version}
                <span className="ml-1.5 font-normal text-muted">{entry.date}</span>
              </dt>
              <dd>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-[11px] leading-relaxed text-muted">
                  {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Glossário rápido">
        <dl className="flex flex-col gap-2">
          <Term name="Shoe (sapato)">
            O conjunto de baralhos embaralhados juntos, do qual o dealer tira as cartas até o cartão
            de corte.
          </Term>
          <Term name="Cartão de corte">
            O marcador plástico que diz onde parar e reembaralhar. A posição dele é a penetração.
          </Term>
          <Term name="Unidade">Sua aposta base. Todo bet spread é medido em unidades.</Term>
          <Term name="Bucket">
            O grupo de cartas de mesmo valor na contagem. No Hi-Lo: 2-6 somam, 7-9 são neutras,
            10-A subtraem.
          </Term>
          <Term name="Index play / desvio">
            Jogada que muda em relação à estratégia básica quando o count passa de um valor.
          </Term>
          <Term name="IRC e pivô (só no KO)">
            O KO começa a contagem num número negativo (o IRC) para que o ponto de vantagem — o
            pivô — caia sempre em +4, seja qual for o número de baralhos.
          </Term>
          <Term name="Wonging / back-counting">
            Contar de fora e só sentar quando o count estiver alto. O app ajuda, mas quem decide
            quando entrar é você.
          </Term>
        </dl>
      </Section>
    </div>
  )
}
