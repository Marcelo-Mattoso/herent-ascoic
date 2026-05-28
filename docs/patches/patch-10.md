# Patch 10 — Sistema de scripts

Brief de implementação auto-contido. Não depende de conversa prévia.

Leitura prévia obrigatória: [`../engine/v2/script_architecture_web.html`](../engine/v2/script_architecture_web.html). Esse doc explica o **porquê** e a fronteira data-driven (`src/data/` = conteúdo do designer, `src/core/` = engine). Aqui está o **como**, em passos concretos.

---

## Objetivo

Adicionar um subsistema de scripts ao engine, permitindo que cartas com comportamento exótico sejam expressas como módulos TypeScript dedicados em `src/data/scripts/`, alcançáveis pelo JSON via `{ "type": "script", "value": "<ref>" }`.

**Premissa data-driven inegociável:** scripts de carta vivem em `src/data/scripts/`, **não** em `src/core/`. O core só ganha o encanamento genérico. Adicionar uma carta exótica nova deve ser possível **sem tocar em nenhum arquivo de `src/core/`**.

---

## Contexto do engine atual

- Resolver vive em `src/core/effects/resolver.ts` (drena `effectStack`).
- Skills são despachadas via registry em `src/core/skills/registry.ts` (mapa `type → SkillHandler`).
- Handlers concretos em `src/core/skills/handlers/*.ts`, registrados no barrel `src/core/skills/handlers/index.ts`.
- Assinatura do handler: `(state, ctx: SkillContext, value: number | string | null) => GameState`.
- `SkillContext` está definido em `src/core/data/skillTypes.ts:140`.
- Vite 8, TS 6, Vitest 4. Alias `@/` aponta para `src/`.

A pasta `src/data/scripts/` **já existe** mas hoje abriga scripts avulsos de dev rodados via `npm run script` (ver `package.json` linha 14 e `src/data/scripts/example.ts`). Esses precisam migrar primeiro.

---

## Plano em fases

Cada fase é um commit atômico, sem dependência futura. Pode parar em qualquer ponto.

### Fase 0 — Liberar `src/data/scripts/`

Os scripts dev atuais sairão de `src/data/scripts/` para abrir espaço para scripts de carta.

1. Criar `tools/dev-scripts/` na raiz do repo.
2. Mover `src/data/scripts/example.ts` → `tools/dev-scripts/example.ts`.
3. Atualizar `package.json`: o script `"script"` continua `npx vite-node` (genérico, recebe path como arg) — apenas atualizar o README para apontar caminhos novos.
4. Atualizar `README.md` (linha do `npm run script` e seção "Scripts avulsos") para usar `tools/dev-scripts/`.
5. Confirmar que `npm run script tools/dev-scripts/example.ts` roda igual a antes.

**Aceite:** `src/data/scripts/` está vazia (ou só com `.gitkeep`). `npm run script tools/dev-scripts/example.ts` funciona.

---

### Fase 1 — Andaime do subsistema (no core)

Criar três arquivos novos em `src/core/scripts/`. Nada conectado ao resolver ainda; objetivo é ter as primitivas tipadas, testáveis isoladamente.

**`src/core/scripts/types.ts`**

```ts
import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";

// Contexto rico passado ao script. Cresce conforme demanda.
// Mantém referência ao SkillContext original para compat com handlers existentes.
export interface ScriptCtx {
  readonly state: GameState;
  readonly skillCtx: SkillContext;
  // namespaces serão expandidos na Fase 4 — começamos só com state/skillCtx + log
  readonly log: (msg: string) => GameState;
}

export type ScriptHandler = (ctx: ScriptCtx) => GameState;
```

**`src/core/scripts/registry.ts`**

