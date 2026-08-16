# Counter — contador Hi-Lo de blackjack

App local (Electron) para contar cartas pelo sistema Hi-Lo usando atalhos
globais, sem tirar o foco do jogo. Tem uma janela compacta e um overlay
opcional que fica por cima do jogo mostrando só os indicadores.

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

## Atalhos

O app não sabe qual carta você viu — ele só recebe a categoria Hi-Lo:

| Tecla | Ação | Cartas |
| --- | --- | --- |
| `F1` | +1 | 2, 3, 4, 5, 6 |
| `F2` | 0 | 7, 8, 9 |
| `F3` | −1 | 10, J, Q, K, A |
| `F4` | desfazer | corrige a última tecla |

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

## Contagem

`Running count` é a soma bruta. `True count` é o que decide a aposta:

```
true count = running count / baralhos restantes
```

Os baralhos restantes têm piso de 0,25 para o valor não explodir no fim do
shoe. O arredondamento padrão é para baixo, inclusive no negativo
(`-1,2` vira `-2`), que é o lado conservador e o padrão da literatura Hi-Lo.

O bet spread padrão é 1-12 unidades para 6 baralhos e é editável faixa a faixa.
O selo `INSURANCE` acende com true count ≥ +3.

## Overlay

Ativado pelo botão na janela principal ou pelo ícone na bandeja. Travado, o
mouse atravessa ele (click-through) e ele não rouba foco do jogo. Destravado,
dá para arrastar; a posição arrastada tem prioridade sobre o canto escolhido —
clicar num canto nos ajustes descarta a posição arrastada.

**Limitação:** o overlay não aparece sobre jogos em *fullscreen exclusivo*
(DirectX). Rode o jogo em janela ou em borderless/fullscreen-windowed. Essa é
uma restrição do Windows, não do app.

## Onde ficam as configurações

```
%APPDATA%\counter\settings.json
```

Arquivo corrompido ou de versão antiga não impede o app de abrir: os campos
inválidos caem para o padrão e o que faltar é preenchido.

## Verificação

```bash
npm test
```

```bash
npm run build
```

`build` roda o typecheck dos dois projetos (main/preload e renderer) antes de
empacotar.
