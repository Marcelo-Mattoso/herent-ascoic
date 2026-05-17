# Ascensão Heróica Digital — Especificação das Telas (MVP 1)

Documento de referência visual e estrutural para o Marco 7 do plano de implementação. Descreve cada tela em termos de layout, componentes, comportamentos e estados — sem código.

Acompanha o arquivo `wireframe-exploracao.html` (referência visual da tela principal).

---

## Princípios gerais

- **Desktop primeiro** (base 1280×800). Mobile fica para MVP 2.
- **Estilo minimalista funcional**. Sem ornamento medieval, sem texturas, sem sombras pesadas. Cinza neutro, brancos, retângulos arredondados, bordas sutis.
- **Tipografia**: family system stack. Pesos 400 (regular) e 500 (medium). Sem 600+.
- **Cores funcionais**:
  - Background da página: #FAFAF7
  - Background primário (painéis): #FFFFFF
  - Background secundário (subpainéis): #F1EFE8
  - Texto primário: #2C2C2A
  - Texto secundário: #5F5E5A
  - Texto terciário (info auxiliar): #888780
  - Bordas: rgba(0,0,0,0.15) e rgba(0,0,0,0.30)
- **Cores de progressão** (Ímpeto e Despertar):
  - Branco: fundo #FFFFFF, borda #D3D1C7
  - Amarelo: fundo #FAEEDA, texto #854F0B
  - Laranja: fundo #FCE3D1, texto #8C3D0B
  - Vermelho: fundo #FCEBEB, texto #501313
  - Roxo: fundo #F0E6FB, texto #3D1A6E
- **Cores semânticas**:
  - Info (rolagem herói, botão atacar): #E6F1FB / #185FA5
  - Atenção (rolagem inimigo, dano): #FCEBEB / #501313
  - Sucesso (habilidade ativa): #EAF3DE / #3B6D11
