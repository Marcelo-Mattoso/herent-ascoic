# Patch 30 — Ajustes do autor (lote 01): bloqueio de ataque, acesso à habilidade, cartas de dungeon

**Origem:** [docs/issues/ajustes-do-autor-01.txt](../issues/ajustes-do-autor-01.txt) (status: aberto).

**Objetivo:** implementar os três ajustes reportados pelo autor, corrigindo antes as premissas
que não batem com o código atual (ver "Correções de diagnóstico" abaixo).

---

## Correções de diagnóstico

O documento de origem foi escrito a partir de leitura parcial do código. Levantamento feito
antes deste patch:

| Afirmação em `ajustes-do-autor-01.txt` | Realidade no código |
|---|---|
| "USE_POWER adiciona o herói a `heroesActed` (combat.ts:790)" | O caminho **normal** de `handleUsePower` ([combat.ts:894](../../src/core/reducer/combat.ts:894)) **não** toca `heroesActed` — só marca `powersUsedThisRoom` e dispara `fireOnUseSkill`. Quem empurra para `heroesActed` é apenas o ramo do item `once_per_combat_instead_of_attack` (Tiro de Oportunidade, [combat.ts:848](../../src/core/reducer/combat.ts:848)), onde encerrar o turno é o comportamento pretendido pela própria skill. |
| "`canAttack` já deve verificar o novo campo" | `canAttack` hoje é só `isSelectingTarget && hasActiveEnemies` ([selectors.ts:217](../../src/ui/store/selectors.ts:217)). Não existe nenhum bloqueio pós-poder. |
| "Usar item ainda deve ser permitido após poder/habilidade" | O botão "Usar item" no painel está **hardcoded `disabled`** ([HeroFocusPanel.tsx:469](../../src/ui/components/HeroFocusPanel.tsx:469)) em todas as fases. O uso de item hoje só acontece por outro fluxo (mochila/inventário). Permitir item pós-poder exige habilitar esse botão — escopo adicional, tratado no Lote A. |
| "`skill_forge_spoils` olha cartas da **dungeon**" | O efeito é `i_draw_and_choose` com `pile: item_deck` ([skills.yaml:249](../../src/data/skills.yaml:249)) — revela 2 cartas do **deck de itens**, não da dungeon. |
| "a UI não oferece nenhuma tela/modal para o jogador escolher" | Existe: `i_draw_and_choose` e `i_reveal_dungeon` já gravam `pendingSkillChoice` ([resolver.ts:496](../../src/core/effects/resolver.ts:496) e [resolver.ts:543](../../src/core/effects/resolver.ts:543)), projetado em `PlayerView.pendingSkillChoice` e renderizado por `SkillChoiceModal` ([Exploration.tsx:342](../../src/ui/screens/Exploration.tsx:342)). O que falta não é o modal — é (a) `label` legível (hoje é o `cardId` cru) e (b) qualquer caminho de **ativação** fora de combate. |
| "`skill_return_rite` não tem interface" | Correto na prática, mas a causa é outra: `ActionSection` faz `if (!isInCombat) return null` ([HeroFocusPanel.tsx:407](../../src/ui/components/HeroFocusPanel.tsx:407)). Skills `op_active` são inacessíveis durante exploração porque o bloco inteiro de ações some. |

Consequência: os Ajustes 1 e 2 continuam válidos, com escopo redesenhado. O Ajuste 3 vira
majoritariamente **UI + habilitação**, não novo mecanismo de core.

---

## Lote A — Bloqueio de ataque por poder/habilidade

**Escopo:** um herói que usou poder ou habilidade ativa na rodada não pode mais atacar,
mas continua no turno (pode usar item e depois passar).

**Mudanças:**

1. `src/core/state/combatState.ts`: novo campo

   ```ts
   // Heróis que usaram poder ou habilidade ativa nesta rodada — não podem mais atacar
   readonly attackBlockedByHero: Readonly<Record<string, boolean>>;
   ```

   Inicializar `{}` em `createEmptyCombatState()`.

2. Helper único em `src/core/reducer/combat.ts` (evita duplicar o spread em 3 lugares):

   ```ts
   export function blockAttack(state: GameState, heroId: string): GameState
   ```

   Retorna o estado com `combat.attackBlockedByHero[heroId] = true` (no-op se `combat` for null).

