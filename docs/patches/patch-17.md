# Patch 17 — Harness de cobertura: rodar todas as skills no core

Brief de implementação auto-contido. Não depende de conversa prévia.

> **STATUS: IMPLEMENTADO.** Arquivo `src/core/skills/__tests__/coverage.test.ts` criado e verde
> (3 testes). O harness **executa cada skill no core E compara o estado antes/depois**
> (snapshot ignorando `eventLog`/`effectStack`), sobre uma **fixture rica** (dado rolado, decks
> com cartas + descarte, combate ativo h1↔e1, sala ativa). Resultado:
> **66 ok · 14 no-effect · 8 unimplemented · 0 error · total 88**.
> (a fixture rica baixou no-effect de 25→14 ao satisfazer pré-condições de runas/draw/recover.)
>
> - **ok (66):** rodou e **mudou o estado de jogo**.
> - **no-effect (14):** rodou sem erro mas **não alterou estado**. Inclui **no-op genuínos** —
>   `skill_preserved_path`, `skill_path_safeguard`, `skill_rift_light_step` (handler
>   `discardDungeon_prevention` só faz `log()`) — e ainda **falsos-positivos** por pré-condição
>   muito específica não montada (filtro de dado exato, dano roxo entrante, fase de sala/chefe):
>   `skill_rift_rune`, `skill_minor_rune`, `power_hunter_execution`, `skill_last_light_shield`,
>   `skill_rift_evasion`, `skill_cowardly_flee`, `purple_depths_seal`, `purple_deep_veil_seal`,
>   `boss_skill_dark_forge_pressure`, `dungeon_skill_subboss_room`, `dungeon_skill_empty_room`.
>   Separar real-no-op de precondição-faltante exige fixture por-skill → papel dos testes do patch-16.
> - **unimplemented (8):** skills `type` sem handler registrado (logam `[SKILL NÃO IMPLEMENTADA]`):
>   `skill_rekindled_forge`, `skill_opportunity_shot`, `item_skill_mystic_draw`,
>   `dungeon_skill_dead_torches`, `dungeon_skill_rekindled_forge`, `dungeon_skill_summon_guardian`,
>   `item_skill_drain_life_and_deadly_edge`, `item_skill_crimson_fury_mighty` — resíduo do patch-16.
>
> Correções vs o esqueleto abaixo: o log do state é `state.eventLog` (não `state.log`); `params`
> deve mesclar `def.params` → `{ ...(def.params ?? {}), value }` (igual a `dispatch.ts:264`),
> senão skills com params próprios (ex. `$armor`/`$purple`) lançam `resolveExpr ref desconhecida`;
> e a classificação `ok` vs `no-effect` vem do diff de snapshot, não só de "não lançou".

**Objetivo:** um único teste vitest que percorre **todo** o catálogo de habilidades
(`SKILLS.abilities` em `src/data/skills.json` via `src/core/data/skills.ts`), executa cada uma
contra o core e reporta o status: **ok** (resolveu para uma implementação real e rodou sem erro)
· **unimplemented** (cai em `[SKILL NÃO IMPLEMENTADA]`/`[SCRIPT NÃO ENCONTRADO]`/handler `noop`)
· **error** (lançou exceção). Serve de métrica antes/depois da migração do patch-16 e de rede de
segurança em CI.

**Pré-requisitos:** Patch-12 (DSL/script/resolver). Independe do patch-16 — na verdade é o
medidor que mostra o patch-16 progredindo (a lista `unimplemented` deve encolher a cada lote).

**Escopo deliberado:**
- Cria **um** arquivo: `src/core/skills/__tests__/coverage.test.ts`.
- Não altera comportamento de nenhuma skill nem do engine.
- Não tenta colocar a skill "em jogo" via `fireTrigger` (exigiria anexá-la a entidade ativa).
  Em vez disso **replica os 3 ramos de resolução** do `dispatch.ts:270-286` e executa direto.

---

## Por que vitest (e não script node)

O registry de scripts (`src/core/scripts/registry.ts`) usa `import.meta.glob` (Vite) para carregar
`src/data/scripts/*.ts`. Fora do runtime Vite/vitest, `getScript` retorna `null` para tudo. Logo o
harness **tem** de rodar como teste vitest. Importar `"../../skills/handlers/index"` popula o
registry de handlers legados (mesmo padrão de `dsl/__tests__/lote1.test.ts:13`).

