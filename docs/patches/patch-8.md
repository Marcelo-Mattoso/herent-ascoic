# Patch-8 — Mecânicas pendentes + onda 1 de handlers reais

## Contexto

O Patch-7 entregou a engine genérica de habilidades ([src/core/skills/dispatch.ts](src/core/skills/dispatch.ts)) e ~15 handlers reais. As ~35 skills restantes estão como `noop` em [src/core/skills/handlers/index.ts:49-57](src/core/skills/handlers/index.ts:49) — não quebram runtime, só logam `[SKILL NÃO IMPLEMENTADA]`. A lista está em [docs/patch-7-pendencias.md](docs/patch-7-pendencias.md).

Releitura dos specs (manual v2 §8.9 e §20.4, glossário) mostra que **dois bloqueios marcados como P3 são na verdade pequenos**:

1. **Fuga** está totalmente especificada (§8.9 do manual): só com 1 de vida, vence o próximo confronto, criatura volta ao deck, herói sai da dungeon, se todos fugirem reinicia masmorra. Não é "mecânica nova grande", é um **modo alternativo do combate atual**.
2. **Efeito Roxo** não envolve "rolagem de dado roxo" nenhuma — o glossário diz "efeito especial que só permanece ativo enquanto o Despertar da Masmorra estiver em Roxo". É um **filtro de gatilho**, não uma mecânica.

Este patch fecha **todas as pendências de skills + mecânicas correlatas**, deixando o catálogo completamente implementado (sem `noop`). Inclui infra nova (trigger `on_deal_damage`, sistema de tokens, hooks de redirecionamento de alvo, subchefes, modo competitivo) quando exigida por alguma skill ou pelo manual. As fases são incrementais e cada uma é commitável isolada.

## Princípios

1. **Não inventar nada que o manual não cobre.** Todas as regras de fuga, efeito roxo, prender, escudo e dano direto vêm do manual v2 (`docs/spec/v2/Ascensão Heróica - ajustado com FAQ-v2.pdf`).
2. **Handlers continuam puros.** Nenhum handler novo introduz I/O, mutação ou aleatoriedade fora de `rollDice`.
3. **UI mínima.** Botão "🏃 Fugir" já está especificado em [spec-telas-mvp1.md:285](docs/spec-telas-mvp1.md:285); só é preciso ligar. Para `SKILL_TARGETING`, um único modal genérico (lista de opções rotuladas + botão) atende todas as skills da onda B.
4. **Hard-codes só onde a engine não chega.** Se uma skill é `usedBy: []` no catálogo, **não implementar** — só vira `noop` documentado. Implementar apenas o que aparece em criatura/item/sala que efetivamente entra no jogo durante a Fornalha Sombria.
5. **Bump menor por fase entregue.** Cada fase termina commitável e testável isoladamente, com bump de patch (0.8.x).

## Arquivos novos

```
src/core/rules/flee.ts                                # cálculo da rolagem de fuga (pura)
src/core/rules/flee.test.ts
src/core/skills/handlers/flee_block.ts                # impede tentativa de fuga
src/core/skills/handlers/heal_block.ts                # bloqueia cura
src/core/skills/handlers/tohit_penalty.ts             # -N no acerto
src/core/skills/handlers/discardDungeon.ts            # descarte forçado
src/core/skills/handlers/itemControl.ts               # ignorar 1º efeito de item
src/core/skills/handlers/targetProtection.ts          # ignorar 1º efeito que escolha o herói
src/core/skills/handlers/discardDungeonLock.ts        # impede discardDungeon_prevention
src/core/skills/handlers/reward.ts                    # impede recompensa (Fuga Covarde)
src/core/skills/handlers/__tests__/onda_a.test.ts
src/core/skills/handlers/__tests__/onda_b.test.ts
src/ui/components/modals/SkillChoiceModal.tsx        # modal genérico de escolha
src/ui/components/modals/FleeReconfigureModal.tsx    # reinício de masmorra após fuga geral
```

## Arquivos modificados

- [src/core/state/heroState.ts](src/core/state/heroState.ts) — adicionar `healBlocked?: boolean` por herói (efeito da fumaça da fornalha).
- [src/core/state/combatState.ts](src/core/state/combatState.ts) — adicionar `fleeAttemptByHero?: Record<string, boolean>` (marca que herói declarou fuga e o próximo confronto é "rolagem de fuga"), `tohitPenaltyByHero?: Record<string, number>`, `itemControlByEnemy?: Record<string, boolean>` (ignorar 1º efeito de item contra essa criatura), `targetProtectionByHero?: Record<string, boolean>`.
- [src/core/state/gameState.ts](src/core/state/gameState.ts) — adicionar `flags.discardDungeonLocked?: boolean` (cancela prevenção do caminho preservado).
- [src/core/actions/types.ts](src/core/actions/types.ts) — novas actions:
  - `DECLARE_FLEE { payload: { heroId: string } }`
  - `RESOLVE_FLEE { payload: { heroId: string } }` (dispara após a rolagem do próximo combate)
  - `RESTART_DUNGEON { payload: { keepEquipment: boolean } }` (após fuga geral)
  - `SKILL_CHOICE { payload: { skillId: string; choice: string } }`
