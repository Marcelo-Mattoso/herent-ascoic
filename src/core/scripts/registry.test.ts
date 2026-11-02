import { describe, expect, it } from "vitest";
import { createScriptRegistry } from "./registry";
import type { ScriptHandler, SkillContinuation } from "./types";

describe("script registry", () => {
	it("retorna null para ref desconhecido", () => {
		expect(createScriptRegistry({}).get("inexistente.fn")).toBeNull();
	});

	it("resolve ref registrado manualmente", () => {
		const registry = createScriptRegistry({});
		const handler: ScriptHandler = (ctx) => ctx.state;
		registry.register("teste.handler", handler);
		expect(registry.get("teste.handler")).toBe(handler);
	});

	it("indexa exports dos módulos por arquivo.export", () => {
		const handler: ScriptHandler = (ctx) => ctx.state;
		const registry = createScriptRegistry({
			"/src/data/scripts/skill_x.ts": { run: handler },
		});
		expect(registry.get("skill_x.run")).toBe(handler);
	});

	it("registries distintos não compartilham cache", () => {
		const handler: ScriptHandler = (ctx) => ctx.state;
		const a = createScriptRegistry({});
		a.register("outro.handler", handler);
		expect(createScriptRegistry({}).get("outro.handler")).toBeNull();
	});

	it("indexa a continuação por skillId, por registro, sem global", () => {
		const continuation: SkillContinuation = (state) => state;
		const a = createScriptRegistry({
			"/src/data/scripts/skill_x.ts": { run: (ctx: { state: unknown }) => ctx.state, continuation },
		});
		expect(a.continuationOf("skill_x")).toBe(continuation);
		expect(a.get("skill_x.continuation")).toBeNull();
		expect(createScriptRegistry({}).continuationOf("skill_x")).toBeNull();
	});
});
