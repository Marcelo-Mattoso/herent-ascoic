# Patch 14 — Acabamento da branch `refactor/web-architecture`

Brief de implementação auto-contido. Não depende de conversa prévia.

**Branch de trabalho:** `refactor/web-architecture` (NÃO `main`). Todo o trabalho deste patch acontece e fica nesta branch.

**Pré-requisitos:** patches 1–13 já aplicados nesta branch (engine unificado: skill resolve via DSL `effect` → `script` → handler legado; pipeline ECS/stack vivo; ids canônicos; `cards.json` com `skills[]`). Suíte atual: **497 testes verdes**, `npx vite build` compila.

**Escopo deliberado — o que este patch NÃO faz:**
- **NÃO mescla `refactor/web-architecture` em `main`.** Isso é decisão/PR separado, fora deste patch.
- Não muda comportamento de jogo além dos dois bugs explicitamente listados na Fase 1 e 2.
- Não reabre o desenho do engine (DSL/scripts/stack). Só acabamento.

---

## Protocolo de execução (economia de tokens)

Trabalhe **uma fase por vez**, gastando o mínimo de tokens:

- **Não releia arquivos.** O harness rastreia o estado pós-edição; `Edit` falha se o trecho não bater. Não reabra "para conferir".
- **Leia em paralelo, leia uma vez.** Dispare os `Read` de uma fase no mesmo turno.
- **`Edit` (diff), nunca `Write` o arquivo todo** quando só um trecho muda.
- **Valide uma vez por fase**, não por edição. Para iterar, rode o arquivo de teste isolado (`npx vitest run <path>`), não a suíte inteira.
- **Greps de aceite são comandos exatos.** Rode-os como escritos.
- **Relate em uma linha por fase.** Sem colar diffs grandes nem narrar passo a passo.
- **Commits:** PT-BR, **sem** `Co-Authored-By: Claude` (ver `CLAUDE.md`). Um commit por fase.

---

## Diagnóstico

A branch concluiu a migração (steps 1–13) e os refactors de data layer (patches 10–13), mas restam quatro pontas soltas de acabamento:

1. **Dois bugs corrigidos na `main` nunca chegaram aqui** (os commits `208014d` e `5cf2658` não são ancestrais desta branch). O bug do boss trava o jogo a partir da 2ª rodada; o do botão de habilidade mostra ação que o core rejeita.
2. **Quatro módulos de "system" do passo 6 viraram código morto** — superados pelo `resolveEffect` + DSL. Têm zero importadores fora dos próprios testes.
3. **`npx tsc -b` acusa ~128 erros** apesar dos testes verdes (Vitest usa esbuild, não `tsc`). O `npm run build` (`tsc -b && vite build`) não fecha o type-check.

---

## Fase 1 — Portar fix do boss (trava a partir da 2ª rodada)

**Arquivo:** `src/core/reducer/boss.ts`.

**Problema A — `phase` não reinicia.** Em `checkBossEnd`, o `nextCombat` da próxima rodada do boss não reseta `phase` nem `selectedHeroId`. A fase fica presa em `"resolving"` (setada por `CHOOSE_TARGET`), e o painel de ações não renderiza nada → jogador travado. (No combate normal, `handleCheckCombatEnd` reseta para `"selecting_hero"`.)

Corrigir o objeto `nextCombat` dentro de `checkBossEnd` para incluir, junto com os campos já existentes:

```ts
phase: "selecting_hero" as const,
selectedHeroId: null,
```

**Problema B — log da Ascensão Final descartado.** Em `handleBossResolveAttack`, a chamada `log(state, "Ascensão Final ativada...")` descarta o retorno (`log` é imutável). Encadear em `next`:

```ts
// antes do bloco: declarar next ANTES do if da Ascensão Final
let next = state;
if (boss.currentLife <= Math.floor(boss.maxLife / 2)) {
    enemyTotal += 2;
    next = log(next, "Ascensão Final ativada: +2 no acerto do boss.");
}
```

e **remover** o `let next = state;` duplicado que existe mais abaixo na mesma função (antes do bloco `if (result.enemyDamageTaken > 0)`).

**Teste de regressão:** adicionar em `src/core/reducer/reducer.test.ts` um caso em que o boss sobrevive a uma rodada e verificar que, após `RESOLVE_ATTACK`, `status === "BOSS_COMBAT"` e `combat.phase === "selecting_hero"`, `combat.selectedHeroId === null`, `combat.pairs` e `combat.heroesActed` vazios. (Há um teste de boss no `describe("vitória contra boss")` que serve de molde — boss com vida alta e herói com dano baixo.)

**Aceite:** `npx vitest run src/core/reducer/reducer.test.ts` verde, incluindo o caso novo.

---

