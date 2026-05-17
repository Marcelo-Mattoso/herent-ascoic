# Patch 1 — Ajustes de regras e escopo do MVP 1

Este documento descreve mudanças no escopo, regras e telas do MVP 1 após a primeira rodada de planejamento. Substitui informações em conflito nos documentos `arquitetura-mvp1.md`, `plano-implementacao-mvp1.md` e `spec-telas-mvp1.md`, que já foram atualizados para refletir este patch.

Para o Sonnet: este documento é a **referência primária** quando houver dúvida. Se algum trecho dos outros documentos ainda contradisser o que está aqui, **este patch prevalece**.

---

## Resumo executivo das mudanças

| # | Mudança | Impacto |
|---|---|---|
| 1 | MVP 1 passa a suportar 1 a 8 heróis | Alto — afeta state, reducer, UI |
| 2 | Regra unificada de dificuldade: "+N níveis" | Médio — afeta setup e config |
| 3 | Anatomia de carta (herói/criatura) explicitada | Médio — afeta componente Card |
| 4 | Custo de subida de nível confirmado: 10 XP | Baixo — já estava correto |
| 5 | Distribuição de recompensa: item vs artefato | Médio — afeta modal de recompensa |
| 6 | Reforço da escala de dados por cor | Baixo — já estava no JSON |

---

## Mudança 1 — Suporte a 1 a 8 heróis no MVP 1

### Decisão
O MVP 1 passa a permitir o jogador escolher **de 1 a 8 heróis** no setup. A versão anterior previa apenas 1 herói para o MVP 1.

### Implicações no motor de regras

**Estado (`heroes: HeroState[]`)** — já era array, mantém. Mas vários handlers precisam tratar múltiplos heróis de verdade.

**Combate** — múltiplos heróis ativos em uma rodada:
- O jogador escolhe **qual herói age primeiro** entre os ainda não usados na rodada. Não há auto-seleção (exceto se restar apenas 1 herói ativo na rodada).
- Cada herói pode enfrentar **apenas 1 criatura por rodada**.
- Uma criatura **não pode ser alvo de mais de 1 herói** na mesma rodada (salvo efeito específico).
- A rodada de combate termina quando **todos os heróis ativos agirem**.
- Depois disso: **criaturas sem oponente causam dano direto** a 1 herói válido (strategy `targetSelection` define o alvo; default = herói com menor vida).
- Se ainda houver heróis vivos e criaturas vivas, **nova rodada começa**.

**Recompensas** — distribuição entre heróis:
- Itens: jogador escolhe qual herói recebe (ver Mudança 5).
- Artefatos: vão para a área coletiva do grupo, sem escolher herói (ver Mudança 5).
- XP: continua coletivo do grupo.

**Fuga**:
- Se um herói foge, a partida continua com os demais.
- Se **todos** os heróis fugirem, abre tela de "Reiniciar masmorra" com opção de "reiniciar do zero" ou "reiniciar mantendo equipamentos" (este último torna a aventura mais fácil).

**Derrota**:
- A partida só termina em derrota quando **todos os heróis** forem derrotados (não quando o primeiro morre).
- Heróis derrotados ficam em `state.defeatedHeroes` mas a partida continua com os ativos.

### Implicações na UI

**Setup**:
- Tela de escolha de herói passa a permitir **seleção múltipla** (1 a 8).
- Indicar contagem "N de 8 heróis selecionados".
- Botão "Iniciar partida" habilita com pelo menos 1 herói selecionado.

**Tela de Exploração**:
- O painel inferior, que antes mostrava 1 herói grande, agora precisa caber 1 a 8 heróis.
- **Padrão recomendado**:
  - Com **1 herói**: layout largo como no wireframe atual.
  - Com **2-4 heróis**: cards de herói menores, lado a lado.
  - Com **5-8 heróis**: lista compacta horizontal/scrollável; herói "ativo" (que está agindo agora) fica destacado/expandido.
- Cada herói mantém sua barra de Ímpeto individual, seus estados, sua mochila e seus equipamentos.
- Habilidade e poder ficam visíveis para o **herói ativo no momento**. Para os outros, podem ficar escondidos ou em modo compacto, abrindo ao clicar.

