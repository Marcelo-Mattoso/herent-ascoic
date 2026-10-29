// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "@/core/state/gameState";
import { playerView } from "@/core/projection/playerView";
import { getCardName } from "@/core/data/cardLocale";
import { displayCardName } from "@/i18n/catalogs";
import { normalizeCardImageKey } from "@/ui/cardImages";
import { TriggerInterruptModal } from "./TriggerInterruptModal";

const sourceCardId = "hero_crimson_barbarian";
const imageUrl = "/herent-ascoic/generated/cards/assets/barbarian.png";
const imageUrls = {
	[normalizeCardImageKey(getCardName(sourceCardId))]: imageUrl,
};
const dispatch = vi.fn();
const base = createInitialGameState({ heroCardIds: [sourceCardId] });
let view = playerView(base);

vi.mock("@/ui/store/gameStore", () => ({
	useGameStore: () => ({ view, dispatch }),
}));
vi.mock("@/ui/hooks/useCardImages", () => ({ useCardImages: () => imageUrls }));

beforeEach(() => {
	dispatch.mockReset();
	view = {
		...playerView(base),
		pendingTriggerInterrupt: {
			id: "interrupt-1",
			skillId: "power_mighty_crimson_fury",
			event: "evt_damage_dealt",
			window: "after_damage",
			sourceKind: "hero",
			sourceCardId,
			sourceHeroId: "h1",
			reason: "Pode ativar o poder.",
			description: "power_mighty_crimson_fury",
		},
	};
});
afterEach(cleanup);

describe("TriggerInterruptModal", () => {
	it("exibe a carta, permite inspeção sem decidir e envia a decisão apenas uma vez", () => {
		render(<TriggerInterruptModal />);
		const art = screen.getByRole("button", {
			name: `Ver carta ${displayCardName(sourceCardId)}`,
		});
		expect(art.querySelector("img")?.getAttribute("src")).toBe(imageUrl);
		fireEvent.click(art);
		expect(dispatch).not.toHaveBeenCalled();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(dispatch).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Aplicar habilidade" }));
		fireEvent.click(screen.getByRole("button", { name: "Aplicar habilidade" }));
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId: "interrupt-1" },
		});
	});
});
