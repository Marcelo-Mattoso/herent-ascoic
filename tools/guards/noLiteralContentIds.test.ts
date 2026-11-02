import { describe, expect, it } from "vitest";
import { testEngine } from "../../src/core/__tests__/testEngine";
import { scanCoupling } from "../golden/couplingScan";

const ALLOWLIST: Readonly<Record<string, string>> = {
	hero_slot: "local de inventário (InventoryLocation), não é carta",
	hero_backpack: "local de inventário (InventoryLocation), não é carta",
	hero_equip: "local de inventário (InventoryLocation), não é carta",
	item_equipped: "tag de estado do ECS",
	item_backpack: "tag de estado do ECS",
	item_in_play: "tag de estado do ECS",
	hero_skill: "categoria do schema do catálogo de habilidades",
	hero_power: "categoria do schema do catálogo de habilidades",
	monster_purple: "categoria do schema do catálogo de habilidades",
	item_skill: "categoria do schema do catálogo de habilidades",
	boss_skill: "categoria do schema do catálogo de habilidades",
	hero_to_dungeon: "escopo de influência da projeção",
	hero_to_group: "escopo de influência da projeção",
	hero_to_self: "escopo de influência da projeção",
	hero_to_enemy: "escopo de influência da projeção",
	item_to_hero: "escopo de influência da projeção",
	hero_wins: "desfecho de combate",
	hero_action: "nome de evento/gatilho do DSL",
	hero_leave_play: "nome de evento/gatilho do DSL",
	hero_or_ally: "seletor de alvo do DSL",
	hero_or_ally_creature: "seletor de alvo do DSL",
	item_deck: "pilha nomeada no vocabulário do DSL",
	power_use: "alvo de bloqueio no vocabulário do DSL",
	hero_id: "campo de descritor de efeito",
	skill_id: "campo de descritor de efeito",
	boss_or_subboss: "conditionType declarado em skills.yaml (avaliador paralelo de itemEffects)",
};

describe("core sem ids literais de conteúdo", () => {
	const hits = scanCoupling().literalContentIds.hits;

	it("nenhum id de carta ou habilidade fora do composition root e da allowlist", () => {
		const offenders = hits.filter((hit) => !(hit.text in ALLOWLIST));
		expect(offenders).toEqual([]);
	});

	it("allowlist só tem rótulos, nunca ids reais do catálogo, e não acumula entradas mortas", () => {
		for (const text of Object.keys(ALLOWLIST)) {
			expect(testEngine.content.hasCard(text), text).toBe(false);
			expect(testEngine.content.hasAbility(text), text).toBe(false);
		}
		const used = new Set(hits.map((hit) => hit.text));
		expect(Object.keys(ALLOWLIST).filter((text) => !used.has(text))).toEqual([]);
	});
});
