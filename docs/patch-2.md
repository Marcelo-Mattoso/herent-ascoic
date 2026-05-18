# Patch 2 — Spawn dinâmico, seleção de herói e pareamento em combate

Este patch complementa o Patch 1 com três ajustes que ficaram pendentes ou mal especificados, todos relacionados ao suporte de múltiplos heróis (1 a 8) no MVP 1.

Para o Sonnet: este documento é a **referência primária** sobre os tópicos cobertos aqui. Se algum trecho dos outros documentos contradisser, **este patch prevalece**.

---

## Resumo executivo das mudanças

| # | Mudança | Impacto |
|---|---|---|
| 1 | Spawn de monstros usa contagem dinâmica de heróis ativos | Médio — afeta `SPAWN_ENEMIES` |
| 2 | UI permite selecionar herói e ver inventário individual | Alto — afeta tela de Exploração |
| 3 | Pareamento herói↔monstro escolhido pelo jogador, sequencial | Alto — afeta combate e UI |

Pontos ainda **pendentes** (ficam para Patch 3):
- Anatomia visual de sala, item, artefato e chefe.

---

## Mudança 1 — Spawn de monstros dinâmico

### Decisão

A quantidade de criaturas que aparece numa sala é determinada pelo **número de heróis ativos no momento em que a carta de dungeon é sacada**. Heróis derrotados ou fugidos saem do jogo e reduzem o grupo permanentemente, o que afeta as salas seguintes.

A carta de sala traz `enemiesByPlayers: [a, b, c, d]` no JSON:
- Índice 0 → 1 ou 2 heróis ativos
- Índice 1 → 3 ou 4 heróis ativos
- Índice 2 → 5 ou 6 heróis ativos
- Índice 3 → 7 ou 8 heróis ativos

### Regra exata

No momento de spawn (action `SPAWN_ENEMIES`):

```ts
function getEnemyCount(room: RoomState, activeHeroesCount: number): number {
  if (activeHeroesCount <= 2) return room.enemiesByPlayers[0]
  if (activeHeroesCount <= 4) return room.enemiesByPlayers[1]
  if (activeHeroesCount <= 6) return room.enemiesByPlayers[2]
  return room.enemiesByPlayers[3]
}
```

Onde `activeHeroesCount = state.heroes.filter(h => h.status === "active").length`.

### Casos especiais

- Se `enemiesByPlayers[faixa]` for `0`, a sala não tem combate (sala vazia). Resolve efeito, recompensa e XP, e segue.
- Se todos os heróis morrerem ou fugirem antes da próxima carta de dungeon ser sacada, a partida termina em derrota (não tem como spawnar contra 0 heróis).

### Implicações no reducer

- `SPAWN_ENEMIES` em `core/reducer/exploration.ts` precisa fazer o lookup correto.
- O cálculo é **sempre no momento do saque**, nunca antes (não armazenar quantidade de spawn em campo persistente).

### Implicações na UI

- Não muda visual diretamente, mas a contagem de heróis ativos deve estar visível no topo da tela (já está, no contador da barra superior — pode adicionar "{n} heróis ativos" se ajudar).

---

## Mudança 2 — Seleção de herói e inventário individual

### Decisão

Cada herói tem seu **próprio inventário** (mochila + equipamentos ativos + estados). A UI precisa permitir o jogador clicar em qualquer herói para ver e gerenciar **o inventário daquele herói**.

### Conceito de "herói em foco"

Introduz-se o conceito de **herói em foco** (`focusedHeroId` no estado da UI, não do jogo). Este é o herói cujo inventário aparece detalhado no painel inferior.

- **Fora de combate**: jogador clica em qualquer card de herói para mudar o foco. O painel inferior atualiza para mostrar habilidade, poder, mochila e equipamentos daquele herói.
- **Em combate**: o foco geralmente acompanha o **herói ativo** (cuja vez é agir), mas o jogador ainda pode clicar em outros heróis para consultar seus inventários sem mudar a ordem do combate.

### Painel de detalhes do herói em foco

Conforme já especificado no Patch 1, o painel inferior mostra para o herói em foco:
- Habilidade (passiva)
- Poder (ativo, com badge de uso)
- Mochila (com chips de itens guardados)
- Equipamentos ativos (4 slots: Equipável, Utilitário, Consumível, Especial)

### Distinção visual

- Card do herói em foco tem **borda destacada** (mais grossa, cor de destaque).
- Card do herói ativo em combate tem **indicador adicional** (ex: ícone "▶" ou label "agindo agora") sem alterar o foco.
- Cards de heróis derrotados aparecem **atenuados** (cinza, opacidade reduzida) e **não são clicáveis**.
- Cards de heróis que fugiram aparecem com **visual diferente** (ex: borda tracejada, label "fugiu") e **não são clicáveis** durante a exploração corrente.

### Comportamento ao clicar