3. Chamadas:
   - `handleUsePower` ([combat.ts:894](../../src/core/reducer/combat.ts:894)): aplicar `blockAttack` junto com `powersUsedThisRoom`, antes do `fireOnUseSkill`.
   - `USE_SKILL` ([reducer/index.ts:205](../../src/core/reducer/index.ts:205)): aplicar `blockAttack(state, payload.sourceId)` antes de `fireOnUseSkill` — **somente** quando o `sourceId` for um herói e a skill for `op_active`/`op_active_buff` (usar `isManuallyActivatable`, já exportado em [useSkill.ts:14](../../src/core/skills/useSkill.ts:14)). Skills disparadas por evento não bloqueiam ataque.
   - O ramo Tiro de Oportunidade ([combat.ts:848](../../src/core/reducer/combat.ts:848)) fica como está: aquela skill declara "no lugar do ataque" e encerra o turno de propósito.

4. Reset por rodada: onde `heroesActed: []` é reatribuído no avanço de rodada
   ([combat.ts:668](../../src/core/reducer/combat.ts:668)), na limpeza de sala
   ([combat.ts:651](../../src/core/reducer/combat.ts:651)) e em `boss.ts:147`, zerar também
   `attackBlockedByHero: {}`.

5. Guarda no core (não só na UI): `handleChooseTarget` ([combat.ts:150](../../src/core/reducer/combat.ts:150))
   rejeita com log se `attackBlockedByHero[heroId]` — mesma forma da guarda de `heroesActed` logo acima.

6. Projeção: expor `attackBlockedByHero` em `PlayerView.combat`
   ([playerView.ts:89](../../src/core/projection/playerView.ts:89) e `:172`).

7. UI:
   - `selectHeroCombatActions` ([selectors.ts:217](../../src/ui/store/selectors.ts:217)):
     `canAttack = isSelectingTarget && hasActiveEnemies && !attackBlocked`.
   - `canUsePower` já é bloqueado por `powersUsedThisRoom`; adicionar `canUseSkill` explícito
     ao `HeroCombatActions` (hoje o botão calcula `!alreadyUsed` inline) para centralizar a regra.
   - Habilitar o botão "Usar item" ([HeroFocusPanel.tsx:469](../../src/ui/components/HeroFocusPanel.tsx:469)),
     ligado ao fluxo de mochila já existente, para que "poder não bloqueia item" seja verdade na tela.
     Se o fluxo de seleção de item pelo painel não existir, abrir o inventário do herói — **decidir na
     implementação**; se custar mais que trivial, cortar para o Lote C e registrar aqui.

**Critério de aceite:**
- Teste: herói usa poder → `CHOOSE_TARGET` para o mesmo herói é rejeitado com log; `PASS_HERO_ACTION` continua funcionando.
- Teste: herói usa skill `op_active` → mesmo comportamento.
- Teste: skill disparada por evento (`op_triggered`) **não** bloqueia ataque.
- Teste: virada de rodada limpa `attackBlockedByHero`.
- UI: botão "Atacar" desabilitado após poder/habilidade; "Usar item" e "Passar rodada" continuam ativos.
- Suíte completa passa.

**Risco:** baixo-médio. Campo novo em `CombatState` afeta snapshots/replay — ver Riscos globais.

---

## Lote B — Acesso ao botão "Usar habilidade"

**Escopo:** tornar a habilidade ativa descobrível, sem exigir que o jogador entre em
`selecting_target` antes.

**Mudanças:**

1. `ActionSection`, ramo `isSelectingHero` ([HeroFocusPanel.tsx:409-456](../../src/ui/components/HeroFocusPanel.tsx:409)):
   renderizar também "Usar habilidade" (✨), desabilitado, com `title="Selecione seu herói no tabuleiro primeiro"`.
   Isso é a Opção B do documento de origem — o botão passa a existir nas duas fases, o que remove a
   assimetria que causou a confusão.

2. Caixa "📖 Habilidade" no card info ([HeroFocusPanel.tsx:180+](../../src/ui/components/HeroFocusPanel.tsx:180)):
   quando `isManuallyActivatable(def)`, ganhar aparência de botão (`cursor: pointer`, hover, borda)
   e disparar o mesmo `onUseSkill` quando habilitada; quando não ativável, permanece texto puro.
   Reaproveitar o descritor `heroActions.skill` em vez de recalcular `cardSkills` no JSX.

3. `ActionButton` precisa aceitar `title` para o tooltip (verificar se já aceita; se não, adicionar).

**Critério de aceite:**
- Em `selecting_hero`, o botão "Usar habilidade" aparece desabilitado com tooltip.
- Em `selecting_target` com o herói selecionado, o botão habilita (comportamento atual preservado).
- A caixa de habilidade é clicável exatamente quando o botão está habilitado — os dois caminhos
  chamam `onUseSkill(skillId, heroId)` e não divergem.
- Nenhum teste de UI existente quebra.

**Risco:** baixo. Só UI.

---

## Lote C — Cartas de dungeon: ativação fora de combate e escolha legível

**Escopo:** o que realmente falta para `skill_return_rite` e `skill_forge_spoils` serem jogáveis.

