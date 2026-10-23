// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCardName } from "@/core/data/cardLocale";
import { createInitialGameState, type GameState } from "@/core/state/gameState";
import { normalizeCardImageKey } from "@/ui/cardImages";
import {
	SkillChoiceModal,
	choiceCardId,
	choiceSourceCardId,
} from "./SkillChoiceModal";

let currentState: GameState;
const dispatch = vi.fn();
const itemA = "item_rusty_dagger";
const itemB = "item_cracked_shield";
const roomA = "room_narrow_corridor";
const roomB = "room_dungeon_room";
const imageUrls = Object.fromEntries(
	[itemA, itemB, roomA, roomB].map((id) => [
		normalizeCardImageKey(getCardName(id)),
		`/herent-ascoic/generated/cards/assets/${id}.png`,
	]),
);

vi.mock("@/ui/store/gameStore", () => ({
	useGameStore: () => ({ state: currentState, dispatch }),
}));
vi.mock("@/ui/hooks/useCardImages", () => ({ useCardImages: () => imageUrls }));

function withChoice(
	pending: NonNullable<GameState["pendingSkillChoice"]>,
	extra: Partial<GameState> = {},
) {
	currentState = {
		...createInitialGameState({ heroCardIds: [] }),
		...extra,
		pendingSkillChoice: pending,
	};
}

beforeEach(() => {
	dispatch.mockReset();
});
afterEach(cleanup);