- [src/core/actions/creators.ts](src/core/actions/creators.ts) — creators correspondentes.
- [src/core/reducer/combat.ts](src/core/reducer/combat.ts) — `handleDeclareFlee`, `handleResolveFlee`; em `handleResolveAttack`, ramificar quando `combat.fleeAttemptByHero[heroId]` é true: vitória → fuga concretiza; derrota/empate → herói sofre dano normalmente; aplicar `tohitPenaltyByHero` em `collectHeroBonuses`.
- [src/core/reducer/exploration.ts](src/core/reducer/exploration.ts) — `handleRestartDungeon`; em `handleDiscardPaths`, respeitar `flags.discardDungeonLocked`.
- [src/core/reducer/reward.ts](src/core/reducer/reward.ts) — em `handleGrantRewards`, pular criaturas com `noReward: true` (marcadas pelo handler `reward` da Fuga Covarde) e criaturas com status `"fled"`.
- [src/core/reducer/index.ts](src/core/reducer/index.ts) — cases para as 4 actions novas.
- [src/core/skills/dispatch.ts](src/core/skills/dispatch.ts) — em `collectActiveSkills`, ao iterar `purpleEffect` de inimigos, filtrar `state.dungeonAwakening === 4` (Roxo).
- [src/core/skills/handlers/index.ts](src/core/skills/handlers/index.ts) — remover os tipos correspondentes da lista `noopTypes` conforme as fases avançam.
- [src/core/skills/__tests__/dispatch.test.ts](src/core/skills/__tests__/dispatch.test.ts) — caso "purpleEffect não dispara fora do Roxo".
- [src/ui/components/HeroFocusPanel.tsx](src/ui/components/HeroFocusPanel.tsx) — habilitar botão "🏃 Fugir" quando `hero.currentLife === 1`; despachar `DECLARE_FLEE`.
- [src/ui/components/modals/index.ts](src/ui/components/modals/index.ts) — registrar os 2 modais novos.
- [src/ui/store/gameStore.ts](src/ui/store/gameStore.ts) — expor `pendingSkillChoice` (skill que abriu modal) e `resolveSkillChoice(choice)`.
- [docs/patch-7-pendencias.md](docs/patch-7-pendencias.md) — atualizar prioridades (fuga sai de P3; efeito roxo deixa de "depender de mecânica não implementada"); marcar handlers implementados nesta entrega.
- [docs/arquitetura-mvp1.md](docs/arquitetura-mvp1.md) — adicionar §5.10 "Fuga", §5.11 "Efeito Roxo"; atualizar a seção "Pendências" para apontar para patch-8.

---

## Ordem de execução (dependências)

As fases estão **numeradas por tema**, não por ordem de execução. O Sonnet deve executar nesta ordem, agrupando em sessões para minimizar carregamento de contexto.

### Grafo de dependências

```
F1  (filtro Efeito Roxo)      ──┐
F2  (Onda A — handlers puros) ──┤  raízes (sem dependência)
F11 (Tokens)                  ──┤
F13 (Subchefes)               ──┤
F14 (Modo competitivo)        ──┘

F4 (SKILL_CHOICE) ──┬──> F5  (Onda B)
                    ├──> F9  (Redirecionamento)
                    └──> F12 (drawItem / recover_item)

F3 (Fuga)        — independente, mas grande (state + reducer + UI)
F6 (on_deal_damage + Drenar Vida)  — toca combat.ts profundamente
F7 (splash + Tiro de Oportunidade) — toca combat.ts no mesmo cluster que F6
F8 (Reroll interativo)             — state + UI isolados
F10 (purple_damage_reduction)      — depende de F1 (efeito roxo filtrado)

F15 (limpeza) — depende de TODAS.
```

### Ordem recomendada de execução

Para cada sessão que envolve UI, consultar a seção correspondente em [docs/wireframes-patch-8.html](docs/wireframes-patch-8.html) antes de escrever código — os wireframes definem hierarquia visual, estados (default/hover/disabled), microcopy e tokens de cor.

| # | Fase | Sessão | Wireframe | Por quê nessa posição |
|---|---|---|---|---|
| 1 | **F1** Filtro Efeito Roxo | A | §7 "Indicador visual de Efeito Roxo ativo" | 10 linhas, destrava F10 sem custo |
| 2 | **F2** Onda A | A | — (sem UI) | 5 handlers puros, mesmo arquivo de registro; agrupa com F1 |
| 3 | **F4** SKILL_CHOICE + modal | B | §3 "SkillChoiceModal" (variantes A/B/C) | Caminho crítico: destrava F5, F9, F12 |
| 4 | **F5** Onda B | B | §3 (reusa o mesmo modal) | Reusa o modal recém-criado — mesmo contexto |
| 5 | **F3** Fuga | C | §1 "Botão Fugir + estados de card" + §2 "FleeReconfigureModal" | Mecânica isolada (state + combat + UI); 1 sessão dedicada |
| 6 | **F6** `on_deal_damage` + Drenar Vida | D | — (sem UI) | Abre o cluster de mudanças em combat.ts |
| 7 | **F7** Splash + Tiro de Oportunidade | D | — (sem UI nova; reusa botão "⚡ Usar poder") | Mesmo arquivo (combat.ts) — agrupar |
| 8 | **F8** Reroll interativo | E | §4 "Dados clicáveis" (3 estados) | State + UI isolados em DiceDisplay |
| 9 | **F9** Redirecionamento | F | §3 (reusa SkillChoiceModal) | Depende de F4; toca combat.ts mas leve |
| 10 | **F11** Tokens | G | — (sem UI obrigatória; visualização opcional) | Subsistema isolado (state + lookup novos) |
| 11 | **F12** drawItem / recover_item | G | §3 variante C "lista do descarte" | Reusa SKILL_CHOICE; pequeno; pode anexar à sessão de tokens |
| 12 | **F10** purple_damage_reduction | H | §7 (mesmo indicador da F1) | Depende de F1; precisa do trigger `on_purple_effect_damage_taken` ligado |
| 13 | **F13** Subchefes | I | §5 "Subchefe + sala especial" | Toca data + reducer + UI; sessão dedicada |
| 14 | **F14** Modo competitivo | J | §6 "Modo competitivo" (3 telas) | Toca setup + painel + vitória; sessão dedicada |
| 15 | **F15** Limpeza + docs | K | — | Última — exige todas as outras prontas |