- **Clicar em card de herói ativo** → muda foco para esse herói (atualiza painel inferior).
- **Clicar em arte/nome do herói** dentro do card → abre modal de detalhes completos da carta (igual a outras cartas).
- **Clicar em item da mochila do herói em foco** → abre modal com opções (equipar, descartar, transferir para outro herói).
- **Clicar em equipamento ativo do herói em foco** → abre modal de detalhes do item + opções (mover para mochila, descartar).

### Implicações no estado

- `GameState` não muda — heróis já têm `activeItems` e `backpack` individuais.
- A **store do Zustand** ganha um campo `ui.focusedHeroId: string` (separado do `state` do jogo). Esse campo:
  - Não é serializado como parte do save (é UI state, não game state).
  - Default = primeiro herói ativo da lista.
  - Atualizado por action `SET_FOCUSED_HERO` ou similar (UI action, não game action).

### Implicações na UI

- Cards de herói viram clicáveis (cursor: pointer, hover state).
- Layout B (2-4 heróis) e Layout C (5-8 heróis) do bloco 6 da Exploração ficam mais relevantes — usuário precisa ver todos os heróis pra escolher onde clicar.
- Adicionar tooltip ou label visual indicando "clique para gerenciar".

---

## Mudança 3 — Pareamento herói↔monstro em combate (sequencial)

### Decisão

Em cada rodada de combate, o jogador escolhe **qual herói ataca qual monstro**, em fluxo **sequencial**:

1. Sistema mostra heróis disponíveis (vivos, ativos, que ainda não agiram nesta rodada) e monstros disponíveis (vivos, ainda não engajados nesta rodada).
2. Jogador clica em um herói → herói selecionado.
3. Jogador clica em um monstro → cria par.
4. Combate desse par é **resolvido imediatamente** (rolagem, dano, verificação de morte).
5. Sistema volta para passo 1 com o próximo herói disponível.
6. Loop continua até:
   - Todos os heróis disponíveis terem agido **ou passado**, ou
   - Não restarem monstros vivos.

Após a rodada acabar, sistema processa **dano direto** das criaturas que ficaram sem oponente, depois inicia nova rodada (se ambos os lados têm cartas vivas).

### Opção de "passar" o herói

O jogador pode optar por **não parear um herói** na rodada, mesmo havendo monstros disponíveis. Isso é tática válida — economiza poderes ou espera momento melhor.

UI: cada herói disponível na rodada tem 2 caminhos:
- **Clicar no herói → escolher monstro → atacar** (caminho normal).
- **Botão "passar a rodada"** que aparece quando o herói está selecionado, ou opção no menu de ações do herói.

Heróis que passam a rodada:
- Não aparecem na lista de "heróis disponíveis" pelo resto da rodada.
- Não causam ataque, não rolam dados, não sofrem dano direto (eles já agiram, mesmo que tenha sido passando).
- Voltam a estar disponíveis na próxima rodada.

### Validações importantes

- Um monstro **não pode ser engajado por mais de 1 herói** na mesma rodada (regra do manual). Após ser pareado, fica visualmente bloqueado.
- Um herói **não pode agir duas vezes** na mesma rodada.
- Se um herói for derrotado durante a resolução do combate dele, ele simplesmente sai e a rodada continua com os demais.

### Actions afetadas no reducer

Em `core/reducer/combat.ts`, ajustar/criar:

- `CHOOSE_HERO_FOR_ROUND` — jogador seleciona herói para agir agora. Validações: herói está ativo, vivo, não agiu nesta rodada.
- `CHOOSE_TARGET` — jogador escolhe monstro. Validações: monstro está vivo, não foi engajado nesta rodada.
- `PASS_HERO_ACTION` — herói selecionado passa a rodada. Marca herói como "agiu" sem combate.
- `ROLL_AND_RESOLVE` — sequência completa: rola dados, calcula totais, aplica dano, verifica morte. Pode ser uma única action que dispara internamente as outras, ou continuar como sequência de actions (`ROLL_DICE` → `RESOLVE_ATTACK` → `APPLY_DAMAGE` → `CHECK_HERO_DEATH` → `CHECK_ENEMY_DEATH`).
- `END_HERO_ACTION` — fim do turno de 1 herói. Verifica se há mais heróis disponíveis. Se sim, volta para `CHOOSE_HERO_FOR_ROUND`. Se não, transita para `DIRECT_DAMAGE`.
- `DIRECT_DAMAGE` — para cada monstro vivo não engajado, causa dano direto a 1 herói (strategy `targetSelection`).
- `END_ROUND` — limpa `heroesActed` e `enemiesEngaged`. Verifica fim de combate. Se ambos lados têm vivos, inicia nova rodada.

### Fluxo de UI durante combate

A tela de combate (Bloco 4 e Bloco 5 da Exploração) deve passar pelos seguintes **micro-estados**:

