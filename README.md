# Counter — contador de blackjack

App local (Electron) para contar cartas usando atalhos globais, sem tirar o foco
do jogo. Tem uma janela compacta e dois overlays opcionais que ficam por cima do
jogo: um com os indicadores da contagem, outro com a jogada correta para a mão
atual.

Além de contar, o app traz a estratégia correta para cada mão reagindo ao count
atual, três modos de treino, histórico de sessões e dimensionamento de banca por
simulação. Tem um manual completo dentro do próprio programa, na aba **Ajuda**.

## Rodar

```bash
npm install
```

```bash
npm run dev
```

Para gerar um instalador Windows em `release/`:

```bash
npm run build:win
```

## Publicar uma atualização

Quem já instalou não precisa baixar nada de novo — o app se atualiza sozinho
(veja [Atualizações](#atualizações)). Publicar é automático: o workflow
`.github/workflows/release.yml` roda a cada merge para `main` e lança a versão
que estiver no `package.json`. Para lançar uma versão, então, basta o commit:

1. suba a `version` no `package.json`;
2. escreva a entrada correspondente em `src/shared/changelog.ts` — o `npm test`
   falha se ela não existir, de propósito: é o que o usuário lê na Ajuda para
   saber o que acabou de receber;
3. faça o merge para `main`.

**O gatilho é a versão, não o merge.** Se o `package.json` continuar na versão
já publicada, o workflow não faz nada e ninguém é avisado — é assim de
propósito, porque o electron-updater só oferece atualização para uma versão
MAIOR que a instalada. Merge de ajuste que não sobe a versão não vira release;
ele entra na próxima.

O que o workflow faz, na ordem: confere se já existe release com a tag
`v<versão>` (se existe, para por aí), roda os testes, **cria a release como
rascunho**, empacota com `--publish always` e só então tira do rascunho.

Cada passo desses existe por um motivo:

- **o rascunho vem antes** porque, se a release não existir, o electron-builder
  sobe os artefatos em paralelo e cada publisher cria uma release própria com a
  mesma tag — o resultado são dois rascunhos, um com o `.exe` e outro só com o
  `.blockmap`, e um auto-update quebrado. Com o rascunho pronto, todos escrevem
  no mesmo lugar;
- **o `--publish always`** sobe o `.exe`, o `.blockmap` (usado no download
  diferencial) e o `latest.yml` — o arquivo que os apps instalados leem para
  descobrir que existe versão nova. Sem os três, o auto-update não enxerga a
  release;
- **tirar do rascunho é o último passo** porque, enquanto for draft, nenhum app
  instalado enxerga a atualização — o que também serve para esconder a release
  enquanto os artefatos ainda estão subindo.

Se um build falhar no meio, `workflow_dispatch` republica a mesma versão sem
precisar de commit vazio: a guarda olha o `isDraft`, então o rascunho encalhado
pela falha é reaproveitado em vez de bloquear a reexecução — só release já
publicada faz o workflow parar. Para conferir o estado depois de uma falha:
`gh api repos/diogolorenzo/blackjack-counter/releases`.

## Atalhos

O app não sabe qual carta você viu — ele só recebe a categoria:

| Tecla | Ação | Cartas (Hi-Lo) |
| --- | --- | --- |
| `F1` | +1 | 2, 3, 4, 5, 6 |
| `F2` | 0 | 7, 8, 9 |
| `F3` | −1 | 10, J, Q, K, A |
| `F4` | desfazer | corrige a última tecla |

Há mais quatro ações **sem tecla por padrão** — refazer, novo shoe,
mostrar/esconder overlay e mostrar/esconder o guia de jogada. Cada atalho global
custa a tecla no sistema inteiro, então elas só entram se você atribuir em
Ajustes. "Novo shoe" é a que mais poupa alt-tab no meio da mesa.

As teclas funcionam com o jogo em foco — é o ponto do app. Enquanto os atalhos
estiverem ligados, elas pertencem ao Counter no sistema inteiro; desligue no
toggle "Atalhos globais" quando não estiver jogando.

Em Ajustes há três perfis prontos e cada tecla pode ser regravada
individualmente:

- **Teclas F** (padrão) — tecla única, funciona em qualquer teclado.
- **Numpad** — usa `+` `−` `*` `/`, não os dígitos. Os dígitos do numpad
  (`num0`-`num9`) **só disparam com o NumLock ligado**, e falham em silêncio com
  ele desligado, porque o Windows aceita registrar o atalho mesmo assim. As
  teclas de operador não têm esse problema.
- **Ctrl+Shift** — mais lento de digitar, mas não toma nenhuma tecla do sistema.

Há também **três perfis** para salvar os seus próprios jogos de teclas, com nome
editável. Guardam as oito ações, inclusive as opcionais — úteis para alternar
entre teclado com e sem numpad, ou entre o notebook e a mesa de casa.

### Confirmação de tecla

Com o jogo em foco não existe outra prova de que a tecla chegou, e uma tecla
perdida corrompe o shoe inteiro em silêncio. Em Ajustes dá para ligar:

- **Som** — um tick curto com tom diferente por bucket (agudo = carta baixa,
  grave = carta alta), então o ouvido sozinho já diz para que lado foi.
- **Pulso visual** — uma piscada de 220 ms na borda, feita para a visão
  periférica e não para disputar atenção com a mesa.
- **Som no treino** — separado do som de jogo, porque no treino o áudio responde
  "certo ou errado" e faz sentido mesmo para quem joga no silêncio.

## Overlay de jogada

Além do overlay de contagem, há um segundo overlay que responde a pergunta que
o primeiro não responde: **o que fazer com esta mão**. Ele lê o mesmo count e
tem dois modos:

- **Guia** (padrão) — só o que a contagem mudou agora: os desvios que estão
  valendo, o estado do seguro e qual índice vira em seguida.
- **Matriz** — o chart completo, mão × carta do dealer, com as células que a
  contagem mudou em destaque.

No KO os dois modos mostram **estratégia básica**, sem índices: os números
publicados são de Hi-Lo e a escala do KO é outra, então aplicá-los ali daria
conselho errado com cara de certo.

Liga em Ajustes, pela bandeja, pelo botão "Jogada" na aba Contagem ou por uma
tecla, se você atribuir uma.

### Mover e redimensionar

Os dois overlays nascem **travados**, o que os torna click-through: o clique
atravessa para o jogo. Destrave em Ajustes para posicionar — aí a janela ganha
uma alcinha no topo (arrastar) e uma alça no canto inferior direito
(redimensionar) — e trave de volta quando estiver do jeito que você quer.

O tamanho arrastado tem prioridade sobre os três presets. Clicar num preset
descarta o tamanho arrastado e volta para ele.

## Sistemas de contagem

**Hi-Lo** (padrão) é balanceado: um shoe contado inteiro fecha em zero, e por
isso dá para dividir pelo número de baralhos restantes.

```
true count = running count / baralhos restantes
```

Os baralhos restantes têm piso de 0,25 para o valor não explodir no fim do
shoe. O arredondamento padrão é para baixo, inclusive no negativo
(`-1,2` vira `-2`), que é o lado conservador e o padrão da literatura Hi-Lo.

**KO (Knock-Out)** é desbalanceado: o 7 vale +1, então o shoe não fecha em zero e
não se divide por baralhos. Em troca, o running count começa num IRC de
`4 − 4×baralhos`, que faz o pivô cair sempre em **+4** qualquer que seja o
número de baralhos. No KO o app mostra a distância até o pivô no lugar do true
count, e a rampa de aposta é escrita em torno dele.

Cada sistema guarda o **seu próprio bet spread**: as escalas são incomparáveis
(true count ±5 contra running count −20..+8) e reaproveitar um no outro daria
aposta errada.

O selo `INSURANCE` acende a partir de +3 no número de decisão de cada sistema.

### Vantagem e EV

No Hi-Lo o app estima a vantagem por `edge ≈ 0,5% × (TC − 1)` — a casa tem ~0,5%
num 6D S17 DAS com estratégia básica, e cada ponto de true count devolve ~0,5%.
O EV mostrado ao lado da aposta é essa vantagem aplicada à aposta em vigor.

O KO não tem esse número: a aproximação depende de tabela de pivô por número de
baralhos, e chutar ali seria inventar dinheiro. A aba de desvios e o
dimensionamento de banca também ficam indisponíveis no KO, pelo mesmo motivo.

## Estratégia e desvios

A aba **Desvios** tem duas leituras do mesmo count, escolhidas em Ajustes ou no
seletor da própria aba:

**Lista** — os 22 desvios do Illustrious 18 + Fab 4, ordenados por proximidade
de ativação, com os que estão valendo agora em destaque. É a leitura de quem já
sabe a estratégia básica e só precisa das exceções.

**Mão × dealer** — o chart completo. Acha a sua mão na coluna da esquerda, a
carta do dealer em cima, e a célula diz o que fazer **no count atual**. As
letras são **P**edir, **F**icar, **D**obrar, **S**eparar e **R**ender. Célula
verde é jogada que a contagem mudou agora; o ponto cinza marca as células que a
contagem pode mudar. Tocar numa célula mostra o índice dela e quanto falta para
a próxima mudança.

A base é 6 baralhos, S17, DAS. A **rendição tardia** é uma configuração, porque
é a única regra que faz a tabela básica e os índices publicados discordarem: com
rendição, 16 vs 10 rende abaixo de TC 0 e para a partir de 0; sem rendição, vira
o Illustrious 18 puro. Algumas células têm mais de um índice — 15 vs 10 passa
por pedir, render (a partir de 0) e parar (a partir de +4) conforme o count sobe.

Regras diferentes deslocam alguns índices em até um ponto. Confira contra a sua
mesa.

## Treino

A aba **Treino** dá as cartas e confere a sua resposta — é o contrário do jogo,
onde quem sabe a carta é você. São três modos:

- **No seu ritmo** — a carta troca quando você responde. Fixa quais cartas são
  de cada grupo.
- **Velocidade** — a carta troca sozinha, de 30 a 180 cartas por minuto; não
  responder conta como erro. Treina acompanhar o dealer.
- **Contagem mental** — sem tecla nenhuma. Você só olha e soma de cabeça; no fim
  o app pergunta o running count e compara. É o cenário da mesa: na vida real
  ninguém te corrige a cada carta, e um erro no meio some sem aviso.

Com o som ligado, cada resposta toca acerto ou erro, carta perdida tem tom
próprio e o modo mental marca o ritmo com uma batida seca.

Toda carta nova entra com uma animação curta, um traço no topo do quadro e o
fundo alternando de tom. É proposital: duas cartas iguais seguidas (um 7 depois
de outro 7) parecem a mesma carta parada na tela, e o jogador para de contar sem
perceber.

No fim: precisão, erros, ritmo, tempo médio de reação e o running count que você
produziu contra o correto.

Enquanto o treino roda, os atalhos globais ficam suspensos — sem isso cada tecla
do treino também entraria na contagem real.

## Sessões e banca

O histórico só grava com a **sessão iniciada** — há um botão para isso no topo
da aba. É de propósito: teste de tecla, conferência de configuração e
demonstração não podem virar estatística da sua banca. Sem sessão o app conta
normalmente, só não registra nada, e a aba fica marcada com um ponto de atenção.

Com a sessão aberta, cada "Novo shoe" encerra o shoe atual e grava um registro:
duração, cartas, pico e vale do count, tempo em vantagem e a contagem de
fechamento. Os registros aparecem agrupados por sessão. Num sistema
balanceado, fechamento diferente de zero significa carta perdida ou erro — o app
marca esses shoes.

O resultado financeiro de cada shoe é opcional e editável a qualquer momento.

O **dimensionamento de banca** simula milhares de rodadas com a sua penetração e
o seu spread para responder o que uma tabela genérica não responde:

- frequência de cada true count e aposta média;
- EV por mão e por hora, e desvio padrão por hora;
- **N0** — mãos até o EV acumulado empatar com um desvio padrão, ou seja, quando
  o resultado começa a significar alguma coisa;
- **risco de ruína** para a banca informada, e a unidade que atinge o risco alvo.

O modelo usa `edge ≈ 0,5% × (TC − 1)` e variância 1,32 por unidade apostada. As
mãos não são jogadas: serve para dimensionar banca, não para prever resultado.

## Overlay

Ativado pelo botão na janela principal, pelo ícone na bandeja ou por atalho.
Travado, o mouse atravessa ele (click-through) e ele não rouba foco do jogo.
Destravado, dá para arrastar pela alcinha no topo e redimensionar pela alça no
canto inferior direito; a posição e o tamanho arrastados têm prioridade sobre o
canto e o preset escolhidos — mexer num dos dois nos ajustes descarta o que foi
arrastado.

Ajustável: tamanho (P/M/G, ou livre pela alça), opacidade e layout. O layout
**mínimo** mostra só o número de decisão e a aposta, em corpo grande, para quem
quer um número e nada mais.

**Limitação:** o overlay não aparece sobre jogos em *fullscreen exclusivo*
(DirectX). Rode o jogo em janela ou em borderless/fullscreen-windowed. Essa é
uma restrição do Windows, não do app. Nesse caso o ícone da bandeja continua
mostrando o estado: cinza (atalhos desligados), azul (armado), verde (em
vantagem) e vermelho (shoe estourado), com a contagem no tooltip.

## Ajuda dentro do app

A aba **Ajuda** é o manual completo: guia de primeiros passos, o que cada número
da tela significa, como configurar para o seu tipo de mesa, como ler o bet
spread e a matriz, o que é N0 e risco de ruína, e um glossário. Mora dentro do
programa porque quem precisa dele está com o app aberto e uma dúvida
específica — e não vai abrir o GitHub para descobrir.

## Acessibilidade

A paleta "Daltonismo" (Ajustes → Aparência) troca o par verde/vermelho por
azul/laranja/amarelo (Okabe-Ito). Verde e vermelho são justamente as duas cores
que somem em deuteranopia e protanopia — e são os dois estados que mais importam
aqui, "a contagem está a favor" e "está contra".

A moeda também é configurável (BRL, USD, EUR, GBP).

## Recuperação de sessão

O shoe em andamento é gravado em disco a cada carta. Se o app fechar sem aviso —
crash, queda de energia, `alt+F4` sem querer — a contagem volta ao abrir, com um
aviso para você confirmar ou descartar.

Só volta se for **recente** (até 6 horas) e do **mesmo jogo** (mesmo sistema e
mesmo número de baralhos). Contagem de ontem apareceria como número plausível e
estaria errada, que é o modo de falha que este app inteiro tenta evitar.

A pilha de desfazer não é persistida: ela é conveniência de digitação, não estado
do jogo.

## Atualizações

A versão instalada e a lista do que mudou em cada uma aparecem na aba **Ajuda**,
alimentadas por `src/shared/changelog.ts`. A versão exibida é injetada do
`package.json` no build, não mantida à mão — número de versão errado na tela é
pior que número nenhum.

O app checa as Releases do GitHub 10 s depois de abrir, a cada 30 min, e também
sempre que a janela principal ganha foco (com um piso de 5 min entre checagens,
para o alt-tab de sempre não virar uma rajada de requisições) — ele fica dias na
bandeja, então rechecar com frequência é o que mantém a instalação em dia. O
download acontece em segundo plano e é diferencial: uma versão nova não baixa os
100 MB de novo, só os blocos que mudaram.

Não existe mais diálogo nativo do Windows para isso. Enquanto baixa, uma pílula
discreta aparece no rodapé da janela principal com o progresso; pronta, ela
troca para um botão "Reiniciar", que reinstala em silêncio e reabre o app. A
pílula é passiva — não interrompe, não rouba foco e pode ser dispensada no ×,
que só esconde aquela pendência: a atualização já baixada entra sozinha no
próximo fechamento de verdade (pela bandeja), dispensada ou não.

Falha de rede não vira popup: sem internet o app abre e conta normalmente.

Em desenvolvimento (`npm run dev`) nada disso roda — não há app empacotado para
atualizar. Para conferir o visual da pílula sem publicar uma release, a env var
`COUNTER_FAKE_UPDATE` liga um updater de mentira que percorre os mesmos estados
(baixando 0..100 -> pronta), pela mesma `visibleStatus` da versão real:

```bash
COUNTER_FAKE_UPDATE=1 npm run dev       # anuncia a versão de fachada 9.9.9
COUNTER_FAKE_UPDATE=0.5.0 npm run dev   # anuncia a versão que você quiser
```

A pílula aparece 1,5 s depois da janela e leva ~7 s até "pronta". Nesse modo o
botão "Reiniciar" não reinstala nada — em dev não há o que instalar; ele
recomeça o ciclo, para rever a animação sem reabrir o app.

## Onde ficam os arquivos

```
%APPDATA%\counter\settings.json   configurações
%APPDATA%\counter\session.json    shoe em andamento
%APPDATA%\counter\history.json    shoes encerrados
```

Arquivo corrompido ou de versão antiga não impede o app de abrir: os campos
inválidos caem para o padrão e o que faltar é preenchido. Settings da versão
anterior, com um único `betSpread`, migram sozinhas para o spread de Hi-Lo.

A sessão em si vive só em memória: ela marca "estou jogando de verdade agora", e
sobreviver a um reinício faria o app continuar gravando estatística de uma
sessão já abandonada.

## Verificação

```bash
npm test
```

```bash
npm run build
```

`build` roda o typecheck dos dois projetos (main/preload e renderer) antes de
empacotar. O mesmo par roda no CI a cada push, em `windows-latest`.