```ts
import type { ScriptHandler } from "./types";

// Glob aponta para a pasta de entrada do designer.
// eager: true => tudo embutido no bundle, HMR gratuito no dev.
const modules = import.meta.glob<Record<string, ScriptHandler>>(
  "/src/data/scripts/*.ts",
  { eager: true },
);

const cache = new Map<string, ScriptHandler>();
const warnedMissing = new Set<string>();

for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/scripts\/(.+)\.ts$/);
  if (!match) continue;
  const cardKey = match[1]!;
  for (const [exportName, fn] of Object.entries(mod)) {
    if (typeof fn !== "function") continue;
    cache.set(`${cardKey}.${exportName}`, fn);
  }
}

export function getScript(ref: string): ScriptHandler | null {
  const fn = cache.get(ref);
  if (!fn) {
    if (!warnedMissing.has(ref)) {
      console.warn(`[SCRIPT NÃO ENCONTRADO: ${ref}]`);
      warnedMissing.add(ref);
    }
    return null;
  }
  return fn;
}

// Apenas para testes — força repopular o cache se a infra de teste precisar
export function _resetForTests(): void {
  cache.clear();
  warnedMissing.clear();
}
```

**`src/core/scripts/context.ts`**

```ts
import type { SkillContext } from "../data/skillTypes";
import type { GameState } from "../state/gameState";
import { log as appendLog } from "../reducer/utils";
import type { ScriptCtx } from "./types";

export function buildScriptCtx(state: GameState, skillCtx: SkillContext): ScriptCtx {
  return {
    state,
    skillCtx,
    log: (msg) => appendLog(state, msg),
  };
}
```

**Aceite:**
- `npm run build` passa (compila TS).
- Teste unitário novo em `src/core/scripts/registry.test.ts` valida que o registry consegue resolver um ref fictício após popular o cache manualmente.

---

### Fase 2 — Dispatcher: handler `"script"` no skill registry

Plugar o subsistema no fluxo de skills existente registrando um único handler especial.

1. Criar `src/core/skills/handlers/script.ts`:

```ts
import type { SkillContext } from "../../data/skillTypes";
import type { GameState } from "../../state/gameState";
import { buildScriptCtx } from "../../scripts/context";
import { getScript } from "../../scripts/registry";

export function handleScript(
  state: GameState,
  ctx: SkillContext,
  value: number | string | null,
): GameState {
  if (typeof value !== "string" || value.length === 0) {
    console.warn("[script] sem ref — esperado value: string em formato 'arquivo.funcao'");
    return state;
  }
  const fn = getScript(value);
  if (!fn) return state; // registry já warna
  return fn(buildScriptCtx(state, ctx));
}
```

2. Em `src/core/skills/handlers/index.ts`, importar e registrar:

```ts
import { handleScript } from "./script";
// ...
register("script", handleScript);
```

**Aceite:** ao despachar uma skill JSON do formato `{ "type": "script", "value": "<ref>" }`, o handler é invocado e o resultado é equivalente a uma chamada direta de skill handler — gera as mesmas entradas em `actionLog` e `eventLog`, atravessa o mesmo replay.

---

### Fase 3 — Carta dummy de fim-a-fim

Validar o caminho completo com uma carta artificial sem mexer em conteúdo real.

1. Criar `src/data/scripts/_smoke_test.ts`:

```ts
import type { ScriptHandler } from "@/core/scripts/types";

// Smoke test do subsistema de scripts. Apenas escreve no eventLog.
export const ping: ScriptHandler = (ctx) => {
  return ctx.log("[script smoke] ping executado");
};
```

2. Criar `src/core/scripts/__tests__/end_to_end.test.ts` (Vitest) que:
   - Monta um `GameState` inicial.
   - Invoca diretamente o handler `script` do registry de skills com `value: "_smoke_test.ping"`.
   - Verifica que `eventLog` ganhou a entrada esperada.

Após validar, **o smoke test pode permanecer** (custo zero, útil como canário) ou ser removido. Decidir no commit.

**Aceite:** o teste passa em `npm test`. `npm run dev` carrega o glob sem erros.

---

### Fase 4 — Expandir `ScriptCtx` (sob demanda)

**Não fazer especulativamente.** Quando a primeira carta real for migrada (Fase 5), adicionar os namespaces `query` e `action` ao `ScriptCtx` com as funções **mínimas** necessárias para aquela carta. Cada função nova é wrapper tipado sobre `src/core/systems/` ou `src/core/skills/handlers/`.

