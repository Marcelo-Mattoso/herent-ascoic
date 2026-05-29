import { describe, expect, it } from "vitest";
import type { SkillContext } from "../../data/skillTypes";
import { handleScript } from "../../skills/handlers/script";
import { createInitialGameState } from "../../state/gameState";

// Importa o barrel para garantir que o handler "script" está registrado
import "../../skills/handlers/index";

const baseCtx: SkillContext = { triggeredBy: "on_use" };

describe("subsistema de scripts — end-to-end", () => {
	it("ping escreve no eventLog via ctx.log", () => {
		const state = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const next = handleScript(state, baseCtx, "_smoke_test.ping");
		const lastEntry = next.eventLog[next.eventLog.length - 1];
		expect(lastEntry).toContain("[script smoke] ping executado");
	});

	it("retorna state inalterado para ref inexistente", () => {
		const state = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const next = handleScript(state, baseCtx, "inexistente.fn");
		expect(next).toBe(state);
	});

	it("retorna state inalterado para value nulo", () => {
		const state = createInitialGameState({ heroCardNames: ["Bárbaro Rubro"] });
		const next = handleScript(state, baseCtx, null);
		expect(next).toBe(state);
	});
});
