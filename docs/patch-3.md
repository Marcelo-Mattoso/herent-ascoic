# Patch 3 — Reformulação da UI: layout tabuleiro

Este patch substitui o layout de UI definido nos Patches 1 e 2 por um novo formato inspirado em jogos de cartas digitais (referência: Hearthstone), com **dois blocos visuais distintos**: o tabuleiro coletivo e o painel do herói em foco.

Para o Sonnet: este documento é a **referência primária** sobre tudo relacionado à UI da tela de Exploração. Substitui as descrições anteriores de "Bloco 1 a Bloco 6" da tela de Exploração no spec de telas. O resto dos documentos (regras de jogo, motor, state, reducer) **continua válido**.

Acompanha o arquivo `wireframe-tabuleiro-v3.html` (referência visual canônica).

---

## Resumo executivo das mudanças

| # | Mudança | Impacto |
|---|---|---|
| 1 | Layout vira "tabuleiro + painel do herói em foco" (dois blocos) | Alto — refaz toda a tela de Exploração |
| 2 | Pilhas nas laterais (não mais empilhadas no topo) | Médio — reposiciona painel de pilhas |
| 3 | Sala da masmorra dentro do tabuleiro, no topo central | Médio — sala não é mais painel separado |
| 4 | Linha divisória explícita entre criaturas (cima) e heróis (baixo) | Médio — nova marcação visual |
| 5 | Itens equipados como mini-cartas embaixo de cada herói | Médio — substitui slots verticais grandes |
| 6 | Barras de vida visuais em todas as cartas | Baixo — adiciona elemento visual |
| 7 | Cards de herói pequenos pra caber 8 lado a lado | Alto — muda dimensões e densidade |
| 8 | Footer do tabuleiro consolida info do grupo | Alto — XP, Despertar, Artefatos, Condição unidos |
| 9 | Painel inferior dedicado ao herói em foco | Alto — separação clara grupo vs indivíduo |
| 10 | Drag-and-drop herói → criatura para atacar | Alto — nova interação primária |
| 11 | Opções de gasto de XP saem do inline e viram modal | Baixo — já era modal previsto |

---

## Mudança 1 — Estrutura geral em dois blocos

### Decisão

A tela de Exploração é composta por **dois blocos visuais grandes**, empilhados verticalmente:

```
┌─ Barra de status topo (XP·Sala·Condição·Regras·Log) ─┐

┌─────────────────────────────────────────────────────┐
│  TABULEIRO                                          │
│  (pilhas + arena central + footer do grupo)         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  PAINEL DO HERÓI EM FOCO                            │
│  (stats + habilidade + poder + mochila + ações)     │
└─────────────────────────────────────────────────────┘
```

### Conceitos
- **Tabuleiro** = estado coletivo da partida (o que todos veem e que vale pra todos).
- **Painel do herói em foco** = ação individual (o que esse herói específico pode fazer).

Quando o jogador clica em outro herói no tabuleiro, o painel inferior **inteiro troca** para refletir o novo herói em foco.

---

## Mudança 2 — Estrutura interna do tabuleiro

O tabuleiro tem layout em 3 colunas (pilha esquerda · arena central · pilha direita) com um footer integrado embaixo:

```
┌─ TABULEIRO ─────────────────────────────────────────┐
│                                                     │
│  ┌──────┐  ┌── Sala (carta) ──┐         ┌──────┐    │
│  │      │  └──────────────────┘         │      │    │
│  │ deck │  ┌─ Criaturas (cima) ─┐       │ itens│    │
│  │ masm.│  │  goblin  esq  ara  │       │      │    │
│  │      │  └────────────────────┘       │      │    │
│  ├──────┤  ··· linha de combate ···     ├──────┤    │
│  │ deck │  ┌─ Heróis (baixo)  ──┐       │      │    │
│  │ mons.│  │ B P L M C A D Mo   │       │artef.│    │
│  └──────┘  │ ▼ ▼ ▼ ▼ ▼ ▼ ▼ ▼   │       └──────┘    │
│            │ itens equipados    │                   │
│            └────────────────────┘                   │
│                                                     │
│  ──────────────────────────────────────────────     │
│  XP·Despertar·Artefatos do grupo·Condição           │
└─────────────────────────────────────────────────────┘
```

### Pilhas laterais (esquerda e direita)