## Fase 2 — Portar fix do botão de habilidade (UI diverge do core)

**Problema.** A UI decide se mostra "Usar habilidade" com critério próprio, diferente do que `fireOnUseSkill` aceita. Hoje em `src/ui/components/HeroFocusPanel.tsx` (na `ActionSection`):

```ts
const skillIsActivatable =
    skillDef !== null &&
    (skillDef.trigger === "on_use" || skillDef.trigger.startsWith("once_per_"));
```

`startsWith("once_per_")` aceita triggers reativos compostos (ex.: `once_per_room_on_dungeon_discard`, do Ladino das Fendas) que o core **rejeita** — botão clicável que só loga aviso. O core (`src/core/skills/useSkill.ts`, `fireOnUseSkill`) usa o critério canônico (`on_use`, `once_per_game/room/combat`, ou `.includes("on_use")`).

**Correção — extrair predicado único no core e a UI consome (core é a fonte da verdade):**

1. Em `src/core/skills/useSkill.ts`: extrair a lógica do `isUsable` inline para uma função exportada e usá-la dentro do `fireOnUseSkill`:

```ts
import type { SkillDefinition } from "../data/skillTypes";

export function isManuallyActivatable(def: SkillDefinition): boolean {
    return (
        def.trigger === "on_use" ||
        def.trigger === "once_per_game" ||
        def.trigger === "once_per_room" ||
        def.trigger === "once_per_combat" ||
        def.trigger.includes("on_use")
    );
}
```

2. Em `src/core/skills/dispatch.ts`: exportar `guardPassed` (hoje é `function` sem `export`) e adicionar:

```ts
export function isSkillGuardConsumed(
    state: GameState,
    skill: SkillDefinition,
    sourceHeroId?: string,
): boolean {
    return !guardPassed(state, skill, sourceHeroId);
}
```

3. Em `src/ui/components/HeroFocusPanel.tsx`: importar do core e substituir o cálculo local. O `skillDef` já vem de `cardSkills(...).find(({def}) => def.category === "habilidade")` — manter essa resolução. Trocar:

```ts
import { isManuallyActivatable } from "@/core/skills/useSkill";
import { isSkillGuardConsumed } from "@/core/skills/dispatch";
// ...
const skillIsActivatable = skillDef !== null && isManuallyActivatable(skillDef);
const skillAlreadyUsed =
    skillDef !== null && isSkillGuardConsumed(state, skillDef, hero.id);
```

**Teste de regressão:** adicionar `src/core/skills/__tests__/activatable.test.ts` que, para toda `def` em `SKILLS.abilities`, verifica que `fireOnUseSkill` rejeita (loga `"não é ativável manualmente"`) **se e somente se** `!isManuallyActivatable(def)`. Construir o estado base via `reducer(createInitialGameState({heroCardNames:["Bárbaro Rubro"]}), {type:"START_GAME", payload:{heroCardNames:["Bárbaro Rubro"]}})`. Incluir asserts diretos: Ladino das Fendas → `false`; Clérigo (skill `on_use`) e Necromante (`once_per_room`) → `true`. (Resolver a `def` pelo catálogo via `lookupSkillById` ou `cardSkills`.)

**Aceite:** `npx vitest run src/core/skills/__tests__/activatable.test.ts` verde. Grep `grep -n "startsWith(\"once_per_\")" src/ui/components/HeroFocusPanel.tsx` retorna vazio.

---

## Fase 3 — Remover systems órfãos (código morto)

O passo 6 do plano criou 6 systems, mas só `damageSystem` e `healSystem` ficaram em uso (chamados pelo `resolveEffect` e pelo `ScriptCtx`). Os outros 4 foram superados pelo `resolveEffect`+DSL e têm **zero importadores fora dos próprios testes**.

**Antes de deletar**, confirmar com grep exato (deve retornar vazio para cada):

```bash
grep -rln "diceSystem"      src/ --include="*.ts" | grep -v "systems/diceSystem.ts"
grep -rln "drawSystem"      src/ --include="*.ts" | grep -v "systems/drawSystem.ts"
grep -rln "conditionSystem" src/ --include="*.ts" | grep -v "systems/conditionSystem.ts" | grep -v "__tests__/conditionSystem.test.ts"
grep -rln "modifierSystem"  src/ --include="*.ts" | grep -v "systems/modifierSystem.ts" | grep -v "__tests__/modifierSystem.test.ts"
```

Se algum retornar referência inesperada (uma fase posterior pode ter passado a usá-lo), **parar e reportar** em vez de deletar.

**Deletar** (confirmado vazio):
- `src/core/systems/diceSystem.ts`
- `src/core/systems/drawSystem.ts`
- `src/core/systems/conditionSystem.ts` + `src/core/systems/__tests__/conditionSystem.test.ts`
- `src/core/systems/modifierSystem.ts` + `src/core/systems/__tests__/modifierSystem.test.ts`