### Agrupamento por sessão Sonnet

Cada sessão começa carregando o contexto do projeto (CLAUDE.md, types, etc.). Agrupar fases que tocam **os mesmos arquivos** evita pagar esse custo várias vezes:

- **Sessão A** (core puro, registry): F1 + F2 → 6 handlers + 1 filtro. Toca `dispatch.ts`, `handlers/*.ts`, `handlers/index.ts`.
- **Sessão B** (SKILL_CHOICE end-to-end): F4 + F5 → modal + 4 handlers que o usam. Toca `gameState.ts`, `actions/`, `reducer/index.ts`, `modals/SkillChoiceModal.tsx`, `handlers/*.ts`.
- **Sessão C** (Fuga): F3 sozinha. Toca `combatState.ts`, `combat.ts`, `exploration.ts`, `reward.ts`, `rules/flee.ts`, `HeroFocusPanel.tsx`, `FleeReconfigureModal.tsx`.
- **Sessão D** (triggers de dano): F6 + F7 → ambos mexem em `combat.ts` no ponto de aplicar dano e destruir criatura. Toca `combat.ts`, `skillTypes.ts`, novos handlers.
- **Sessão E** (Reroll): F8. Toca `combatState.ts`, `combat.ts`, `actions/`, `DiceDisplay.tsx`, novo handler `reroll`.
- **Sessão F** (Redirect): F9. Toca `combat.ts`, `skillTypes.ts`, novo handler.
- **Sessão G** (Tokens + residuais): F11 + F12. Toca `tokens.ts` novo, `gameState.ts`, 2 handlers pequenos.
- **Sessão H** (Redução roxa): F10. Toca `lookup.ts`, handler novo, ponto de aplicar dano roxo.
- **Sessão I** (Subchefes): F13. Toca `cards.ts`, `cardTypes.ts`, `defaults.ts`, `progression.ts`, `exploration.ts`, `reward.ts`, `EnemyCard.tsx`, `RoomCard.tsx`.
- **Sessão J** (Competitivo): F14. Toca `gameState.ts`, `Setup.tsx`, `BoardFooter.tsx`, `HeroFocusPanel.tsx`, `Victory.tsx`.
- **Sessão K** (Limpeza): F15. Só docs.

11 sessões no total. Sonnet pode rodar todas em sequência sem ambiguidade — cada uma tem critério de aceite próprio (commit + bump de patch).

### Princípio de checkpoint

Ao **fim de cada sessão**, antes de partir para a próxima:
1. `npm test` passa.
2. `noopTypes` em [handlers/index.ts](src/core/skills/handlers/index.ts) tem só os tipos ainda não cobertos (lista decresce a cada sessão).
3. Commit isolado com a mensagem da fase.
4. Bump de versão correspondente.

Assim, se uma sessão falhar, dá pra rebobinar sem perder o trabalho das anteriores.

---

## Fases

### Fase 1 — Filtro de Efeito Roxo no dispatch

**Custo:** ~10 linhas. Não exige UI nem state novo.

Em [src/core/skills/dispatch.ts:147-159](src/core/skills/dispatch.ts:147), o loop sobre `field of ["effect", "purpleEffect"]` despacha incondicionalmente. Adicionar:

```ts
if (field === "purpleEffect" && state.dungeonAwakening !== 4) continue;
```

**Critério de aceite:**
- Novo teste em `dispatch.test.ts`: cria estado com criatura que tem `purpleEffect` (qualquer skill), `dungeonAwakening = 3` (Vermelho) → `fireTrigger` não dispara o handler. Sobe para `4` (Roxo) → dispara.
- Suíte existente continua passando.
- Bump 0.8.1, commit `fix(patch-8 fase 1): purpleEffect só dispara com Despertar = Roxo`.

---

### Fase 2 — Onda A (handlers puros, sem UI)

Todos os handlers desta fase são funções puras curtas (10-20 linhas cada). Nenhum introduz state novo além das flags já listadas em "Arquivos modificados".

#### 2.1 — `tohit_penalty`

Aplica `value` (negativo) em `combat.tohitPenaltyByHero[heroId]` ao disparar. Consumido por `collectHeroBonuses` em [combat.ts:122](src/core/reducer/combat.ts:122) (adicionar entrada `{ source: "penalidade", value: -N }` quando o herói estiver no mapa).

Cobre: `habilidade-calor-escaldante`, `habilidade-corpo-gelatinoso`, `habilidade-prisao-das-correntes`.

#### 2.2 — `heal_block`

Marca `hero.healBlocked = true` no herói-alvo (ou em todos, dependendo de `target`). Verificado no início de qualquer handler que cure (`handleHeal`, `handleHealOrSurvive`, `handleHealOrDamageBonus`): se `healBlocked`, retorna `state` inalterado e loga.