describe("SkillChoiceModal", () => {
	it("mostra itens localizados com imagens, permite inspeção sem decidir e confirma uma vez", () => {
		withChoice({
			skillId: "skill_forge_spoils",
			prompt: "Escolha 1 carta",
			kind: "draw_and_choose",
			discardDeck: "itemDeck",
			options: [
				{ id: itemA, label: itemA },
				{ id: itemB, label: itemB },
			],
		});
		const { container } = render(<SkillChoiceModal />);
		expect(screen.getByText("Adaga Enferrujada")).toBeTruthy();
		expect(screen.getByText("Escudo Rachado")).toBeTruthy();
		expect(
			container.querySelectorAll(".skill-choice-option--card"),
		).toHaveLength(2);
		expect(
			screen
				.getByRole("img", { name: "Adaga Enferrujada" })
				.getAttribute("src"),
		).toBe(imageUrls[normalizeCardImageKey("Adaga Enferrujada")]);

		fireEvent.click(
			screen.getByRole("button", { name: "Examinar carta: Adaga Enferrujada" }),
		);
		expect(
			screen.getByRole("dialog", { name: "Adaga Enferrujada" }),
		).toBeTruthy();
		expect(dispatch).not.toHaveBeenCalled();
		fireEvent.click(
			screen
				.getByRole("dialog", { name: "Adaga Enferrujada" })
				.querySelector(".modal-close") as HTMLElement,
		);
		expect(
			screen.queryByRole("dialog", { name: "Adaga Enferrujada" }),
		).toBeNull();
		expect(dispatch).not.toHaveBeenCalled();

		fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
		fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
		expect(dispatch).toHaveBeenCalledTimes(1);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_forge_spoils", choice: itemA },
		});
	});

	it("distingue cartas reveladas da dungeon dos IDs técnicos e não expõe outras cartas", () => {
		const pending = {
			skillId: "skill_illuminate_path",
			prompt: "Observe as cartas",
			options: [
				{ id: "card_0", label: roomA },
				{ id: "card_1", label: roomB },
				{ id: "ok", label: "Confirmar (manter ordem atual)" },
			],
		};
		withChoice(pending, {
			decks: {
				...createInitialGameState({ heroCardIds: [] }).decks,
				dungeonDeck: {
					available: [roomA, roomB, "room_abandoned_cell"],
					discarded: [],
					removed: [],
				},
			},
		});
		const { container } = render(<SkillChoiceModal />);
		expect(
			container.querySelectorAll(".skill-choice-option--card"),
		).toHaveLength(2);
		expect(screen.queryByText(getCardName("room_abandoned_cell"))).toBeNull();
		expect(
			screen.getByRole("img", { name: getCardName(roomA) }).getAttribute("src"),
		).toBe(imageUrls[normalizeCardImageKey(getCardName(roomA))]);
		expect(choiceCardId(currentState, pending, pending.options[0])).toBe(roomA);
		fireEvent.click(
			screen.getByRole("button", {
				name: `Examinar carta: ${getCardName(roomA)}`,
			}),
		);
		expect(dispatch).not.toHaveBeenCalled();
		fireEvent.click(
			container.querySelector(
				".skill-choice-option--card .action-button",
			) as HTMLElement,
		);
		expect(dispatch).toHaveBeenCalledWith({
			type: "SKILL_CHOICE",
			payload: { skillId: pending.skillId, choice: "card_0" },
		});
	});

	it("apresenta carta elegível do descarte e preserva opção textual abstrata", () => {
		withChoice(
			{
				skillId: "skill_rekindled_forge",
				prompt: "Recupere um item",
				options: [{ id: itemB, label: itemB }],
			},
			{
				decks: {
					...createInitialGameState({ heroCardIds: [] }).decks,
					itemDeck: { available: [], discarded: [itemB], removed: [] },
				},
			},
		);
		const { rerender, container } = render(<SkillChoiceModal />);
		expect(
			screen.getByRole("button", { name: "Examinar carta: Escudo Rachado" }),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Escolher" }));
		expect(dispatch).toHaveBeenCalledWith({
			type: "SKILL_CHOICE",
			payload: { skillId: "skill_rekindled_forge", choice: itemB },
		});

		withChoice({
			skillId: "skill_focus_deflection",
			prompt: "Como responder?",
			options: [{ id: "tohit", label: "Aceitar e ganhar acerto" }],
		});
		rerender(<SkillChoiceModal />);
		expect(
			container.querySelectorAll(".skill-choice-option--card"),
		).toHaveLength(0);
		expect(screen.getByText("Aceitar e ganhar acerto")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Examinar carta/ })).toBeNull();
	});

	it("não associa uma carta de origem sem evidência e rejeita rótulos de dungeon inconsistentes", () => {
		const pending = {
			skillId: "skill_illuminate_path",
			prompt: "Observe",
			options: [{ id: "card_0", label: roomA }],
		};
		withChoice(pending, {
			decks: {
				...createInitialGameState({ heroCardIds: [] }).decks,
				dungeonDeck: { available: [roomB], discarded: [], removed: [] },
			},
		});
		expect(choiceCardId(currentState, pending, pending.options[0])).toBeNull();
		expect(choiceSourceCardId(currentState, pending)).toBeNull();
		const { container } = render(<SkillChoiceModal />);
		expect(
			container.querySelectorAll(".skill-choice-option--card"),
		).toHaveLength(0);
	});

	it("identifica a sala ativa que realmente possui a habilidade", () => {
		const pending = {
			skillId: "dungeon_skill_forge_spoils",
			prompt: "Escolha um item",
			options: [{ id: itemA, label: itemA }],
		};
		withChoice(pending, {
			currentRoom: {
				cardId: "room_abandoned_cell",
				exits: 3,
				currentEnemies: 0,
				reward: 1,
				rewardType: "item",
				effect: "",
				xp: 1,
				status: "cleared",
			},
		});
		expect(choiceSourceCardId(currentState, pending)).toBe(
			"room_abandoned_cell",
		);
		render(<SkillChoiceModal />);
		expect(screen.getByText("Carta de origem")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", {
				name: `Examinar carta de origem: ${getCardName("room_abandoned_cell")}`,
			}),
		);
		expect(
			screen.getByRole("dialog", { name: getCardName("room_abandoned_cell") }),
		).toBeTruthy();
		expect(dispatch).not.toHaveBeenCalled();
	});
});