**Tela de Combate**:
- Indicador visual de qual herói está agindo agora.
- Cards de inimigos mostram se já foram alvo nesta rodada (ex: borda atenuada ou label "engajado por: Bárbaro").
- Após todos os heróis agirem, sistema aplica dano direto das criaturas sem oponente e abre nova rodada.

### Implicações no plano de implementação

- **Marco 2 (Tipos)** — sem mudança grande. `heroes` já era array.
- **Marco 5 (Reducer)** — Sessão 5B (Combate) cresce significativamente. Tratar:
  - Loop de "todos heróis agem antes da rodada terminar".
  - Validação de pareamento herói↔inimigo único na rodada.
  - Cálculo de dano direto pós-rodada.
  - Verificação de derrota só quando **todos** estão `defeated`.
- **Marco 7 (UI)** — Sessão 7B (Telas) cresce. Tratar:
  - Setup com seleção múltipla.
  - Painel de heróis flexível (1 a 8).
  - Indicador de herói ativo.
  - Marcação de inimigos já engajados.

### Strategy nova: `heroOrderStrategy`
Define como o sistema decide a ordem de ação dos heróis em cada rodada.
- **Default MVP 1**: jogador escolhe (clicar no herói que vai agir).
- **Alternativa futura**: ordem fixa por posição, ordem por iniciativa, etc.

---

## Mudança 2 — Regra unificada de dificuldade ("+N níveis")

### Decisão
A regra de dificuldade não é "definir cor inicial de Ímpeto e Despertar arbitrariamente". É uma única regra:

> Cada dificuldade define **dois deslocamentos de nível**, um aplicado ao Ímpeto inicial de cada herói e outro ao Despertar inicial da masmorra. O nível 0 é Branco; deslocamento +N sobe N posições na trilha de cores.

### Tabela final corrigida

| Modo | Deslocamento Ímpeto | Deslocamento Despertar | Cor Ímpeto | Cor Despertar |
|---|---|---|---|---|
| Muito fácil | +2 | 0 | Laranja | Branco |
| Fácil | +1 | 0 | Amarelo | Branco |
| Padrão | 0 | 0 | Branco | Branco |
| Difícil | 0 | +1 | Branco | Amarelo |
| Pesadelo | 0 | +2 | Branco | Laranja |

### Correção importante
A documentação anterior (e parte dos PDFs do manual) afirmava que o modo Pesadelo iniciava com "Ímpeto em Amarelo e Despertar em Laranja". **Isto está incorreto**. A regra dos "+N níveis" prevalece. No Pesadelo: Ímpeto **Branco** (0) e Despertar **Laranja** (+2).

### Implicações

**Config (`core/config/defaults.ts`)**:
```ts
export const DIFFICULTY_PRESETS = {
  "very_easy": { heroOffset: 2, despertarOffset: 0 },
  "easy":      { heroOffset: 1, despertarOffset: 0 },
  "standard":  { heroOffset: 0, despertarOffset: 0 },
  "hard":      { heroOffset: 0, despertarOffset: 1 },
  "nightmare": { heroOffset: 0, despertarOffset: 2 },
}
```

**Reducer (`START_GAME`)**:
- Cada herói inicia com Ímpeto = `heroOffset` (índice de cor).
- Masmorra inicia com Despertar = `despertarOffset`.

**Setup UI**:
- Cada chip de dificuldade mostra os deslocamentos em texto ("Herói +1, Masmorra 0") ou as cores resultantes — ambos podem coexistir.

---

## Mudança 3 — Anatomia da carta (herói e criatura)

### Decisão
As cartas de **herói** e **criatura** têm anatomia visual fixa que o componente `Card` deve respeitar:

```
┌──────────────────────────────────┐
│                                  │
│          [ARTE DA CARTA]         │
│                                  │
├──────────────────────────────────┤
│                  NOME            │
├────────────┬────────┬────────────┤
│  ESQUERDA  │ CENTRO │  DIREITA   │
│   Vida     │  ...   │  Bônus de  │
│            │        │   Acerto   │
└────────────┴────────┴────────────┘
                EMBAIXO
        Quantidade de dados
```