- **Esquerda**: relacionada à masmorra
  - Deck de Masmorra (cartas de sala)
  - Deck de Monstros
- **Direita**: relacionada a recompensas
  - Deck de Tesouros (itens)
  - Deck de Artefatos

Cada pilha mostra:
- Visual de 3 retângulos sobrepostos (largura ~21px, altura ~31px, cores escalonadas #5F5E5A, #888780, #B4B2A9).
- Nome da pilha em fonte pequena.
- Contagem (ex: "14·3" = 14 no deck, 3 no descarte).

### Sala atual

- Renderizada como um **card horizontal** centralizado no topo da arena (~200px largura).
- Tem arte placeholder mini à esquerda + nome, saídas, XP, indicador de Despertar (5 traços de cor com o atual destacado), e a cor atual em texto.
- **A sala não é um painel separado** como antes; vive dentro do tabuleiro.

### Criaturas (acima da linha de combate)

- Em fileira horizontal, centralizada.
- Cards mini (~88px largura).
- Cada card: arte placeholder, nome (em peso 500), barra de vida horizontal, e linha com vida atual + acerto + dano.
- **Estados visuais**:
  - **Disponível para alvo**: borda normal, totalmente opaco.
  - **Selecionada como alvo válido**: borda destacada (1.5px, cor info).
  - **Engajada por outro herói nesta rodada**: opacidade ~0.55, sem borda destacada.
  - **Derrotada**: removida do tabuleiro.

### Linha de combate

- **Linha tracejada horizontal** atravessando o tabuleiro entre as criaturas e os heróis.
- Label centralizado "Linha de combate" em fonte pequena, sobre fundo branco para "cortar" a linha visualmente.
- Função: separar visualmente domínio da masmorra (em cima) do domínio do jogador (embaixo). É o lugar onde o drag-and-drop atravessa.

### Heróis (abaixo da linha de combate)

- Em fileira horizontal de **até 8 cards mini** (~64px largura cada).
- Cada card: arte placeholder, primeiro nome (até ~7 caracteres), barra de vida horizontal, e vida atual/máxima embaixo.
- **Estados visuais**:
  - **Em foco (clicado pelo jogador)**: borda azul destacada (1.5px).
  - **Disponível para agir nesta rodada**: borda normal, totalmente opaco.
  - **Já agiu nesta rodada**: opacidade ~0.65.
  - **Crítico (vida ≤ 25%)**: opacidade ~0.55, barra de vida vermelha.
  - **Derrotado**: removido do tabuleiro (vai para `defeatedHeroes`).
  - **Fugiu**: removido do tabuleiro.
- **Imediatamente embaixo do card**, uma fileira de **4 mini-cartas** representando os 4 slots de equipamento (Equipável, Utilitário, Consumível, Especial). Cada mini-carta tem ~12×16px, com cor de fundo conforme o tipo de slot. Slots vazios com borda tracejada. Tooltip nativo no hover mostra nome + efeito do item.

### Footer do tabuleiro

Borda superior separadora (0.5px). Grid em 4 colunas com gap 16px, alinhamento `center`:

| Coluna | Conteúdo |
|---|---|
| 1 | XP do grupo (label pequeno + número grande, 18px peso 500) |
| 2 | Despertar (label + 5 traços de cor com atual destacado + texto da cor) |
| 3 | Artefatos do grupo (label "X/N" + chips de artefatos + slot tracejado "falta N") |
| 4 | Condição do chefe (label + texto: "2 Artefatos (1/2)") |

---

## Mudança 3 — Painel do herói em foco

### Estrutura

Bloco separado abaixo do tabuleiro, com seu próprio background e borda:

```
┌─ PAINEL DO HERÓI EM FOCO ─────────────────────────┐
│  ┌──────┐   Herói em foco · clique outro p/ trocar │
│  │ arte │   Vida · Acerto · Dano · Dados  [Ímpeto] │
│  │ nome │   ━━━━━━━━━━━━━━━━ barra de vida ━━━━━  │
│  └──────┘   ┌─ Habilidade ┐  ┌─ Poder ┐            │
│             │   ativa     │  │ dispon │            │
│             └─────────────┘  └────────┘            │
│                                                    │
│  Mochila do Bárbaro · 2 itens                      │
│  [chip Escudo Rachado] [chip Tocha]                │
│                                                    │
│  [Atacar] [Usar item] [Usar poder] [Passar rodada] │
└────────────────────────────────────────────────────┘
```

### Subseções

**Mini-card do herói (esquerda, ~90px)**
- Arte placeholder + nome completo.
- Serve como "identidade visual" do que o painel representa.

**Header com stats (direita)**
- Linha 1: label "Herói em foco · clique em outro herói para trocar" + label "Ímpeto" à direita.
- Linha 2 (grid 2 colunas):
  - Esquerda: 4 stats em linha — Vida {atual/max} · Acerto +N · Dano N · Dados Nd6.
  - Direita: 5 traços coloridos de Ímpeto (mesmo padrão do Despertar).
- Linha 3: **Barra de vida grande** (~8px altura, com borda), preenchida na proporção atual.

**Habilidade e Poder (grid 2 colunas embaixo do header)**
- Cada um em painel pequeno (fundo `var(--bg-secondary)`, padding 6×8).
- Label com ícone (📖 ou ⚡) + nome ("Habilidade" / "Poder") + badge de estado:
  - Habilidade: "ativa" (verde, fundo #EAF3DE / texto #3B6D11) ou "inativa" (cinza).
  - Poder: "disponível" (branco com borda) ou "usado neste combate/sala/jogo" (cinza).
- Texto do efeito embaixo, em fonte 10px line-height 1.4.

**Mochila**
- Label "🎒 Mochila do {nome do herói} · N itens".
- Lista horizontal de chips. Cada chip: mini-tile colorido do tipo de slot + nome do item + tipo entre parênteses em cinza pequeno.
- Tooltip nativo no chip mostra efeito completo.
- Se vazia: texto "vazia" em cinza terciário.

**Botões de ação**
- 4 botões em linha, igualmente espaçados (gap 6px), padding 7×10px:
  - **Atacar (arraste o herói)** — botão primário com cor info (fundo `var(--bg-info)`, borda `var(--border-info)`, texto info).
  - **Usar item** — neutro.
  - **Usar poder** — neutro.
  - **Passar a rodada** — neutro.
- Estados desabilitados (quando ação não é válida no momento): opacidade 50%.

---

## Mudança 4 — Mecânica de drag-and-drop

### Decisão

A interação primária de combate é **arrastar um card de herói até um card de criatura**.

### Fluxo

1. **Selecionar herói**: jogador pode (a) clicar no card de herói → muda foco, ou (b) começar a arrastar o card → inicia o pareamento.
2. **Arrastar**: durante o drag, herói "flutua" seguindo o cursor. Criaturas válidas como alvo ficam **destacadas** (borda info + leve brilho). Criaturas inválidas (engajadas ou mortas) ficam **atenuadas**.
3. **Soltar sobre criatura válida**: cria o par, transita para resolução do combate, rola dados, aplica dano. Tudo automaticamente.
4. **Soltar em local inválido**: cancela o drag, herói volta para sua posição.

### Implementação técnica

Sugestão: usar **HTML5 Drag and Drop API** nativa do navegador. Não precisa de biblioteca externa. Eventos relevantes:
- `dragstart` no card de herói (inicia, marca herói como selecionado, dispara `CHOOSE_HERO_FOR_ROUND`).
- `dragover` / `dragenter` nos cards de criatura (destacam alvos válidos).
- `drop` no card de criatura (dispara `CHOOSE_TARGET` + sequência de resolução).
- `dragend` (cleanup, cancela seleção se não houve drop válido).

Alternativa: se HTML5 nativo gerar problemas (já é conhecido por inconsistências entre browsers), considerar **react-dnd** ou **@dnd-kit/core** como biblioteca leve. Decisão: **começar com HTML5 nativo no MVP 1** e migrar se necessário. Documentar como decisão revisível.

### Compatibilidade com botão "Atacar"

O botão "Atacar (arraste o herói)" no painel de ações:
- Em desktop com mouse: serve como **indicador visual** do que fazer. Não precisa clicar — basta arrastar.
- Pode também funcionar como **fallback**: clicar nele abre fluxo de "clique no alvo" (compatível com toque/teclado). No MVP 1, **opcional**.

### Decisões pendentes

- **Teclado/acessibilidade**: drag-and-drop puro não é acessível. Fluxo alternativo (clique-clique) é recomendável mas pode ficar pra MVP 2.
- **Mobile/touch**: HTML5 drag não funciona bem em touch. Se for portar pra mobile, precisa biblioteca específica ou refazer interação.

---

## Mudança 5 — Estados visuais resumidos

### Cards de herói

| Estado | Visual |
|---|---|
| Disponível, sem foco | Borda 0.5px tertiary, opacidade 1 |
| **Em foco** | Borda 1.5px info |
| Já agiu nesta rodada | Opacidade 0.65 |
| Crítico (vida ≤ 25%) | Opacidade 0.55, barra de vida vermelha |
| Derrotado | Removido do tabuleiro |
| Fugiu | Removido do tabuleiro |

### Cards de criatura

| Estado | Visual |
|---|---|
| Disponível para alvo | Borda 0.5px tertiary, opacidade 1 |
| **Alvo selecionável (hover/drag)** | Borda 1.5px info |
| Engajada por outro herói nesta rodada | Opacidade 0.55, sem destaque |
| Derrotada | Removida do tabuleiro |

### Mini-tiles de equipamento

| Estado | Visual |
|---|---|
| Equipável ocupado | Fundo amarelo (#FAC775), borda âmbar |
| Utilitário ocupado | Fundo verde claro (#C0DD97), borda verde |
| Consumível ocupado | Fundo azul claro (#B5D4F4), borda azul |
| Especial ocupado | Fundo rosa (#ED93B1), borda rosa |
| Vazio (qualquer tipo) | Fundo `var(--bg-secondary)`, borda tracejada tertiary |

### Barras de vida

| Vida atual / máxima | Cor |
|---|---|
| > 50% | Verde (#3B6D11) |
| 25-50% | Âmbar (#BA7517) |
| < 25% | Vermelho (#A32D2D) |

---

## Mudança 6 — Implicações nos componentes React

### Componentes que mudam ou são novos

| Componente | Status | Notas |
|---|---|---|
| `Board.tsx` | **NOVO** | Container do tabuleiro. Renderiza pilhas, sala, criaturas, linha de combate, heróis, footer do grupo. |
| `HeroFocusPanel.tsx` | **NOVO** | Painel inferior. Renderiza mini-card, stats, habilidade, poder, mochila, ações. |
| `Stack.tsx` | **NOVO** | Visual de pilha de cartas (3 retângulos sobrepostos + nome + contagem). |
| `RoomCard.tsx` | Modificado | Layout horizontal mini com Despertar embutido. |
| `HeroCard.tsx` | Modificado | Layout mini (~64px), com barra de vida horizontal. Variantes: focused, acted, critical. |
| `EnemyCard.tsx` | Modificado | Layout mini (~88px), com barra de vida horizontal. Variantes: engaged, selectable. |
| `ItemTile.tsx` | **NOVO** | Mini-tile colorido representando 1 slot de equipamento. Props: type (equip/util/consum/special), filled, item (opcional). |
| `ItemChip.tsx` | **NOVO** | Chip de item da mochila: tile + nome + tipo. |
| `BoardFooter.tsx` | **NOVO** | Footer do tabuleiro com info do grupo. |
| `ActionBar.tsx` | Modificado | Movido para dentro do HeroFocusPanel. |
| `ColorBar.tsx` | Mantido | 5 traços de cor com atual destacado. Já existia. |
| `HpBar.tsx` | **NOVO** | Barra de vida horizontal com cor baseada em proporção. |
| `Exploration.tsx` | Modificado | Compõe `<TopBar />`, `<Board />`, `<HeroFocusPanel />`. |

### Componentes que saem ou diminuem de escopo

- O **Bloco 6 antigo** (painel grande de heróis com layouts A/B/C dependendo da contagem) **desaparece** — agora todos os layouts colapsam num único formato compacto que cabe 1 a 8 heróis.
- O **DicePanel** continua, mas vai ser sobreposto/integrado durante a fase `resolving` do combate. Não tem mais espaço fixo — aparece como overlay quando a rolagem acontece.

---

## Mudança 7 — Implicações no fluxo de combate (revisão do Patch 2)

As 6 fases do combate (`selecting_hero`, `selecting_target`, `resolving`, `between_heroes`, `direct_damage`, `round_end`) **continuam válidas**, mas o que cada fase mostra na UI muda:

### `selecting_hero`
- Heróis disponíveis: opacidade total, cursor grab.
- Heróis que já agiram: opacidade 0.65, cursor default.
- Criaturas: visíveis mas não interagíveis.
- Painel de ações no `HeroFocusPanel`: mostra botões mas todos desabilitados exceto "Passar a rodada".

### `selecting_target` (inicia quando drag começa OU quando jogador clica em herói)
- Herói selecionado: borda info destacada.
- Criaturas válidas: borda info destacada quando arrastando, ou normal aguardando clique.
- Painel de ações: botões agora ativos para o herói selecionado.

### `resolving`
- Tabuleiro fica "congelado" visualmente.
- Painel sobreposto/modal central mostra rolagem: dados, bônus discriminados, total final, resultado.
- Botão "Continuar" avança.

### `between_heroes`
- Transição rápida, sem UI específica.
- Volta para `selecting_hero` automaticamente.

### `direct_damage`
- Monstros sem oponente "atacam" um por um.
- Para cada ataque: highlight do monstro + highlight do herói atingido + mensagem rápida ("Goblin causou 2 de dano a Maga").
- Botão "Continuar" entre cada um, ou rolagem automática se preferir.

### `round_end`
- Mensagem rápida "Fim da rodada".
- Limpa estados temporários, volta pra `selecting_hero` ou termina combate.

---

## Mudança 8 — Modais ainda relevantes

Os modais especificados no Patch 1 continuam válidos:

- **Modal de Detalhes de carta** — abre ao clicar em qualquer card (herói, criatura, sala, item, artefato).
- **Modal de Gasto de XP** — abre automaticamente entre salas, ou ao clicar no número de XP no footer do tabuleiro.
- **Modal de Abertura de caminhos** — abre após o gasto de XP, mostra cartas de sala reveladas.
- **Modal de Recompensa** — abre após combate, para cada item/artefato recebido.
- **Modal de Deck esgotado** — abre quando deck de dungeon precisa ser sacado mas está vazio.

---

## Como aplicar este patch (instruções para o Sonnet)

### Se ainda não começou a implementar a UI (Marcos 1-6 OK ou em curso)

Use o `wireframe-tabuleiro-v3.html` como referência visual canônica e ignore o `wireframe-exploracao.html` antigo (que refletia o layout vertical empilhado).

No Marco 7 (UI):

**Sessão 7A — Componentes reutilizáveis (revisar lista):**
- Adicionar: `Stack`, `ItemTile`, `ItemChip`, `HpBar`, `BoardFooter`.
- Modificar: `HeroCard`, `EnemyCard`, `RoomCard` para versões mini conforme Patch 3.
- Remover: variantes A/B/C de layout grande do herói (não existe mais).

**Sessão 7B — Telas principais:**
- Reescrever `Exploration.tsx` compondo `<TopBar />`, `<Board />`, `<HeroFocusPanel />`.
- Implementar drag-and-drop HTML5 nativo entre `HeroCard` e `EnemyCard`.

**Sessão 7C — Modais e fluxos:**
- Sem mudanças — modais continuam como especificados no Patch 1.

### Se já implementou parte da UI antiga

Refatore a tela de Exploração para o novo layout. A boa notícia: o **state do jogo não muda**. O `GameState`, o reducer, as actions, tudo continua. O que muda é a apresentação visual.

Componentes que existiam podem ser **convertidos**:
- `HeroPanel` grande virou `HeroFocusPanel`.
- Painel de pilhas em cima virou `Stack` espalhado nas laterais do `Board`.
- Painel de exploração virou `Board`.

---

## Pontos abertos pós-Patch 3

Continuam pendentes para próximos patches:

1. **Patch 4 — Anatomia visual de sala, item, artefato, chefe** (ainda em aberto desde Patch 1).
2. **Padronização do `dice` do boss** — `dice: string` no Azhakar deve virar `diceByColor: [3,3,3,3,3]`.
3. **IDs estáveis nas cartas** — atualmente identificadas por `name`.
4. **Efeitos estruturados de cartas** — efeitos continuam como string.
5. **Acessibilidade do drag-and-drop** — fluxo alternativo de clique-clique.
6. **Localização** — i18n.
7. **Painel de rolagem (`resolving` phase)** — como exatamente aparece? Overlay central? Painel sobreposto à criatura? Decidir no Patch 4.