Cobre: `habilidade-fumaca-da-fornalha`.

#### 2.3 — `discardDungeonLock`

Liga `state.flags.discardDungeonLocked = true` enquanto a criatura ou sala-fonte estiver ativa. Verificado por `handleDiscardDungeonPrevention` ([discardDungeon_prevention.ts](src/core/skills/handlers/discardDungeon_prevention.ts)): se locked, prevenção é ignorada.

Cobre: `habilidade-corrupcao-de-caminho`.

#### 2.4 — `discardDungeon`

Força descarte de N cartas do deck de dungeon ao destruir a criatura-fonte (trigger `on_destroyed`). Reaproveita a lógica de `handleDiscardPaths` em [exploration.ts](src/core/reducer/exploration.ts) (extrair função `discardFromDungeonDeck(state, n)` no mesmo arquivo).

Cobre: `efeito_roxo_monstro-cinzas-da-ruina`, `habilidade-chao-em-ruina`. Esta segunda só dispara quando `dungeonAwakening === 4` (cuidado: o filtro do Patch-8 fase 1 já garante isso para `purpleEffect`; aqui é a skill normal — verificar trigger).

#### 2.5 — `reward` (impedir recompensa)

Marca a criatura-fonte com `noReward: true` em [enemyState.ts](src/core/state/enemyState.ts) (adicionar campo opcional). Em `handleGrantRewards` ([reward.ts](src/core/reducer/reward.ts)), criaturas com `noReward` ou `status === "fled"` não geram recompensa.

Cobre: `habilidade-fuga-covarde` (Goblin das Cavernas Escuras).

#### 2.6 — Registro

Em [src/core/skills/handlers/index.ts](src/core/skills/handlers/index.ts):
- Importar e registrar os 5 handlers novos.
- Remover de `noopTypes`: `tohit_penalty`, `healBlock`, `discardDungeonLock`, `discardDungeon`, `reward`.

**Critério de aceite:**
- `src/core/skills/handlers/__tests__/onda_a.test.ts` com 1 teste por handler:
  - `tohit_penalty`: rolagem com a criatura → `heroBreakdown` inclui `{ source: "penalidade", value: -N }`.
  - `heal_block`: usar Poção de Vigor Menor em herói com `healBlocked` → vida não muda.
  - `discardDungeonLock`: em sala com Caminho Preservado + criatura com Corrupção → descarte acontece.
  - `discardDungeon`: derrotar Ladrão (cinzas-da-ruina) → 1 carta sai do `dungeonDeck`.
  - `reward`: derrotar Goblin → `groupTreasures.length` não muda.
- Bump 0.8.2.

---

### Fase 3 — Mecânica de Fuga

Esta fase é só lógica/UI; nenhum handler novo de skill aqui. Habilita o botão e o fluxo de combate alternativo.

#### 3.1 — State e rolagem

Adicionar em `CombatState`:
```ts
fleeAttemptByHero?: Record<string, boolean>;
```

Criar [src/core/rules/flee.ts](src/core/rules/flee.ts):
```ts
// Rolagem de fuga = mesma rolagem de combate. Vencer = foge.
// Bônus extras (Acorde de Fuga, Saída Estreita) não estão neste patch.
export function isFleeAttemptWin(heroTotal: number, enemyTotal: number): boolean {
  return heroTotal > enemyTotal;
}
```

#### 3.2 — Actions e reducer

- `DECLARE_FLEE`: válido apenas se `hero.currentLife === 1` e há `combat` em andamento. Marca `combat.fleeAttemptByHero[heroId] = true`. UI vai pedir alvo normalmente; a próxima `ROLL_DICE` é a rolagem de fuga.
- Em `handleResolveAttack`: se `fleeAttemptByHero[heroId]`, ramifica:
  - **Vitória do herói**: `hero.status = "fled"`, herói sai do `state.heroes` ativos (vira `fledHeroes`, analogamente a `defeatedHeroes`); criatura **não conta como destruída**, **não dá recompensa**; segue combate com heróis restantes.
  - **Derrota/empate**: aplica dano normalmente (1 = morre, já que vida = 1).
  - Limpa `fleeAttemptByHero[heroId]`.
- Após qualquer resolução, se `state.heroes.filter(active).length === 0 && fledHeroes.length > 0`: status vai para `DUNGEON_RESTART_PROMPT` (novo).
- `RESTART_DUNGEON { keepEquipment }`: reembaralha todos os decks, recria heróis a partir das cartas, opcionalmente preservando `activeItems`/`backpack` redistribuíveis. Volta ao status inicial pós-`START_GAME`.

#### 3.3 — Fuga de criatura

Quando algum handler/efeito futuro marcar `enemy.status = "fled"`, o enemy é embaralhado de volta no `enemyDeck` (em `handleCheckCombatEnd`, antes de mover para `enemyDiscard`). Implementar no próprio `handleCheckCombatEnd`.

#### 3.4 — UI

- [HeroFocusPanel.tsx](src/ui/components/HeroFocusPanel.tsx): no botão "🏃 Fugir", `disabled = hero.currentLife !== 1 || !combat`. Click despacha `DECLARE_FLEE`.
- Card do herói fugido: borda tracejada + label "fugiu", `pointerEvents: none` ([spec-telas-mvp1.md:329](docs/spec-telas-mvp1.md:329)).
- `FleeReconfigureModal.tsx`: mostra quando `status === "DUNGEON_RESTART_PROMPT"`. Dois botões: "Reiniciar do zero" / "Reiniciar mantendo equipamentos".

