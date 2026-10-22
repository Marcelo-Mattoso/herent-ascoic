// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeroState } from "@/core/state/heroState";
import { HeroTray } from "./HeroTray";

afterEach(cleanup);

function hero(id = "h1", overrides: Partial<HeroState> = {}): HeroState {
	return {
		id,
		cardId: "hero_crimson_barbarian",
		maxLife: 12,
		currentLife: 12,
		damage: 4,
		hitBonus: 5,
		dice: 1,
		impeto: 0,
		activeItems: {},
		itemReadiness: {},
		backpack: [],
		usedPowers: {},
		conditions: [],
		status: "active",
		playerIndex: 0,
		xp: 0,
		...overrides,
	};
}

function renderTray(subject: HeroState) {
	return render(
		<HeroTray
			hero={subject}
			isFocused={false}
			hasActed={false}
			isSelected={false}
			canAct={false}
			onHeroClick={vi.fn()}
			onCardDetail={vi.fn()}
		/>,
	);
}

describe("HeroTray", () => {
	it("renderiza de um a quatro trays", () => {
		for (const count of [1, 2, 3, 4]) {
			const result = render(
				<>
					{Array.from({ length: count }, (_, index) => (
						<HeroTray
							key={index}
							hero={hero(`h${index}`)}
							isFocused={false}
							hasActed={false}
							isSelected={false}
							canAct={false}
							onHeroClick={vi.fn()}
							onCardDetail={vi.fn()}
						/>
					))}
				</>,
			);
			expect(result.container.querySelectorAll(".hero-tray")).toHaveLength(
				count,
			);
			result.unmount();
		}
	});

	it("mantém slots vazios, mochila de três e duas mãos como uma única carta", () => {
		renderTray(
			hero("h1", {
				activeItems: {
					clothing1: "item_tunnel_hood",
					clothing2: "item_light_stone_boots",
					amulet: "item_low_flame_charm",
					hand1: "item_crimson_rune_staff",
					hand2: "item_crimson_rune_staff",
				},
				backpack: ["item_rusty_dagger", "item_lesser_vigor_potion"],
				itemReadiness: { item_low_flame_charm: "exhausted" },
			}),
		);

		expect(
			screen.getByTitle("Mãos 1 + 2 · 2 mãos: Cajado das Runas Rubras"),
		).toBeTruthy();
		expect(screen.getAllByText("Exaurido")).toHaveLength(1);
		expect(screen.getByTitle("Mochila 3: vazio")).toBeTruthy();
		expect(screen.getByText("Habilidades")).toBeTruthy();
		expect(screen.getByText("Poderes")).toBeTruthy();
		expect(screen.getByText("Vida")).toBeTruthy();
	});
});