Forma sugerida quando chegar a hora:

```ts
export interface ScriptCtx {
  readonly state: GameState;
  readonly skillCtx: SkillContext;
  readonly self: { id: string; controller: string; cardName: string };  // derivado
  readonly event: SkillContext["triggeredBy"];                            // atalho
  readonly query: {
    countHeroDeathsThisRoom(controller: string): number;
    // ...sob demanda
  };
  readonly action: {
    dealDamage(targetId: string, amount: number): GameState;
    heal(targetId: string, amount: number): GameState;
    // ...sob demanda
  };
  readonly random: { int(min: number, max: number): number };  // usar RNG seedado
  readonly log: (msg: string) => GameState;
}
```

**Não implementar agora.** Apenas deixar `types.ts` comentado indicando os namespaces planejados.

---

### Fase 5 — Migrar a primeira carta real

Identificar uma carta que hoje tem handler exclusivo poluindo o registry, ou lógica `if (cardName === ...)` no reducer. Migrar para script. Validar com teste de replay.

**Sem candidato óbvio?** Não migrar. O sistema fica pronto e dormente até a primeira carta exótica de fato aparecer. Não criar trabalho.

---

### Fase 6 — Lint determinístico

No `biome.json` (ou config equivalente), adicionar override bloqueando uso de fontes não-determinísticas em `src/data/scripts/**`:

- `Math.random`
- `Date.now`
- `performance.now`
- `new Date()` (sem argumento)

Usar `noRestrictedGlobals` ou regra customizada. Verificar que `_smoke_test.ts` passa e que um arquivo com `Math.random()` falha o lint.

---

## Restrições e regras

1. **Nenhum arquivo de `src/core/` pode mencionar nome de carta.** Se a busca por strings de cartas em `src/core/` retornar algo novo após o patch, é bug de design.
2. **Scripts não importam de `src/core/` exceto tipos.** `import type { ScriptHandler } from "@/core/scripts/types"` é OK. `import { applyDamage } from "@/core/systems/..."` **não é** — o que o script precisa, vem por `ctx`.
3. **Não introduzir interpretador Lua/JS embarcado.** Scripts são módulos TS do bundle.
4. **Não remover handlers existentes.** Os ~35 handlers de `src/core/skills/handlers/` continuam válidos para comportamento reutilizável; scripts são para o caso restante.
5. **Sem `Math.random`/`Date.now` em código de script** (Fase 6 garante via lint).
6. **Determinismo:** scripts não podem ter estado de módulo top-level que mude com o tempo. Apenas funções puras `(ctx) => GameState`.

---

## Definição de pronto (do patch como um todo)

- [ ] Fase 0: `src/data/scripts/` liberada, dev-scripts migrados, README atualizado.
- [ ] Fase 1: `src/core/scripts/{registry,context,types}.ts` criados, teste unitário do registry passa.
- [ ] Fase 2: handler `"script"` registrado, dispatcher funciona end-to-end.
- [ ] Fase 3: smoke test passa em `npm test`.
- [ ] Fase 6: regra de lint impede `Math.random`/`Date.now` em `src/data/scripts/**`.
- [ ] `npm run build` passa.
- [ ] `npm test` passa.
- [ ] `npm run lint` passa.
- [ ] `git grep -i "necromancer\|skeleton\|<qualquer nome de carta>" src/core/` retorna vazio.

Fases 4 e 5 ficam para quando demanda real aparecer.

---

## Convenções de commit

Conforme `CLAUDE.md` do projeto: mensagens em português, **sem** linha `Co-Authored-By: Claude`. Um commit por fase. Sugestão:

- `chore(scripts): mover dev-scripts para tools/dev-scripts`
- `feat(scripts): andaime do subsistema de scripts (registry + context + types)`
- `feat(scripts): dispatcher via handler "script" no skill registry`
- `test(scripts): smoke test end-to-end do subsistema`
- `chore(lint): bloquear fontes não-determinísticas em src/data/scripts`
