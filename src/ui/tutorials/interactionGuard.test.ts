// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { tutorialAllowsInteraction, type TutorialInteractionContext } from "./interactionGuard";

const context = (stepId: string, extra: Partial<TutorialInteractionContext> = {}) => ({
	stepId,
	review: false,
	...extra,
});
const target = (selector: string) => {
	const found = document.querySelector(selector);
	if (!found) throw new Error(`Elemento ausente: ${selector}`);
	return found;
};

beforeEach(() => {
	document.body.innerHTML = "";
});

describe("bloqueio de ações durante os arquivos", () => {
	it("mantém as ações do Arquivista e bloqueia cliques fora da etapa", () => {
		document.body.innerHTML = `<section class="tutorial-panel"><button id="back">Voltar</button></section>
		<button id="menu">Menu</button>
		<button data-tutorial-anchor="setup.start-expedition" id="start">Iniciar</button>
		<button class="setup-hero-select-button" id="hero">Herói</button>`;
		expect(tutorialAllowsInteraction(target("#back"), context("start"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#start"), context("start"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#hero"), context("start"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#menu"), context("start"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#start"), context("start", { review: true }))).toBe(false);
	});
	it("impede abrir o herói ou outras ações durante o alvo de combate", () => {
		document.body.innerHTML = `<div data-tutorial-anchor="combat.hero"><button class="game-card--hero" id="hero">Herói</button></div>
		<button class="game-card--enemy" data-tutorial-anchor="combat.enemy" id="enemy">Criatura</button>
		<button id="power" data-tutorial-anchor="hero.power-action">Poder</button>`;
		expect(tutorialAllowsInteraction(target("#hero"), context("combat-select-target"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#enemy"), context("combat-select-target"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#power"), context("combat-select-target"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#hero"), context("combat-drag"))).toBe(true);
	});
	it("só aceita a confirmação dos dados enquanto a rolagem ocupa a tela", () => {
		document.body.innerHTML = `<div class="game-dice-roll-layer"><button class="game-dice-roll-action">Resolver</button><button id="other">Outra ação</button></div>
			<button id="hero" class="game-card--hero">Herói</button>`;
		expect(tutorialAllowsInteraction(target(".game-dice-roll-action"), context("combat-dice"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#other"), context("combat-dice"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#hero"), context("combat-dice"))).toBe(false);
	});
	it("aceita apenas o item exato e sua operação de inventário", () => {
		document.body.innerHTML = `<div data-tutorial-anchor="hero.backpack"><button class="inventory-backpack-stack">Mochila</button></div>
			<div class="inventory-backpack-item" data-tutorial-item-id="item_rusty_dagger"><span id="dagger">Adaga</span><button data-tutorial-inventory-action="equip" id="dagger-equip">Equipar</button></div>
			<div class="inventory-backpack-item" data-tutorial-item-id="item_ruined_hall_axe"><span id="axe">Machado</span><button data-tutorial-inventory-action="swap" id="axe-swap">Trocar</button></div>`;
		expect(tutorialAllowsInteraction(target(".inventory-backpack-stack"), context("item-inspect"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#dagger"), context("item-inspect"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#axe"), context("item-inspect"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#axe-swap"), context("equip-dagger"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#dagger-equip"), context("equip-dagger"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#axe-swap"), context("equip-axe"))).toBe(true);
	});
	it("um modal ativo permite apenas o alvo ou seu fechamento", () => {
		document.body.innerHTML = `<div class="modal-layer"><div class="modal-dialog">
			<button class="modal-close" id="close">Fechar</button>
			<button class="skill-target-option" id="candidate">Escolher</button>
			<button id="other">Errado</button></div></div>
			<button class="game-card--enemy" data-tutorial-anchor="combat.enemy" id="enemy">Criatura</button>`;
		expect(tutorialAllowsInteraction(target("#candidate"), context("prey-mark"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#close"), context("prey-mark"))).toBe(true);
		expect(tutorialAllowsInteraction(target("#other"), context("prey-mark"))).toBe(false);
		expect(tutorialAllowsInteraction(target("#enemy"), context("prey-mark"))).toBe(false);
	});
});