- **Cartas**: placeholder visual no MVP 1. Container `[arte]` em cinza claro (#D3D1C7) com aspect-ratio 3:4. Imagem real entra depois sem mudar o container.
- **Radii**: pequeno 4px, médio 8px, grande 12px.

---

## Inventário de telas

1. Menu Principal
2. Setup (escolha de dificuldade e herói)
3. Exploração (tela principal de jogo)
4. Combate (mesma tela de Exploração, com painéis ativados)
5. Vitória
6. Derrota

E os seguintes **modais** que aparecem sobrepostos a Exploração:

- Detalhes de carta (abre ao clicar em qualquer carta visível)
- Janela de gasto de XP
- Abertura de caminhos
- Recompensa (item recebido)
- Deck de dungeon esgotado (oferta de 5 XP)

A tela **Combate contra Boss** é uma variação da tela de Exploração (mesmos painéis, mas com indicadores de fase do boss e a sala substituída pela carta do boss).

---

## Anatomia da carta (herói e criatura)

As cartas de **herói** e **criatura** seguem este layout fixo (em tamanho médio/grande):

```
┌──────────────────────────────────┐
│                                  │
│          [ARTE DA CARTA]         │
│                                  │
├──────────────────────────────────┤
│              NOME                │
├────────────┬───────────┬─────────┤
│  ESQUERDA  │  CENTRO   │ DIREITA │
│   Vida     │   ...     │  Bônus  │
│  atual/max │           │ acerto  │
├────────────┴───────────┴─────────┤
│       EMBAIXO: Nd6 (dados)       │
└──────────────────────────────────┘
```

**Criatura** adiciona no lado **direito**, abaixo do bônus de acerto:
- XP que concede ao ser derrotada.
- Quantas cartas de tesouro dropa.

**No tamanho mini** (slots do campo de batalha), o layout comprime mas mantém a hierarquia: vida visível à esquerda, acerto à direita, dados embaixo.

**Demais tipos de carta** (sala, item, artefato, chefe): anatomia será definida no **Patch 2**. No MVP 1, layout livre — apenas nome e texto descritivo.

---

## Tela 1 — Menu Principal

### Layout
- Tela cheia, centralizada vertical e horizontalmente.
- Título "Ascensão Heróica" no topo, fonte grande (32-40px), peso 500.
- Lista vertical de 3 botões, largura ~280px, espaçados em 12px:
  - **Nova partida** — ativo.
  - **Biblioteca de cartas** — desabilitado, com label "(em breve)".
  - **Configurações** — desabilitado, com label "(em breve)".
- Versão do MVP em texto pequeno no rodapé (ex: "MVP 1 — v0.1").

### Comportamento
- Clicar "Nova partida" navega para Setup.
- Botões desabilitados não respondem ao clique e têm opacidade 50%.

---

## Tela 2 — Setup

### Layout
Estrutura em fluxo vertical, contidas em um painel central de ~640px de largura. Cada bloco abaixo é uma seção empilhada.

**Cabeçalho**
- Título "Configurar exploração", 20-24px, peso 500.
- Subtítulo "Modo Solo · 1 a 8 heróis selecionáveis", em texto secundário.
- Botão "Voltar" discreto no canto superior esquerdo.

**Seção: Dificuldade**
- Label "Dificuldade".
- 5 botões em linha (chips), cada um mostrando os deslocamentos de nível e as cores resultantes:
  - Muito fácil — Herói +2 (Laranja) · Masmorra 0 (Branco)
  - Fácil — Herói +1 (Amarelo) · Masmorra 0 (Branco)
  - Padrão — Herói 0 (Branco) · Masmorra 0 (Branco) — **selecionado por padrão**
  - Difícil — Herói 0 (Branco) · Masmorra +1 (Amarelo)
  - Pesadelo — Herói 0 (Branco) · Masmorra +2 (Laranja)
- Chip selecionado tem borda mais escura e fundo levemente destacado.

**Seção: Escolha dos heróis (seleção múltipla)**
- Label "Escolha os heróis" + contador "{n} de 8 selecionados".
- Grid 4 colunas × 2 linhas com os 8 heróis.
- Cada card do herói (~140px largura):
  - Placeholder de arte (aspect-ratio 3:4) com nome do herói abaixo.
  - Stats no nível inicial em linha: "Vida {v} · +{a} · Dano {d}".
  - Estilo de jogo em texto pequeno (ex: "agressivo, alto dano").
  - Tooltip ou expansão ao hover/clique mostrando habilidade e poder completos.
  - **Clique toggle**: clicar adiciona/remove o herói da seleção.
- Cards selecionados têm borda destacada, leve background colorido e um indicador de "✓ selecionado" no canto.
- Comportamento: jogador pode escolher de 1 a 8 heróis (impossível selecionar 0 — botão de iniciar fica desabilitado).

**Seção: Chefe final**
- Label "Chefe final".
- Card horizontal com:
  - Placeholder de arte à esquerda.
  - À direita: nome "Azhakar, Dragão da Fornalha Sombria", condição "2 Artefatos", em texto.
- No MVP 1, este card é apenas informativo — não é selecionável (Azhakar é fixo).

**Rodapé**
- Botão grande "Iniciar partida" alinhado à direita, com cor info (#E6F1FB).
- Desabilitado enquanto herói não for selecionado.

### Comportamento
- Clicar em dificuldade marca seleção e mantém visível.
- Clicar em herói marca/desmarca seleção (toggle); jogador pode escolher 1 a 8 heróis.
- "Iniciar partida" só habilita quando pelo menos 1 herói está selecionado.
- Ao iniciar: cada herói selecionado começa com Ímpeto = `heroOffset` da dificuldade escolhida; Despertar global = `despertarOffset`.
- Dispara `START_GAME` e navega para Exploração.

---

## Tela 3 — Exploração (tela principal)

Referência visual: `wireframe-exploracao.html`.

### Estrutura geral
Layout vertical em 5 blocos empilhados de cima para baixo, dentro de um container central com largura máxima ~1000px:

1. Barra de status superior
2. Painel de Artefatos do grupo
3. Painel de Pilhas
4. Campo de Batalha (com Despertar ao lado)
5. Botões de ação
6. Painel do Herói (com Habilidade, Poder, Mochila, Equipamentos)

### Bloco 1 — Barra de status superior

**Layout**: barra horizontal, fundo secundário, padding 8×12, radius médio. Sempre visível.

**Conteúdo à esquerda** (em linha, espaçamento 22px):
- "XP do grupo: **{n}**"
- "Sala: **{n}**" (contador de salas vencidas)
- "Condição do chefe: **{descrição}** ({progresso})"

**Conteúdo à direita**:
- Botão "📖 Regras" (abre modal com referência rápida)
- Botão "📜 Log" (abre modal com histórico da partida)

### Bloco 2 — Artefatos do grupo

**Layout**: barra horizontal, fundo dourado claro (#FDF8EF), borda dourada (#F0D9A8). Visualmente distinta das outras seções.

**Conteúdo**:
- Label "Artefatos do grupo" à esquerda.
- Cards mini de cada artefato obtido (~200-280px cada):
  - Nome do artefato em peso 500.
  - "portador: {herói}" + efeito resumido em texto pequeno secundário.
- Slot vazio com borda tracejada e texto "faltam N para enfrentar o chefe", quando ainda não está completo.

**Estados**:
- Se nenhum artefato obtido, mostra slot único: "Nenhum artefato ainda · precisa de N para o chefe".
- Se condição cumprida, slot vazio é substituído por "✓ Condição cumprida — chefe pode ser enfrentado".

### Bloco 3 — Pilhas

**Layout**: label "Pilhas" no topo, seguido de grid 4 colunas com igual largura.

**Cada pilha** (4 no total: Monstros, Masmorra, Itens, Artefatos):
- Visual de 3 retângulos sobrepostos (cores #5F5E5A, #888780, #B4B2A9) representando uma pilha física à esquerda.
- À direita: nome da pilha em peso 500, contagem "N cartas" abaixo.
- Quando aplicável, info adicional pequena em texto terciário (ex: "cemitério 5", "descarte 3").

**Comportamento**:
- Clicar em uma pilha abre modal listando as cartas da pilha (útil pra ver cemitério, descarte).

### Bloco 4 — Campo de Batalha

**Layout**: container com borda grossa (#border-secondary, 1.5px) e radius grande. Label "Campo de Batalha" sobreposto à borda no canto superior esquerdo (estilo legenda).

Grid 2 colunas: conteúdo principal (1fr) | painel Despertar (130px).

**Subseção: Inimigos + Sala atual** (lado esquerdo)
- Linha horizontal com 2 metades.
- Metade esquerda: label "Inimigos", abaixo dois slots side-by-side.
  - Cada slot de inimigo: card pequeno com arte, nome, "Vida {atual}/{max} · +{acerto} · Dano {dano}" e efeito da carta em itálico pequeno.
  - Slots vazios (quando há menos inimigos que slots): borda tracejada, texto "vazio".
- Metade direita: label "Sala atual", abaixo um único card com:
  - Arte placeholder, nome, "Saídas {n} · XP {n} · {n} {recompensa}" e efeito da carta em itálico.

**Subseção: Rolagem** (abaixo de inimigos+sala)
- Fundo secundário, padding 8×12, radius médio.
- Label "Rolagem".
- Layout 3 colunas: Herói (azul) | "vs" | Inimigo (vermelho).
- Cada lado mostra:
  - Quadradinho com o resultado de cada dado (azul para herói, vermelho para inimigo). Pode ter 1, 2 ou 3 quadradinhos conforme cor.
  - Lista discriminada de bônus em texto pequeno secundário: "base +5 · adaga +1".
  - "total **{n}**" — total destacado, em peso 500.
- **Estado fora de combate**: a seção fica oculta ou mostra "aguardando combate" em texto terciário.

**Subseção: Despertar** (coluna direita)
- Painel vertical com fundo da cor atual (ex: #FAEEDA para Amarelo).
- Texto grande do nome da cor.
- Texto pequeno "nível N de 5".
- Barra de 5 traços horizontais no rodapé indicando posição na trilha (cor preenchida no traço atual, brancos com borda nos demais).

### Bloco 5 — Botões de ação

**Layout**: 4 botões em linha, igualmente espaçados, gap 6px.

**Botões** (esquerda → direita):
- "⚔ Atacar" — botão primário, fundo info (#E6F1FB).
- "🧪 Usar item" — botão neutro.
- "⚡ Usar poder" — botão neutro.
- "🏃 Fugir" — botão neutro.

**Estados**:
- **Fora de combate**: aparece um único botão "Continuar" (ou similar) que avança para próxima etapa.
- **Atacar**: ativo sempre que há combate.
- **Usar item**: ativo se há item utilitário ou consumível disponível com alvo válido.
- **Usar poder**: ativo se o herói tem poder não usado e que pode ser ativado agora.
- **Fugir**: ativo apenas quando vida do herói = 1.

Botões desabilitados têm opacidade 50% e cursor padrão.

### Bloco 6 — Painel dos Heróis (1 a 8)

O painel inferior precisa caber qualquer quantidade de heróis entre 1 e 8. Use os layouts conforme contagem:

**Layout A — 1 herói** (idêntico ao wireframe original):
- Grid 2 colunas: card do herói (130px) | painel direito (1fr) com Habilidade, Poder, Mochila, Equipamentos.

**Layout B — 2 a 4 heróis**:
- Grid horizontal com cards de herói lado a lado, cada um com ~200-240px de largura.
- Cada card mostra: arte placeholder, nome, stats compactos, barra de Ímpeto, estados.
- Painel de Habilidade/Poder/Mochila/Equipamentos do **herói ativo** aparece abaixo dos cards, em largura cheia.

**Layout C — 5 a 8 heróis**:
- Lista compacta horizontal de cards mini (~130px cada), scrollável se necessário.
- Cada card mostra: arte placeholder mini, nome, vida atual/máxima, indicador de Ímpeto.
- Painel detalhado do **herói ativo** aparece abaixo, em largura cheia.

**Herói ativo**:
- "Herói ativo" = o herói cuja vez é agir agora durante combate. Fora de combate, o jogador pode clicar em qualquer card de herói para ver os detalhes.
- Card do herói ativo tem borda destacada e/ou leve elevação visual.
- Clicar em um card de herói (fora de combate) muda o herói cujos detalhes aparecem.

**Card individual do herói** (qualquer layout):
- Arte placeholder (aspect-ratio 3:4) no topo.
- Nome em peso 500.
- Stats: "Vida {atual}/{max}", "Acerto +{n} · Dano {n}", "Dados {Nd6}".
- Label "Ímpeto" e barra de 5 traços com cor preenchida conforme nível atual.
- Texto da cor atual abaixo da barra.
- Linha de "Estados" com chips (Ferido, Prender, etc.).
- Status do herói: "ativo", "derrotado" (com visual atenuado, cinza), "fugiu" (visual diferente).

**Painel de detalhes do herói ativo** (sempre presente, atualiza ao trocar herói):
- **Habilidade**: texto + badge "ativa"/"inativa".
- **Poder**: texto + badge "disponível" / "usado neste combate" / "usado nesta sala" / "usado neste jogo".
- **Mochila**: chips com itens guardados.
- **Equipamentos ativos**: grid de 4 slots (Equipável, Utilitário, Consumível, Especial).

### Comportamentos da tela de Exploração

- **Em combate, o sistema indica o herói ativo** (cuja vez é agir). O painel de detalhes mostra esse herói. O jogador pode clicar nos botões de ação (Atacar, etc.) para esse herói.
- **Antes de cada herói agir**, se houver mais de 1 disponível na rodada, jogador escolhe clicando no card do herói que quer mover.
- **Inimigos já engajados** nesta rodada aparecem com borda atenuada ou label "engajado por: {herói}". Não podem ser alvo de outro herói na mesma rodada.
- **Clicar em qualquer carta** (herói, inimigo, sala, item equipado, artefato, item da mochila) abre o **modal de Detalhes de carta**.
- **Clicar em pilha** abre modal listando cartas da pilha.
- **Botão Regras** abre modal com referência rápida das regras principais.
- **Botão Log** abre modal com histórico de eventos da partida.

---

## Tela 4 — Combate contra Boss

### Diferenças em relação à Exploração

Visualmente quase idêntica, com 3 mudanças:

1. **Slot da sala atual é substituído pela carta do Boss**, com arte do boss e suas informações (nome, vida, acerto, dano, condição de vitória).
2. **Barra de status superior ganha um destaque visual** (cor de atenção sutil) e mostra "Combate Final" no lugar de "Sala N".
3. **Artefatos do grupo permanecem visíveis** porque podem ter efeitos relevantes contra o boss (caso do Coração de Brasa Antiga).

Se o boss tiver fases (ex: Azhakar muda comportamento ao entrar em Vermelho), mostra indicador de fase atual ao lado do nome.

---

## Tela 5 — Vitória

### Layout

Tela cheia, container central ~640px.

- Título grande "Vitória" em peso 500, cor primária.
- Subtítulo: "Você derrotou o chefe final e sobreviveu à masmorra."
- Painel de resumo (fundo secundário) com lista vertical de stats:
  - Chefe derrotado: {nome}
  - Salas exploradas: {n}
  - Criaturas derrotadas: {n}
  - Artefatos obtidos: {n}
  - Tesouros obtidos: {n}
  - XP total ganho: {n}
  - Maior nível de Ímpeto: {cor}
  - Maior nível de Despertar: {cor}
  - Dificuldade: {nome}
- Botões no rodapé:
  - "Jogar novamente" (primário)
  - "Voltar ao menu"

---

## Tela 6 — Derrota

### Layout

Mesma estrutura da tela de Vitória, com:

- Título "Derrota", em tom neutro (não vermelho dramático — minimalismo).
- Subtítulo: "A masmorra consumiu os heróis."
- Painel de resumo com:
  - Motivo da derrota: {herói morto / deck esgotado / boss venceu}
  - Salas exploradas: {n}
  - Criaturas derrotadas: {n}
  - Chefe escolhido: {nome}
  - Condição do chefe: {descrição}
  - XP obtido: {n}
  - Itens encontrados: {n}
  - Artefatos encontrados: {n}
  - Turno da derrota: {n}
- Botões:
  - "Tentar novamente" (mesmo herói/dificuldade)
  - "Voltar ao menu"

---

## Modais

Todos os modais seguem o mesmo padrão visual:

- Overlay escuro semi-transparente sobre o resto da tela.
- Painel central com background primário (#FFFFFF), padding 20-24px, radius grande, sombra sutil.
- Botão "X" no canto superior direito para fechar (quando aplicável).
- Largura máxima depende do conteúdo (480-720px).

### Modal — Detalhes de carta

**Disparado por**: clique em qualquer carta visível na tela de Exploração.

**Conteúdo**:
- Arte da carta em tamanho maior (~280px largura).
- Nome em destaque.
- Tipo da carta.
- Stats completos (todos os 5 níveis de cor, em tabela).
- Habilidade(s) e poder(es) completos.
- Efeito (`effect`) e efeito roxo (`purpleEffect`), se aplicável.
- Texto de fluff/estilo, se houver.
- Botão "Fechar".

### Modal — Janela de gasto de XP

**Disparado por**: sistema, automaticamente após resolver sala e antes de abrir caminhos.

**Conteúdo**:
- Título "Gastar XP".
- Texto "Você tem **{n}** XP".
- Lista de opções, cada uma em uma linha com:
  - Custo (ex: "5 XP")
  - Nome da ação (ex: "Recuperar carta de dungeon")
  - Descrição curta
  - Botão "Gastar" à direita, habilitado se XP suficiente E condição atendida.
- Opções:
  - 5 XP — Recuperar carta de dungeon (habilitado se há ≥1 no descarte)
  - 10 XP — Subir nível de um herói (habilitado se algum herói ativo não está em Roxo). **Ao clicar, abre seleção de qual herói sobe.**
  - 15 XP — Comprar item (habilitado se deck de itens tem cartas; dispara fluxo de recompensa de item)
  - 30 XP — Baixar Despertar (habilitado se Despertar > Branco)
  - 35 XP — Comprar artefato (habilitado se deck de artefatos tem cartas; vai para área do grupo)
- Botão "Continuar sem gastar" no rodapé.

### Modal — Abertura de caminhos

**Disparado por**: sistema, após janela de gasto de XP.

**Conteúdo**:
- Título "Escolher próxima sala".
- Texto: "A sala anterior tinha **{n} saídas**. Escolha **1** caminho. {n descartadas} carta(s) será(ão) descartada(s)."
- Grid de cards de sala (1 a 6 cards conforme saídas):
  - Cada card: arte, nome, "Saídas {n} · XP {n} · {recompensa}", efeito em itálico.
  - Hover destaca o card.
- Card selecionado fica com borda destacada.
- Botão "Confirmar escolha" no rodapé, habilitado após seleção.

### Modal — Recompensa (item ou artefato recebido)

**Disparado por**: sistema, quando uma sala/inimigo concede item ou artefato. Cada recompensa abre um modal próprio em fila.

**Caso A — Item**:
- Etapa 1 (pular se só 1 herói ativo): título "Escolha o herói que recebe", lista os heróis ativos com nome + arte placeholder. Clicar escolhe.
- Etapa 2: card do item recebido (arte + nome + tipo + efeito). 3 botões:
  - "Equipar" — se slot do tipo está livre, equipa direto. Se ocupado, item anterior vai para mochila e mostra aviso "{item anterior} foi para a mochila".
  - "Guardar na mochila"
  - "Descartar"

**Caso B — Artefato comum** (sem texto "o portador"):
- Modal simples mostrando o artefato (arte + nome + efeito).
- Texto: "Adicionado aos Artefatos do grupo."
- Botão "OK".

**Caso C — Artefato com "o portador"**:
- Etapa 1: título "Escolha o portador deste artefato", lista heróis ativos. Clicar escolhe.
- Etapa 2: confirmação mostrando artefato + portador escolhido. Botão "OK".

**Caso D — Recompensa convertida em XP** (deck vazio):
- Modal informativo: "Deck de {tesouros|artefatos} vazio — você recebe {1|3} XP no lugar." Botão "OK".

### Modal — Deck de dungeon esgotado

**Disparado por**: sistema, quando precisaria revelar sala mas deck está vazio.

**Conteúdo**:
- Título "Deck de dungeon vazio".
- Texto: "Você pode gastar **5 XP** para recuperar 1 carta aleatória do descarte e continuar. Caso contrário, a partida termina em derrota."
- Botões:
  - "Gastar 5 XP" (habilitado se grupo tem ≥5 XP E descarte tem ≥1 carta)
  - "Aceitar derrota"

---

## Estados e fluxos importantes

### Fluxo principal de uma sala (sem combate)

1. Sistema revela sala → tela atualiza com nova carta na posição "Sala atual".
2. Se houver inimigos: tela vai para combate. Senão: pula para passo 5.
3. Combate: rolagens acontecem na seção "Rolagem". Botões de ação ficam ativos.
4. Combate termina quando todos inimigos derrotados/fugidos OU herói derrotado.
5. Modal de Recompensa abre para cada item.
6. XP é somado na barra superior.
7. Modal de Gasto de XP abre.
8. Modal de Abertura de Caminhos abre.
9. Volta ao passo 1 com a nova sala.

### Quando aparece o boss

1. Após escolher caminho no passo 8 acima, sistema verifica condição do boss.
2. Se cumprida: tela transita para Combate contra Boss (substitui sala atual pela carta do boss).
3. Combate até herói morrer ou boss morrer.
4. Vai para tela de Vitória ou Derrota.

### Quando aparece "deck esgotado"

1. A cada vez que sistema precisaria revelar uma sala e deck está vazio: modal "Deck esgotado" abre.
2. Jogador decide pagar ou aceitar derrota.
3. Se pagar: recupera carta, sala é revelada, fluxo continua.
4. Se aceitar: vai para tela de Derrota.

---

## Componentes reutilizáveis (visão da UI)

Estes são os componentes a serem construídos como peças isoladas, listados aqui para o Sonnet ter referência cruzada com o plano de implementação:

| Componente | Onde aparece |
|---|---|
| `Card` (genérico) | Em quase todas as telas |
| `PlaceholderArt` | Dentro de todos os Cards |
| `ColorBar` (5 traços) | Ímpeto do herói, Despertar |
| `StackPreview` | Painel de pilhas |
| `StatusBadge` | Habilidade ativa/inativa, poder disponível/usado, estados do herói |
| `ActionButton` | Botões de ação principal e rodapé de modais |
| `DiceDisplay` | Painel de rolagem |
| `Modal` (genérico) | Container de todos os modais |
| `StatLine` | Linhas de "Vida 10/14", "Acerto +5", etc. |
| `EquipmentSlot` | Slots de equipamentos ativos |

---

## O que está fora do escopo das telas no MVP 1

- Tela de Biblioteca de cartas.
- Tela de Configurações.
- Tela de Tutorial.
- Tela de Créditos.
- Telas de seleção de modo (Solo é fixo).
- Telas de partida cooperativa ou competitiva.
- Tela de salvamento/carregamento de partida.
- Tela de conquistas, ranking, desafios diários.
- Animações além de transições simples (hover, fade-in de modais).
- Sons.
- Tela responsiva para mobile.
- Anatomia visual de sala, item, artefato, chefe (será fechada no Patch 2).