---

## Sinais de falha a capturar

- `console.warn("[SKILL NÃO IMPLEMENTADA: <type>]")` — `src/core/skills/registry.ts:39`.
- `console.warn("[SCRIPT NÃO ENCONTRADO: <ref>]")` — `src/core/scripts/registry.ts:27`.
- `log` no state: `"[SKILL NÃO IMPLEMENTADA: <skillId>]"` — `src/core/skills/useSkill.ts`.
- Exceção lançada por `evaluate`/script/handler/`drainStack`.
- Path inválido: skill sem `effect`, sem `script` registrado, e sem handler não-`noop`.

---

## Arquivo a criar — `src/core/skills/__tests__/coverage.test.ts`

Esqueleto exato (ajustar nomes de campos só se o `tsc` reclamar; modelos de `HeroState`/`EnemyState`
em `dsl/__tests__/lote1.test.ts:17-55`):

```ts
// Harness de cobertura — roda TODA skill do catálogo pelo core (Patch-17).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKILLS } from "../../data/skills";
import type { SkillContext, SkillDefinition } from "../../data/skillTypes";
import { drainStack } from "../../effects/resolver";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";
import type { GameState } from "../../state/gameState";
import { createInitialGameState } from "../../state/gameState";
import type { HeroState } from "../../state/heroState";
import type { EnemyState } from "../../state/enemyState";
import { evaluate } from "../dsl/evaluate";
import { getHandler } from "../registry";
import "../handlers/index"; // popula o registry de handlers legados

const CFG = { heroCardNames: ["Bárbaro Rubro"] };

function makeHero(): HeroState {
  return { id: "h1", cardId: "hero_crimson_barbarian", cardName: "Bárbaro Rubro",
    maxLife: 10, currentLife: 7, damage: 3, hitBonus: 0, dice: 2, impeto: 0,
    activeItems: {}, backpack: ["Adaga"], usedPowers: {}, conditions: [],
    status: "active", playerIndex: 0, xp: 0 };
}
function makeEnemy(): EnemyState {
  return { id: "e1", cardId: "creature_dark_cave_goblin", cardName: "Goblin",
    maxLife: 4, currentLife: 4, damage: 1, hitBonus: 0, dice: 1, tokens: {},
    conditions: [], firstDamageTakenThisTurn: false, status: "active" };
}

// Estado genérico, "rico" o bastante para a maioria das skills resolverem alvo/decks.
function baseState(): GameState {
  const s = createInitialGameState(CFG);
  return { ...s, despertar: 1 as const, heroes: [makeHero()], activeEnemies: [makeEnemy()] };
}

type Status = "ok" | "unimplemented" | "error";
interface Row { id: string; path: "effect" | "script" | "type" | "none"; status: Status; detail?: string; }

// Replica os 3 ramos de dispatch.ts e executa a skill uma vez.
function runSkill(def: SkillDefinition): { status: Status; detail?: string } {
  const state = baseState();
  const ctx: SkillContext = {
    triggeredBy: (def.trigger?.split("_on_")?.pop() ?? def.trigger ?? "on_use") as any,
    skillId: def.id, sourceHeroId: "h1", targetHeroIds: ["h1"], targetEnemyIds: ["e1"],
    value: def.defaultValue ?? 3,
  };
  const params = { value: ctx.value };
  try {
    if (def.effect) {
      const out = drainStack(evaluate(def.effect, buildScriptCtx(state, ctx, params)));
      return logHasUnimpl(out, def.id) ? { status: "unimplemented" } : { status: "ok" };
    }
    if (def.script) {
      const fn = getScript(`${def.script}.run`);
      if (!fn) return { status: "unimplemented", detail: "script não registrado" };
      const out = drainStack(fn(buildScriptCtx(state, ctx, params)));
      return logHasUnimpl(out, def.id) ? { status: "unimplemented" } : { status: "ok" };
    }
    const type = def.type ?? "noop";
    if (type === "noop") return { status: "unimplemented", detail: "type ausente" };
    const handler = getHandler(type); // warn se faltar
    if (!handler) return { status: "unimplemented", detail: `handler ${type} ausente` };
    const out = drainStack(handler(state, ctx, ctx.value ?? null));
    return logHasUnimpl(out, def.id) ? { status: "unimplemented" } : { status: "ok" };
  } catch (e) {
    return { status: "error", detail: (e as Error).message };
  }
}

function logHasUnimpl(s: GameState, id: string): boolean {
  return (s.log ?? []).some((l) => typeof l === "string" && l.includes(`[SKILL NÃO IMPLEMENTADA: ${id}]`));
}
function pathOf(def: SkillDefinition): Row["path"] {
  return def.effect ? "effect" : def.script ? "script" : def.type ? "type" : "none";
}

describe("cobertura de skills — todas rodam no core", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const warns: string[] = [];
  beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation((m) => { warns.push(String(m)); }); });
  afterEach(() => { warnSpy.mockRestore(); });

  const rows: Row[] = SKILLS.abilities.map((def) => {
    const r = runSkill(def);
    return { id: def.id, path: pathOf(def), status: r.status, detail: r.detail };
  });

  it("relatório de cobertura (console)", () => {
    const by = (st: Status) => rows.filter((r) => r.status === st);
    // eslint-disable-next-line no-console
    console.log(`\nCOBERTURA: ${by("ok").length} ok · ${by("unimplemented").length} unimplemented · ${by("error").length} error · total ${rows.length}`);
    console.table(rows.filter((r) => r.status !== "ok").map((r) => ({ id: r.id, path: r.path, status: r.status, detail: r.detail ?? "" })));
    expect(rows.length).toBe(SKILLS.abilities.length);
  });

  it("nenhuma skill lança exceção", () => {
    const errored = rows.filter((r) => r.status === "error");
    expect(errored, JSON.stringify(errored, null, 2)).toHaveLength(0);
  });

  // Teeth: a lista de unimplemented é congelada num baseline e só pode ENCOLHER.
  // Atualize KNOWN_UNIMPLEMENTED ao migrar skills (patch-16). Nunca adicione sem justificar.
  it("não regride a cobertura (baseline)", () => {
    const KNOWN_UNIMPLEMENTED = new Set<string>([
      // Preencher na 1ª execução com os ids retornados como "unimplemented".
    ]);
    const unimpl = rows.filter((r) => r.status === "unimplemented").map((r) => r.id);
    const novos = unimpl.filter((id) => !KNOWN_UNIMPLEMENTED.has(id));
    expect(novos, `Skills quebraram (não estavam no baseline): ${novos.join(", ")}`).toHaveLength(0);
  });
});
```