Especificamente:
- **Lado esquerdo**: pontos de vida (atual / máximo, ou só máximo no caso de visualização fora de jogo).
- **Lado direito**: bônus de acerto (hitBonus).
- **Embaixo**: quantidade de dados que esta carta rola no nível atual.

### Adicional para cartas de criatura
- À **direita**, abaixo do bônus de acerto, mostrar **XP que concede** e **quantas cartas de tesouro** dropa.

### Notas
- Esta anatomia vale para o card em **tamanho médio/grande** (modal de detalhes, seleção de herói). No tamanho **mini** (slots do campo de batalha, slot de equipamento) o layout pode comprimir mas mantém a hierarquia: vida visível, acerto visível, dados visíveis.
- A anatomia de **sala**, **item**, **artefato** e **chefe** será definida no **Patch 2**. Por enquanto, o componente `Card` aceita esses tipos com layout livre (apenas nome + texto descritivo).

### Implicações
- Componente `Card.tsx` (Marco 7A) precisa de uma variante específica para `type: "hero" | "creature"`.
- Componente `Card.tsx` para `type: "room" | "item" | "artifact" | "boss"` fica com layout genérico no MVP 1, a ser refinado no Patch 2.

---

## Mudança 4 — Custo de subida de nível (10 XP)

### Decisão
Custo de subir o herói de nível: **10 XP**. Esta informação já estava correta nos documentos. Reforçada por completude:

- 5 XP — recuperar carta de dungeon
- **10 XP** — subir nível de 1 herói (Ímpeto +1 E Despertar +1, cura total, remove condições negativas temporárias)
- 15 XP — comprar 1 item
- 30 XP — baixar Despertar em 1 nível
- 35 XP — comprar 1 artefato

### Nota importante para múltiplos heróis
Quando o grupo gastar 10 XP para subir um herói, o jogador deve **escolher qual herói** sobe. O custo é coletivo (sai do XP do grupo), mas o benefício é individual.

---

## Mudança 5 — Distribuição de recompensa: item vs artefato

### Decisão

**Item recebido**:
1. Modal de recompensa abre.
2. Jogador escolhe **qual herói** recebe o item (no MVP 1 com múltiplos heróis, isso é obrigatório).
3. Em seguida, o herói escolhido decide o destino: **equipar**, **guardar na mochila**, ou **descartar**.
4. Se equipar e já houver item ativo do mesmo tipo, o item anterior vai para a mochila (ou é descartado, conforme escolha).

**Artefato comum recebido**:
- Vai **direto para a área de "Artefatos do grupo"**.
- Não há escolha de herói.
- Modal mostra apenas "Artefato adquirido: {nome}" com botão "OK".

**Artefato com texto "o portador"**:
- Modal pergunta qual herói será o portador.
- Depois disso, vai para a área do grupo com a marcação do portador.

**Item especial cujo único uso é sacar Artefato**:
- Quando o efeito do item for resolvido (e o efeito for sacar artefato), o **item é removido do jogo permanentemente** após o efeito.
- Esta lógica fica no handler do item específico no reducer.

### Implicações na UI

**Modal de recompensa** vira sensível ao tipo da carta recebida:

```
Tipo "item" → 
  ┌─ Etapa 1: escolher herói (skip se só 1 herói ativo) ─┐
  ↓
  ┌─ Etapa 2: equipar / mochila / descartar ─┐

Tipo "artifact" sem "portador" →
  ┌─ Confirmação simples: "Artefato adquirido" ─┐

Tipo "artifact" com "portador" →
  ┌─ Escolher portador → confirmação ─┐
```

### Implicações no reducer

- `GRANT_REWARDS` no MVP 1 passa a empilhar uma fila de modais a serem resolvidos, um para cada recompensa.
- Cada modal dispara as actions: `CHOOSE_HERO_FOR_ITEM`, `CHOOSE_ITEM_DESTINATION`, `CHOOSE_ARTIFACT_BEARER` (esta última só para artefatos com portador).

---

## Mudança 6 — Reforço sobre escala de dados por cor

### Decisão (reafirmação)
Cada carta traz um array `diceByColor` com 5 posições (Branco até Roxo) indicando quantos dados de 6 faces aquela carta rola em cada cor.