**Critério de aceite:**
- Novo `combat.test.ts` cobrindo: declare → rolagem vence → herói `fled` + criatura volta ao deck + sem recompensa; declare → rolagem perde → herói morto.
- Reducer não permite `DECLARE_FLEE` com vida > 1.
- Manualmente no browser: jogar até herói com 1 vida, fugir, ver card mudar.
- Bump 0.8.3.

---

### Fase 4 — Ação genérica `SKILL_CHOICE` + modal

#### 4.1 — Estado

Adicionar em `GameState`:
```ts
pendingSkillChoice?: {
  skillId: string;
  prompt: string;
  options: { id: string; label: string }[];
  sourceHeroId?: string;
};
```

Quando um handler precisa de input, ele:
1. Define `state.pendingSkillChoice` com as opções legíveis.
2. Retorna o `state` modificado.
3. O fluxo do reducer pausa (UI lê `pendingSkillChoice` e abre o modal).
4. Jogador escolhe → store despacha `SKILL_CHOICE { skillId, choice }`.
5. Reducer roteia para o handler "continuação" da skill (segundo arg do par registrado).

#### 4.2 — Registry de continuações

Em [src/core/skills/registry.ts](src/core/skills/registry.ts), adicionar:
```ts
type SkillContinuation = (state: GameState, ctx: SkillContext, choice: string) => GameState;
export function registerContinuation(type: string, fn: SkillContinuation): void;
export function getContinuation(type: string): SkillContinuation | undefined;
```

Reducer case `SKILL_CHOICE`:
```ts
const choice = action.payload.choice;
const pending = state.pendingSkillChoice;
if (!pending) return state;
const def = lookupSkillById(pending.skillId);
const cont = getContinuation(def.type);
if (!cont) return state;
const cleared = { ...state, pendingSkillChoice: undefined };
return cont(cleared, { triggeredBy: "on_use", skillId: def.id, sourceHeroId: pending.sourceHeroId }, choice);
```

#### 4.3 — Modal

`SkillChoiceModal.tsx`: lê `pendingSkillChoice` do store. Renderiza prompt + lista de botões (1 por opção). Click despacha `SKILL_CHOICE`.

**Critério de aceite:**
- Suíte continua passando (nenhum handler usa ainda).
- Teste de unidade do reducer: setar `pendingSkillChoice` manualmente → despachar `SKILL_CHOICE` → continuação registrada é invocada e estado limpo.
- Bump 0.8.4.

---

### Fase 5 — Onda B (handlers com `SKILL_CHOICE`)

Implementar **apenas** os handlers cuja skill aparece em carta presente na Fornalha Sombria — confirmar via `usedBy` no `skills.json`.

#### 5.1 — `item_or_discardDungeon` (Tributo Sombrio)

Trigger `on_enter_play` para criaturas (Esqueleto, Ladrão, Guardião). Abre `SKILL_CHOICE` com 2 opções: "Descartar 1 item" / "Descartar 1 carta de dungeon". Continuação aplica a escolha.

#### 5.2 — `itemControl` (Evasão das Fendas — Morcego, Crânio Flamejante)

Trigger `first_item_effect_received` na criatura. Liga `combat.itemControlByEnemy[enemyId] = true`. Em `handleUseItem`, se o alvo é uma criatura com flag ligada, ignora 1 efeito e limpa a flag.

#### 5.3 — `targetProtection` (Véu Protetor — Manto do Véu, Alaúde)

Trigger `on_first_target_chosen_in_room`. Liga `combat.targetProtectionByHero[heroId] = true`. Em qualquer handler que use `target: "hero"` e escolha esse herói, ignora o primeiro efeito e limpa.

#### 5.4 — `dungeon` (Iluminar o Caminho — Tocha de Breu)

Trigger `on_use`. Abre `SKILL_CHOICE` listando as próximas N cartas do deck de dungeon (revela-as no `prompt`/`options`). Continuação reordena o deck conforme a escolha.

#### 5.5 — Registro

- Importar e registrar handlers + continuações.
- Remover de `noopTypes`: `item_or_discardDungeon`, `itemControl`, `targetProtection`, `dungeon`.

**Critério de aceite:**
- `onda_b.test.ts` com 1 teste por skill cobrindo o caminho com escolha.
- Manualmente: derrotar Esqueleto → modal de Tributo Sombrio abre → escolher → estado consistente.
- Bump 0.8.5.

---

### Fase 6 — Trigger `on_deal_damage` + Drenar Vida

Hoje o engine não tem o trigger `on_deal_damage` — só `before_attack` e `after_roll`. Várias skills precisam dele.

#### 6.1 — Novo trigger

- Adicionar `"on_deal_damage"` em `TriggerName` ([src/data/skillTypes.ts:18](src/data/skillTypes.ts:18)).
- `SkillContext` ganha campo opcional `damageDealt?: number` (já existe `damageAmount` — reusar; documentar que para `on_deal_damage` o campo representa o dano efetivamente aplicado, após escudo).
- Em `handleResolveAttack` ([combat.ts](src/core/reducer/combat.ts)), **após aplicar dano e escudo**, se o herói causou dano (`heroWins && damageApplied > 0`), chamar:
  ```ts
  state = fireTrigger(state, "on_deal_damage", {
    triggeredBy: "on_deal_damage",
    sourceHeroId: hero.id,
    sourceEnemyId: enemy.id,
    damageAmount: damageApplied,
  });
  ```