**Manter:** `damageSystem.ts`, `healSystem.ts` e seus testes.

**Aceite:** `npx vitest run` verde (contagem cai pelos testes removidos, sem novas falhas). Nenhum import quebrado.

---

## Fase 4 — Zerar erros de `tsc` até `npm run build` fechar

Meta: `npx tsc -b` sem erros e `npm run build` (`tsc -b && vite build`) verde. Os ~128 erros se agrupam assim — atacar em sub-lotes, validando ao fim de cada um com `npx tsc -b 2>&1 | grep -c "error TS"`.

### 4.1 — `TS2307` "cannot find module" nos scripts de carta (14 erros)

Todos em `src/data/scripts/*.ts` e seus testes. Causa provável: o alias `@/` (e/ou imports de `@/core/...`) não resolve na config que o `tsc -b` usa para esses arquivos. Investigar `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.json`:
- Conferir se `src/data/scripts/**` está incluído num project com `paths` (`"@/*": ["src/*"]`) e `baseUrl` corretos.
- A regra do patch-10 é que scripts importam **só tipos** de `@/core/...` (`import type { ScriptHandler } from "@/core/scripts/types"`). Se algum script importa valor de `@/core/systems/...`, isso viola o patch-10 **e** causa o erro — corrigir o import (o que o script precisa vem por `ctx`), não relaxar a regra.
- `src/data/scripts/example.ts` é dev-script remanescente (2 erros). Se não for mais usado, mover para `tools/dev-scripts/` (conforme patch-10 Fase 0) ou remover.

### 4.2 — `src/core/skills/dsl/resolveCondition.ts` (8 erros, código de app)

Erros reais de tipo em código de produção. Corrigir tipando corretamente (sem `any` solto; preferir narrowing). Não silenciar com `// @ts-ignore`.

### 4.3 — Erros restantes em testes e DSL (onda_a, lote1–3, parity, evaluate, etc.)

Predominam `TS7006` (parâmetro `any` implícito), `TS2345`/`TS2322` (tipos incompatíveis), `TS6133` (import/var não usado), `TS18046` (`unknown`). Resolver por arquivo:
- `TS6133`: remover import/variável não usada.
- `TS7006`: anotar o tipo do parâmetro.
- `TS2345`/`TS2322`/`TS2741`: alinhar o shape ao tipo esperado (geralmente o objeto de teste perdeu um campo após patch-11/13, ex.: `cardId`/`skillId`/`skills[]`).

**Cuidado:** corrigir tipo **não** pode mudar o que o teste verifica. Se um teste só compila com mudança de comportamento, é sinal de teste desatualizado vs. nova API — ajustar o setup do teste para a API atual, não afrouxar o assert.

**Aceite da Fase 4:** `npx tsc -b` → zero erros. `npm run build` → verde. `npm run lint` → verde (a branch tem lint de integridade referencial card↔skill — não regredir). `npx vitest run` → verde.

---

## Restrições e regras

1. **Core é a fonte da verdade.** Divergência UI↔core resolve-se extraindo a regra para o core e a UI consumindo — nunca duplicando lógica na UI (ver Fase 2).
2. **Não mexer em `main`** nem mesclar nada nela.
3. **Não introduzir `@ts-ignore`/`any`** para "resolver" tsc. Tipar de verdade.
4. **Não alterar comportamento de skills** (DSL/scripts/handlers). Fase 4 é só tipos.
5. **Determinismo intacto:** nenhuma fonte não-determinística nova; scripts continuam puros.
6. Commits em PT-BR, sem linha de co-autoria.

---

## Definição de pronto

- [ ] Fase 1: bug do boss corrigido + teste de regressão; `reducer.test.ts` verde.
- [ ] Fase 2: predicado único no core (`isManuallyActivatable` + `isSkillGuardConsumed`), UI consome, teste de paridade verde; grep do `startsWith` vazio.
- [ ] Fase 3: 4 systems órfãos removidos; grep de importadores vazio antes de deletar.
- [ ] Fase 4: `npx tsc -b` zero erros; `npm run build`, `npm run lint`, `npx vitest run` verdes.
- [ ] Tudo commitado na branch `refactor/web-architecture` (um commit por fase). **Sem** merge para `main`.

## Convenção de commit (sugestão)

- `fix(boss): reiniciar fase de combate na virada de rodada do chefe`
- `fix(ui): alinhar botão de habilidade ao predicado de ativação do core`
- `chore(systems): remover systems órfãos (dice/draw/condition/modifier)`
- `chore(types): zerar erros de tsc em scripts e dsl`
- `fix(types): corrigir tipos em resolveCondition`