### C1 — Ações do herói durante exploração

`ActionSection` retorna `null` fora de combate, então nenhuma skill `op_active` é acionável
em `REVEAL_ROOM` / exploração — que é justamente quando `skill_return_rite`
("1×/sala, paga 3 vida, recupera carta de dungeon") faz sentido.

- Trocar o early-return por um ramo de exploração que renderiza **apenas** as ações válidas fora
  de combate: hoje, "Usar habilidade" (quando `skill.activatable && !skill.alreadyUsed`) e "Usar item".
- `selectHeroCombatActions` precisa deixar de assumir combate: quando `view.combat` é `null`,
  todas as flags de combate ficam `false` e só o descritor `skill` é calculado. Renomear para
  `selectHeroActions` **não** faz parte deste patch (churn desnecessário); apenas documentar
  no JSDoc que também serve à exploração.
- Verificar o guard de `once_per_room` de `skill_return_rite`: `isSkillGuardConsumed` lê
  `combat.oncePer.room`, que vive dentro de `CombatState`. Fora de combate `state.combat` pode ser
  `null` → o guard nunca consome e a skill vira infinita. **Item crítico deste lote:** mover o
  escopo `room` de `oncePer` para `GameState` (fora de `combat`), ou usar `state.flags` com chave
  `oncePerRoom::<skillId>::<heroId>`. Preferir a primeira — o escopo "sala" é de exploração, não de combate.

### C2 — Rótulos legíveis na escolha

`i_draw_and_choose` e `i_reveal_dungeon` montam `options` com `label: cardId`
([resolver.ts:516](../../src/core/effects/resolver.ts:516) e `:553`) — o jogador vê
`item_cracked_shield`. Trocar por `getCardName(cardId)` (loader do patch-29) e incluir o
`cardId` cru em campo separado da option para a UI conseguir abrir o `CardDetailModal`.

`SkillChoiceModal` passa a renderizar cada opção como carta clicável (nome + tipo + acesso ao
detalhe), em vez de lista de botões de texto.

### C3 — Nada de `DungeonLookModal` novo

O documento de origem pede um modal novo. Não criar: `pendingSkillChoice` + `SkillChoiceModal`
já cobrem o caso e criar um segundo modal duplicaria o fluxo. Se depois surgir um efeito que
precise de reordenação/manipulação da pilha (não só escolha), aí sim reavaliar.

### C4 — Fora de escopo (registrar, não fazer)

- Itens com efeito de "virar" ou "pular" carta de dungeon (Parte 3 opcional do documento de origem).
- `dungeon_skill_forge_spoils` duplicado de `skill_forge_spoils` só por `category` — cai no
  refactor já registrado em [pendencias-skills.md](../issues/pendencias-skills.md).

**Critério de aceite:**
- Teste: `skill_return_rite` executada em exploração paga 3 de vida, recupera carta do descarte
  da dungeon e **não** pode ser executada uma segunda vez na mesma sala.
- Teste: guard `once_per_room` funciona com `state.combat === null`.
- Teste: `pendingSkillChoice.options[].label` de `i_draw_and_choose` retorna nome pt-BR, não id.
- UI: em exploração, o painel do herói mostra "Usar habilidade" habilitado para um herói com
  skill ativa disponível.
- Suíte completa passa.

**Risco:** médio. C1 mexe no ciclo de vida de guards `once_per_room` — é mudança de estado com
alcance maior que os outros lotes.

---

## Ordem de execução

```
Lote A  →  Lote B  →  Lote C
```

A e B são independentes entre si e podem ser paralelizados; C depende de B (usa o mesmo
descritor `skill` e o mesmo botão).

---

## Riscos globais

- **`CombatState` ganha campo novo (Lote A):** replays/saves gravados antes do patch não têm
  `attackBlockedByHero`. Verificar [src/core/replay/](../../src/core/replay/) e
  `src/core/ports/persistence.ts`; tratar ausência como `{}` na desserialização.
- **Mover `oncePer.room` para fora de `CombatState` (C1)** é mudança estrutural: todo consumidor
  de `state.combat.oncePer.room` precisa migrar de uma vez. Fazer em commit isolado.
- **Regra de jogo, não só código:** "poder/habilidade bloqueia ataque" muda o balanceamento de
  combate. Confirmar com o autor se vale para **todas** as skills `op_active` ou só para as de
  efeito ofensivo antes de fechar o Lote A.
- **Botão "Usar item" (A.7):** se habilitá-lo exigir construir um fluxo de seleção de item que
  hoje não existe no painel, o Ajuste 1 fica pela metade ("poder não encerra turno" vale, mas o
  jogador continua sem usar item pelo painel). Medir cedo e decidir.
