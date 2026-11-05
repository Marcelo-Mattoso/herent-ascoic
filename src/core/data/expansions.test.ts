import { describe, expect, it } from "vitest";
import { getAllCards, getCardById } from "./cards";
import { getEnabledExpansions, getExpansionCardMetadata } from "./expansions";

describe("pacotes de expansão", () => {
	it("carrega a Fornalha Sombria sem alterar os 80 IDs originais", () => {
		expect(getEnabledExpansions().map((pack) => pack.id)).toEqual(["fornalha-sombria", "torre-grande-bruxa-caldeirao"]);
		expect(getAllCards()).toHaveLength(147);
		expect(getEnabledExpansions()[0]?.boss).toBe("boss.json");
		expect(getEnabledExpansions()[0]?.cards.some((card) => card.type === "boss")).toBe(false);
		expect(new Set(getAllCards().map((card) => card.id)).size).toBe(147);
	});

	it("mantém atributos de combate e referências de habilidades", () => {
		const card = getCardById("hero_crimson_barbarian");
		expect(card?.type).toBe("hero");
		if (card?.type !== "hero") return;
		expect(card.life).toEqual([12, 14, 16, 18, 20]);
		expect(card.skills[0]?.skillId).toBe("skill_crimson_fury");
	});

	it("associa a imagem pelo ID, independentemente da tradução", () => {
		const meta = getExpansionCardMetadata("hero_crimson_barbarian");
		expect(meta?.expansionId).toBe("fornalha-sombria");
		expect(meta?.image).toBe("images/BárbaroRubro.webp");
	});
	it("usa apenas a pasta images, sem subpastas por categoria", () => {
		const paths = getAllCards().map((card) => getExpansionCardMetadata(card.id)?.image)
			.filter((image) => image !== undefined);
		expect(paths.length).toBe(145);
		for (const image of paths) {
			expect(image).toMatch(/^images\/[^/]+\.webp$/);
		}
	});
	it("Torre da Bruxa v1.4: 18 criaturas, 10 salas, 26 itens e 4 artefatos", () => {
		const witch = getEnabledExpansions().find((entry) => entry.id === "torre-grande-bruxa-caldeirao");
		expect(witch?.cards).toHaveLength(66);
		expect(witch?.version).toBe("1.4.0");
		for (const [type, amount] of Object.entries({ hero: 4, creature: 18, subboss: 2, room: 10, subboss_room: 2, item: 26, artifact: 4 })) {
			expect(witch?.cards.filter((card) => card.type === type), type).toHaveLength(amount);
		}
		for (const id of ["room_spider_egg_gallery", "room_witch_herbarium"]) {
			const room = getCardById(id);
			expect(room?.type).toBe("room");
			if (room?.type !== "room") continue;
			expect(room.rewardType).toBe("artifact");
			expect(room.reward).toBe(1);
		}
		for (const id of ["item_mossy_chest", "item_bone_oracle_dice", "item_crooked_branch_map", "item_cauldron_cache"]) {
			const item = getCardById(id);
			expect(item?.type).toBe("item");
			if (item?.type !== "item") continue;
			expect(item.grants).toHaveLength(1);
			expect(item.grants?.[0]).toMatchObject({
				abilityId: "item_skill_mystic_draw",
				activation: { kind: "manual", consumeSource: "remove", usableFromReward: true },
			});
		}
	});

});