---

## Execução

1. Criar o arquivo acima.
2. `npx vitest run src/core/skills/__tests__/coverage.test.ts` — ler o `console.log`/`console.table`.
3. Copiar os ids `unimplemented` reportados para `KNOWN_UNIMPLEMENTED` (baseline inicial = as ~30
   skills com `type` + qualquer outra que falhe).
4. Reexecutar: deve ficar verde. A partir daí o teste **falha** se qualquer skill nova quebrar
   ou se um script/effect lançar exceção.

## Notas de fidelidade do harness (limitações conhecidas, documentar no topo do arquivo)

- O ctx é **genérico** (1 herói `h1` com `currentLife < maxLife` e 1 item na mochila; 1 inimigo
  `e1`; `despertar:1`; decks padrão de `createInitialGameState`). Skills que dependem de estado
  específico (dado rolado, token, sala-chefe) podem reportar `ok` "vazio" — o harness mede
  **resolução + ausência de erro/[NÃO IMPLEMENTADA]**, não correção semântica (isso é papel dos
  testes por skill do patch-16).
- `triggeredBy` é derivado do `trigger` da skill de forma best-effort; não é o disparo real do jogo.
- Skills que abrem `pendingSkillChoice` contam como `ok` (resolveram e pediram escolha) — o harness
  não percorre a continuation.

## Aceite
- `npx tsc --noEmit` limpo.
- `npx vitest run src/core/skills/__tests__/coverage.test.ts` verde após preencher o baseline.
- O `console.log` mostra a contagem `ok / unimplemented / error` do catálogo inteiro.

Commit único, mensagem **sem** linha de autoria do Claude (regra do `CLAUDE.md`).