**1. Escolhendo herói (`combatPhase: "selecting_hero"`)**
- Heróis disponíveis: destacados, clicáveis, cursor pointer.
- Heróis já agiram: visual atenuado, label "já agiu", não clicáveis.
- Monstros: visíveis mas não clicáveis ainda (cursor default).
- Painel de rolagem: oculto ou mostra "Aguardando seleção de herói".
- Botões de ação: ocultos.

**2. Escolhendo monstro (`combatPhase: "selecting_target"`)**
- Herói selecionado: borda mais grossa + label "selecionado".
- Outros heróis disponíveis: ainda clicáveis (pra trocar a seleção).
- Monstros disponíveis: destacados, clicáveis.
- Monstros já engajados: visual atenuado, label "engajado por: {herói}", não clicáveis.
- Painel de rolagem: oculto.
- Botões: aparecem "Atacar" (destaque), "Passar a rodada", "Usar item" e "Usar poder" (se aplicáveis ao herói selecionado), "Cancelar seleção".

**3. Resolvendo combate (`combatPhase: "resolving"`)**
- Herói e monstro pareados: destacados, com setinha ou linha conectando-os.
- Painel de rolagem: **ativo**, mostra dados rolados, bônus discriminados, totais.
- Botões: "Continuar" (após animação/leitura).

**4. Pós-resolução, antes do próximo herói (`combatPhase: "between_heroes"`)**
- Volta para fase 1 se ainda há heróis disponíveis.
- Transita para fase 5 se não há mais.

**5. Dano direto (`combatPhase: "direct_damage"`)**
- Monstros sem oponente são destacados.
- Cada herói atingido por dano direto é destacado.
- Mensagem clara: "{monstro} atacou {herói} causando {n} de dano."
- Botão "Continuar" avança para fim de rodada.

**6. Fim de rodada / nova rodada (`combatPhase: "round_end"`)**
- Limpa estados temporários.
- Volta para fase 1 se combate continua.
- Vai para fase de recompensa se combate terminou.

### Implicações no estado

`CombatState` ganha campos:
- `phase: "selecting_hero" | "selecting_target" | "resolving" | "between_heroes" | "direct_damage" | "round_end"`
- `selectedHeroId: string | null` (herói selecionado mas ainda sem alvo)

Os outros campos (`heroesActed`, `enemiesEngaged`, `pairs`, `lastRoll`) já estavam previstos.

### Implicações na UI (componentes)

- **`HeroCard`** (componente) ganha props: `isSelected`, `hasActed`, `isFocused`, `isActive`. Variantes visuais conforme.
- **`EnemyCard`** ganha props: `isEngaged`, `engagedBy`, `isSelectable`.
- Novo componente: **`CombatActionPanel`** — encapsula os botões dinâmicos ("Atacar", "Passar", "Usar item", etc.) que aparecem após o herói ser selecionado.

---

## Como aplicar este patch (instruções para o Sonnet)

Se ainda **não começou a implementar**: use os documentos atualizados nesta rodada. Patch 1 + Patch 2 já estão refletidos.

Se **já começou** algum marco:

**Marco 1 e 2** — sem mudança.

**Marco 3 (Loader)** — sem mudança.

**Marco 4 (Regras puras)** — sem mudança.

**Marco 5 (Reducer)** — revisar:
- `SPAWN_ENEMIES`: usar lookup dinâmico com `getEnemyCount(room, activeHeroesCount)`.
- Adicionar campo `phase` no `CombatState`.
- Adicionar `selectedHeroId` no `CombatState`.
- Renomear/criar actions: `CHOOSE_HERO_FOR_ROUND`, `CHOOSE_TARGET`, `PASS_HERO_ACTION`, `END_HERO_ACTION`, `END_ROUND`.
- Cada action transita o `phase` corretamente.

**Marco 6 (Store)** — adicionar:
- Campo `ui.focusedHeroId: string` no Zustand store (separado de `state`).
- Action `setFocusedHero(heroId)` no store.
- Seletor `selectFocusedHero(state, ui)` para a UI usar.

**Marco 7 (UI)** — adicionar:
- Cards de herói clicáveis com estados visuais (focused, active, hasActed, defeated, fled).
- Painel inferior atualiza conforme `focusedHeroId`.
- Fluxo de combate em 6 micro-estados conforme acima.
- Novo componente `CombatActionPanel`.

**Marco 8 (Polimento)** — adicionar smoke test:
- Combate com 3 heróis e 4 monstros: parear sequencialmente, deixar 1 herói passar, ver dano direto, completar rodada.

---

## Pontos abertos pós-Patch 2

1. **Patch 3 — Anatomia visual de sala, item, artefato, chefe.** Ainda aberto.
2. **Padronização do `dice` do boss** — `dice: string` no Azhakar deve virar `diceByColor: [3,3,3,3,3]`.
3. **IDs estáveis nas cartas** — atualmente identificadas por `name`.
4. **Efeitos estruturados de cartas** — efeitos continuam como string crua.
5. **Localização** — i18n.