- Mesmo ponto, simétrico, para criatura → herói (`enemyWins`).

#### 6.2 — Handler `drain_life` / reuso de `heal`

A skill `habilidade-drenar-vida` tem `type: "heal"` e `trigger: "on_deal_damage"`. O handler `heal` existente já cura — basta garantir que ele é roteado quando o trigger dispara. Verificar se o dispatch atual já cobre (trigger é configurado por skill, não por type). Se sim, **sem código novo** — só remover `heal` de qualquer lista que filtre triggers.

#### 6.3 — Atualizar handlers existentes que rolam dano

- `handleDirectDamage` e `handleDiceFixDamage`: se causam dano de herói → criatura, devem disparar `on_deal_damage` também.

**Critério de aceite:**
- Teste: herói com Drenar Vida (`value: 1`) vence combate causando 2 de dano → cura 1.
- Teste: Drenar Vida não dispara em empate (ambos sofrem 1, mas não há "vitória causando dano").
- Bump 0.8.6.

---

### Fase 7 — Splash damage contextual

Cobre `habilidade-golpe-trespassante` (Espada do Trespasse, Lâmina Vermelha) e `habilidade-tiro-de-oportunidade` (Arco das Fendas).

#### 7.1 — Handler `splash_damage`

Novo arquivo `src/core/skills/handlers/splash_damage.ts`. Trigger `on_destroy_creature_with_attack` (já existe). Após destruir uma criatura:

- Se há outra criatura ativa na mesma sala → aplicar `value` de dano direto a uma delas.
- Se `target: "another_creature_in_room"` e há > 1: usar strategy `targetSelection` (criatura com menor vida).
- Se não há outra: noop silencioso.

#### 7.2 — `tiro-de-oportunidade` (dano direto no lugar de ataque)

Skill com `trigger: "once_per_combat_instead_of_attack"`. Exige nova action `USE_ALTERNATE_ATTACK { heroId, enemyId, skillId }` ou reusar `USE_POWER` com payload diferenciado. Decisão: **reusar `USE_POWER`** — o handler verifica `skill.type === "directDamage"` e aplica dano sem rolagem, marcando o guard `once_per_combat`.

- Em `handleUsePower` ([combat.ts](src/core/reducer/combat.ts)): se a skill resolve para `type: "directDamage" + trigger: "once_per_combat_instead_of_attack"`, aplicar `value` de dano direto à criatura escolhida e **pular o turno do herói** (marcar como já agiu).

**Critério de aceite:**
- Teste: derrotar criatura com Espada do Trespasse + 2ª criatura na sala → 2ª criatura perde `value` de vida.
- Teste: Arco das Fendas → USE_POWER aplica dano sem rolar dado, turno do herói termina.
- Remover `directDamage` da lista alternativa se já registrado (já está).
- Bump 0.8.7.

---

### Fase 8 — Reroll interativo + UI de seleção de dado

Cobre `habilidade-runa-menor` (Cajado das Runas Rubras), `habilidade-segunda-chance-das-fendas`, `habilidade-runa-perfeita` (interativo — o handler `diceFix` puro já existe mas é hardcoded).

#### 8.1 — Estado de seleção de dado

Adicionar em `CombatState`:
```ts
pendingDiceSelection?: {
  skillId: string;
  heroId: string;
  side: "hero" | "enemy" | "any";
  filter?: { value?: number; minValue?: number };  // ex: só dados com valor 1
  action: "reroll" | "set_to" | "swap";
  setToValue?: number;  // para set_to
};
```

Quando uma skill `reroll`/`diceFix` interativa dispara (`on_use` ou `after_roll`), o handler:
1. Calcula quais dados são elegíveis aplicando `filter` aos `lastRoll.heroResults` / `enemyResults`.
2. Se há ≥1 elegível, seta `pendingDiceSelection`.
3. Retorna state. UI mostra dados clicáveis.

#### 8.2 — Action `SELECT_DIE`

```ts
SELECT_DIE { payload: { side: "hero" | "enemy"; index: number } }
```

Reducer aplica a ação (`reroll`, `set_to`, `swap`) ao dado escolhido, recalcula totais, limpa `pendingDiceSelection`, marca guard como usado.

#### 8.3 — Handlers

- `src/core/skills/handlers/reroll.ts`: configura `pendingDiceSelection` com `action: "reroll"`.
- Atualizar `diceFix.ts`: hoje é puro/hardcoded; adicionar variante interativa quando `target` indica escolha do jogador.

#### 8.4 — UI

- `src/ui/components/CombatDiceArea.tsx` (ou onde renderiza dados): se `pendingDiceSelection` existe, dados elegíveis recebem `cursor: pointer` + borda destacada. Click despacha `SELECT_DIE`.
- Modal não — interação é direta nos dados já visíveis.

#### 8.5 — Registro

- Importar/registrar `reroll`.
- Remover `reroll` de `noopTypes`.

**Critério de aceite:**
- Teste: Runa Menor + dado com valor 1 → pendingDiceSelection setado → SELECT_DIE → dado rerrolado, total recalculado.
- Manualmente: rolar com Cajado das Runas, ter 1 entre os dados, clicar nele, ver re-roll.
- Bump 0.8.8.

---

### Fase 9 — Redirecionamento de alvo (`targetRedirect_or_tohit`)

Cobre `habilidade-desvio-de-foco` (Capuz do Túnel).