- Heróis e criaturas normais: `[1, 1, 2, 2, 3]` (padrão).
- Subchefes: `[1, 2, 2, 3, 3]`.
- Chefe Azhakar: 3 dados fixos (campo `dice` como string, padronizar para `diceByColor: [3,3,3,3,3]` num futuro patch).

Cada carta pode ter sua própria escala. O motor **lê do JSON**, não codifica a escala em lugar nenhum.

### Nota
A anatomia visual da carta (Mudança 3) mostra "quantidade de dados embaixo" → este valor é `diceByColor[colorIndex]` para a cor atual.

---

## Como aplicar este patch (instruções para o Sonnet)

### Se ainda não começou a implementar

Use a versão **atualizada** dos 3 documentos principais (`arquitetura-mvp1.md`, `plano-implementacao-mvp1.md`, `spec-telas-mvp1.md`). Eles já refletem este patch. Consulte este documento apenas em caso de dúvida ou conflito.

### Se já começou e está em algum marco

Aplique este patch ao código existente, marco a marco:

**Marco 1 (Setup)** — sem impacto direto. Confirme que `package.json` e estrutura estão como planejado.

**Marco 2 (Tipos)** — confirme que:
- `HeroState` está pronto para múltiplos heróis (array no `GameState`).
- `DifficultyConfig` tem `heroOffset` e `despertarOffset` (não cores hardcoded).
- Adicione campo `defeatedHeroes` no `GameState` se ainda não tem.

**Marco 3 (Loader)** — sem impacto.

**Marco 4 (Regras)** — sem impacto direto.

**Marco 5 (Reducer)** — revisão maior necessária:
- `START_GAME`: usar `heroOffset` e `despertarOffset` da config de dificuldade.
- `CHOOSE_HERO`: validar que herói não agiu na rodada e está ativo.
- `CHOOSE_TARGET`: validar que inimigo não foi alvo na rodada.
- `CHECK_COMBAT_END`: terminar rodada quando todos heróis ativos agiram; calcular dano direto; iniciar nova rodada se ambos os lados têm cartas vivas.
- `GRANT_REWARDS`: enfileirar modais por recompensa.
- Adicionar `CHOOSE_HERO_FOR_ITEM`, `CHOOSE_ITEM_DESTINATION`, `CHOOSE_ARTIFACT_BEARER`.
- `DEFEAT`: disparar só quando `heroes.every(h => h.status === "defeated")`.
- `SPEND_XP` com payload "level_up": exigir `heroId` no payload.

**Marco 6 (Store)** — atualizar seletores:
- `selectActiveHero` agora retorna o herói cuja vez é agir, não "o herói".
- `selectHeroesAvailableForRound`: lista de heróis que ainda não agiram na rodada.
- `selectEnemiesAvailableAsTargets`: lista de inimigos ainda não engajados na rodada.

**Marco 7 (UI)** — revisão maior:
- Setup: seleção múltipla com checkboxes ou clique-toggle.
- Tela de Exploração: painel de heróis flexível conforme contagem.
- Componente `Card` para herói/criatura com anatomia da Mudança 3.
- Modal de recompensa com fluxo de etapas para itens.

**Marco 8 (Polimento)** — atualize checklist:
- Smoke test "partida com 1 herói" (original).
- Smoke test "partida com 3 heróis" (novo).
- Smoke test "todos heróis fogem → modal de reinício" (novo).

---

## Pontos abertos pós-Patch 1

Documentar aqui o que ainda fica para próximos patches:

1. **Patch 2 — Anatomia visual de sala, item, artefato, chefe.** O Patch 1 fechou apenas herói/criatura.
2. **Localização** — todos os textos hardcoded em português; preparação para i18n fica para depois.
3. **Efeitos estruturados de cartas** — efeitos continuam como string. Migração para objeto tipado fica como débito técnico do MVP 2.
4. **Padronização do campo `dice` do boss** — Azhakar usa `dice: string`. Migrar para `diceByColor` no Patch 2.
5. **IDs estáveis nas cartas** — atualmente identificadas por `name`. Adicionar `id` no Patch 2.