#### 9.1 — Hook em `handleChooseTarget`

Em [combat.ts](src/core/reducer/combat.ts) `handleChooseTarget`, **antes** de fechar o pareamento, disparar um novo trigger sintético `on_target_chosen`:
```ts
state = fireTrigger(state, "on_target_chosen", {
  triggeredBy: "on_target_chosen",
  sourceHeroId: heroId,
  sourceEnemyId: enemyId,
});
```

Adicionar `"on_target_chosen"` em `TriggerName`.

#### 9.2 — Handler `targetRedirect_or_tohit`

Skill com `target: "ally_or_next_attack"`. Abre `SKILL_CHOICE` com 2 opções:
- "Redirecionar para outra criatura" (lista criaturas elegíveis)
- "Aceitar e ganhar +N de acerto"

Continuação:
- Se redirect: muda `enemyId` no pair, redireciona o combate.
- Se tohit: adiciona bônus via `combat.bonusNextAttack`.

**Critério de aceite:**
- Teste: herói com Capuz do Túnel escolhe alvo → SKILL_CHOICE → opção "redirecionar" troca o pair.
- Bump 0.8.9.

---

### Fase 10 — `purple_damage_reduction` + trigger correlato

Cobre `habilidade-resguardo-da-ultima-luz`.

#### 10.1 — Trigger `on_purple_effect_damage_taken`

Já existe na lista de triggers ([skillTypes.ts:70](src/data/skillTypes.ts:70)). Falta disparar.

Em handlers de efeito roxo que causam dano (ex: `chamas-vorazes` quando implementado), após aplicar o dano, chamar `fireTrigger(state, "on_purple_effect_damage_taken", { ..., damageAmount })`.

#### 10.2 — Handler `purple_damage_reduction`

```ts
// Reduz o dano que seria recebido em `value`. Aplicado no momento do dano.
// Implementação: handler intercepta state.lastPurpleDamage e ajusta.
```

Estrutura: o handler que **causa** o dano roxo consulta `purple_damage_reduction` ativos **antes** de aplicar:
```ts
const reduction = collectPurpleReductionFor(state, targetHeroId);
const finalDamage = Math.max(0, damageAmount - reduction);
```

Função utilitária `collectPurpleReductionFor` em `src/core/skills/lookup.ts`.

**Critério de aceite:**
- Teste: criatura com efeito roxo de dano + herói com Resguardo da Última Luz → dano final reduzido por `value`.
- Bump 0.8.10.

---

### Fase 11 — Sistema de Tokens (§8.7)

Subsistema genérico de marcadores. Mesmo que poucas skills da Fornalha usem, é exigência do manual e várias skills do catálogo já preveem.

#### 11.1 — State

Novo campo em `GameState`:
```ts
tokens: Record<string, { count: number; ownerId: string; type: string }>;
// chave: `${ownerId}::${tokenType}`. ownerId = enemyId | heroId | itemName | roomCardName.
```

#### 11.2 — Actions e regras (§8.7)

- `ADD_TOKEN { ownerId, type, amount }`
- `REMOVE_TOKEN { ownerId, type, amount }`
- Em `handleCheckCombatEnd` e em handlers que removem cartas de jogo: descartar todos os tokens do owner que sai.

#### 11.3 — Lookup

`hasToken(state, ownerId, type) -> boolean`, `countTokens(...) -> number` em `src/core/state/tokens.ts`.

#### 11.4 — Handlers que usam tokens

- Skill `habilidade-espolios-da-fornalha` (drawItem com escolha): cobertura via `SKILL_CHOICE` (Fase 4). Não usa token.
- Atualizar handlers de cargas (ex: `runa-menor` se for "1/sala" como token visível) — opcional, guardas `once_per_*` já cobrem.

Esta fase entrega a infra; cards específicos que dependem entram conforme aparecem no catálogo.

**Critério de aceite:**
- Testes unitários de `tokens.ts`: add, remove, owner removido limpa tokens.
- Bump 0.8.11.

---

### Fase 12 — Handlers residuais (`drawItem`, `recover_item`, `forja-reacesa`)

Skills que faltaram e agora têm infra (SKILL_CHOICE, tokens, on_deal_damage):

- `drawItem` (`espolios-da-fornalha`): SKILL_CHOICE entre 2 itens do topo do deck de tesouros.
- `recover_item` (`forja-reacesa`): SKILL_CHOICE entre itens do descarte.
- `heal_or_damage_bonus`, `heal_or_survive` (já implementados em Patch-7) — revisar se UI está ligando direito a `SKILL_CHOICE`.
- Remover de `noopTypes`: `drawItem`, `recover_item`.

**Critério de aceite:**
- Cada handler tem teste end-to-end com SKILL_CHOICE.
- `noopTypes` está vazio (ou só com tipos sem `usedBy` no catálogo).
- Bump 0.8.12.

---

### Fase 13 — Subchefes (§7.2)

Manual descreve: quando Despertar atinge nível 3 (Vermelho), embaralhar 2 salas especiais no deck de dungeon, cada uma vinculada a 1 subchefe. Ao revelar sala de subchefe: sem criaturas normais, busca o subchefe indicado, combate normal. Ao derrotar: XP + Artefato vinculado.

#### 13.1 — Data

- `src/data/cards.ts`: adicionar campos `subbosses` (2 cartas) e `subbossRooms` (2 cartas) na Fornalha Sombria.
- Tipos em [cardTypes.ts](src/data/cardTypes.ts): `SubbossCard`, `SubbossRoomCard` (variantes de Enemy/Room com `linkedSubbossName`, `linkedArtifactName`).

#### 13.2 — State

- `GameState.subbosses: { available: SubbossCard[]; defeated: string[] }`.
- Remover flag `subbossesEnabled` (ou ligar por default no MVP1) em [defaults.ts](src/core/config/defaults.ts).

#### 13.3 — Reducer

- Em `progression.ts`, ao subir Despertar para 3: chamar `injectSubbossRooms(state)` que embaralha as 2 salas no deck remanescente.
- Em `handleRevealRoom`: se sala é `SubbossRoomCard`, pular `handleSpawnEnemies` normal e spawnar o subchefe vinculado.
- Em `handleGrantRewards`: se inimigo destruído é subchefe, conceder Artefato vinculado direto (não da pilha) + XP da carta.

#### 13.4 — UI

- Card de subchefe renderiza com badge "Subchefe".
- Sala especial com indicador visual diferente.

**Critério de aceite:**
- Teste: avançar Despertar até 3 → deck recebe 2 salas extras.
- Teste: revelar sala de subchefe → subchefe spawna, recompensa entrega artefato vinculado.
- Bump 0.8.13.

---

### Fase 14 — Modo competitivo (§17)

Manual: cada jogador controla 1 herói, todos compartilham os decks, vence quem cumprir primeiro a condição do chefe.

#### 14.1 — State

- `GameState.mode: "cooperative" | "competitive"`.
- Em competitivo: cada herói tem seu próprio `xp` e `defeatedHeroes` é por jogador.

#### 14.2 — Setup

- Tela de setup ganha toggle "Modo" (cooperativo/competitivo).
- Em competitivo: 2-8 jogadores, cada um escolhe 1 herói.

#### 14.3 — Reducer

- Verificação do chefe (`handleCheckBossCondition`): em competitivo, por jogador. O primeiro que cumprir entra em combate solo; vitória dele = fim de jogo.
- Esgotamento de deck (§17 do manual / §10.1): "pode encerrar a partida ou eliminar apenas quem não conseguir continuar" — implementar como **regra da mesa** via flag, default = "eliminar individualmente".

#### 14.4 — UI

- Painel de heróis renderiza cada herói com `XP do jogador {N}` em vez de XP coletivo.
- Tela de vitória nomeia o vencedor.

**Critério de aceite:**
- Setup permite escolher modo.
- Teste: 2 jogadores, 1 cumpre condição → entra em combate solo → vence → tela de vitória com nome.
- Bump 0.8.14.

---

### Fase 15 — Limpeza e documentação

- Atualizar [docs/patch-7-pendencias.md](docs/patch-7-pendencias.md):
  - Remover linhas dos tipos implementados (deve sobrar quase nada).
  - Linhas restantes (skills com `usedBy: []` no catálogo): marcar "registrada, sem uso atual — sem teste manual possível".
- Adicionar a [docs/arquitetura-mvp1.md](docs/arquitetura-mvp1.md):
  - §5.10 Fuga (ponteiro para [flee.ts](src/core/rules/flee.ts)).
  - §5.11 Efeito Roxo (filtragem em [dispatch.ts](src/core/skills/dispatch.ts) + trigger `on_purple_effect_damage_taken`).
  - §5.12 Tokens (ponteiro para [tokens.ts](src/core/state/tokens.ts)).
  - §5.13 Subchefes (regras do §7.2 do manual implementadas).
  - §5.14 Modo competitivo (toggle de setup, regras do §17 do manual).
  - Atualizar tabela de "Pontos de extensão" (§7): subchefes e modo competitivo deixam de ser pendência.
- Bump 0.9.0 (sobe minor — patch fechou todas as pendências do catálogo).
- Commit `docs(patch-8 fase 15): atualizar arquitetura, pendências e bump 0.9.0`.

---

## Checklist de "patch-8 pronto"

- [ ] Filtro de Efeito Roxo no dispatch (Fase 1).
- [ ] 5 handlers da Onda A registrados (Fase 2).
- [ ] Mecânica de Fuga jogável end-to-end (Fase 3).
- [ ] `SKILL_CHOICE` + modal genérico (Fase 4).
- [ ] 4 handlers da Onda B (Fase 5).
- [ ] Trigger `on_deal_damage` + Drenar Vida (Fase 6).
- [ ] Splash damage + Tiro de Oportunidade (Fase 7).
- [ ] Reroll interativo + UI de seleção de dado (Fase 8).
- [ ] Redirecionamento de alvo (Fase 9).
- [ ] Redução de dano de efeito roxo (Fase 10).
- [ ] Sistema de Tokens (Fase 11).
- [ ] Handlers residuais (`drawItem`, `recover_item`) (Fase 12).
- [ ] Subchefes ligados (Fase 13).
- [ ] Modo competitivo (Fase 14).
- [ ] Docs atualizados, versão em 0.9.0 (Fase 15).
- [ ] Suíte completa do core passa.
- [ ] `noopTypes` em [handlers/index.ts](src/core/skills/handlers/index.ts) está vazio (ou só com tipos sem `usedBy`).
- [ ] Partida manual da Fornalha Sombria com 8 heróis: zero `[SKILL NÃO IMPLEMENTADA]` para skills usadas.
- [ ] Partida manual em modo competitivo com 2 jogadores: fluxo completo até vitória.
