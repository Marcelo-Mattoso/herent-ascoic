import type { Locator, Page } from "@playwright/test";
import type { Action } from "@/core/actions/types";

export interface ScreenFacts {
	readonly heroes: readonly string[];
	readonly enemies: readonly string[];
	readonly activeHeroes: readonly string[];
	readonly choices: readonly string[];
	readonly targets: readonly string[];
}

/** "unsupported": esta saída não conseguiu executar a jogada; o bot tenta a próxima opção. */
export type OutputResult = "done" | "unsupported";

/** Executa uma decisão pronta. Não escolhe nada: a decisão vem de `brain.ts`. */
export interface ActionOutput {
	readonly name: string;
	perform(action: Action, facts: ScreenFacts): Promise<OutputResult>;
}

export function storeOutput(page: Page): ActionOutput {
	return {
		name: "store",
		async perform(action) {
			await page.evaluate(`window.__dispatch(${JSON.stringify(action)})`);
			return "done";
		},
	};
}

const SCREEN_LABELS: Partial<Record<Action["type"], RegExp>> = {
	RESOLVE_ATTACK: /Resolver ataque/,
	REVEAL_BOSS: /Enfrentar chefe/,
	CONTINUE_EXPLORATION: /Continuar explorando/,
};

const XP_ROW: Readonly<Record<string, RegExp>> = {
	buy_item: /Comprar item/i,
	buy_artifact: /artefato/i,
	level_up: /n[ií]vel/i,
	recover_dungeon: /reembaralh|recuperar/i,
};

const usable = async (button: Locator) =>
	(await button.isVisible().catch(() => false)) &&
	(await button.isEnabled().catch(() => false));

async function clickButton(page: Page, label: RegExp): Promise<boolean> {
	const button = page.getByRole("button", { name: label }).last();
	if (!(await button.isVisible().catch(() => false))) return false;
	if (!(await button.isEnabled().catch(() => false))) return true;
	await button.click({ timeout: 3000 });
	return true;
}

/** Sem mapa específico, age como quem lê o modal: botão de confirmar é o último. */
async function clickDialog(page: Page): Promise<boolean> {
	const dialog = page.getByRole("dialog").last();
	if (!(await dialog.isVisible().catch(() => false))) return false;
	const buttons = dialog.getByRole("button");
	for (let i = (await buttons.count()) - 1; i >= 0; i--) {
		const button = buttons.nth(i);
		const text = (await button.innerText().catch(() => "")).trim();
		if (!text || text === "✕" || /fechar|detalhe|voltar|cancelar/i.test(text)) continue;
		if (!(await button.isEnabled())) continue;
		await button.click({ timeout: 3000 });
		return true;
	}
	return false;
}

async function closeHeroPanel(page: Page): Promise<void> {
	const close = page.getByRole("button", { name: "Fechar herói em foco" });
	if (await close.isVisible().catch(() => false)) {
		await close.click({ position: { x: 2, y: 2 }, timeout: 2000 });
	}
}

/** Abre o painel do herói como o jogador: dois cliques na carta. */
async function clickInHeroPanel(
	page: Page,
	facts: ScreenFacts,
	heroId: string,
	button: Locator,
): Promise<OutputResult> {
	const card = page.locator(".game-card--hero").nth(facts.heroes.indexOf(heroId));
	await closeHeroPanel(page);
	await card.click({ timeout: 3000 });
	if (!(await button.isVisible().catch(() => false))) await card.click({ timeout: 3000 });
	if (!(await usable(button))) {
		await closeHeroPanel(page);
		return "unsupported";
	}
	await button.click({ timeout: 3000 });
	return "done";
}

/** Solta o item nas zonas do herói até uma aceitar; a mesa encolher é o sinal de que entrou. */
async function dragReward(
	page: Page,
	facts: ScreenFacts,
	heroId: string,
	destination: string,
): Promise<OutputResult> {
	const table = page.locator(".inventory-drop-panel--items [draggable='true']");
	const before = await table.count();
	if (before === 0 || destination === "discard") return "unsupported";
	const card = page.locator(".inventory-hero-card").nth(facts.activeHeroes.indexOf(heroId));
	const zones =
		destination === "equip"
			? card.locator("[data-tutorial-anchor]:not([data-tutorial-anchor='hero.backpack'])")
			: card.locator(".inventory-backpack-wrap");
	for (let i = 0; i < (await zones.count()); i++) {
		await table.first().dragTo(zones.nth(i), { timeout: 3000 }).catch(() => undefined);
		if ((await table.count()) < before) return "done";
	}
	return "unsupported";
}

async function performInInventory(
	page: Page,
	action: Action,
	facts: ScreenFacts,
): Promise<OutputResult> {
	if (action.type === "CHOOSE_ITEM_DESTINATION") {
		return dragReward(page, facts, action.payload.heroId, action.payload.destination);
	}
	if (action.type === "CHOOSE_ARTIFACT_BEARER") {
		const select = page.locator(".inventory-active-artifact select").first();
		if (!(await select.isVisible().catch(() => false)) || (await select.inputValue())) {
			return "unsupported";
		}
		await select.selectOption(action.payload.heroId);
		return "done";
	}
	return (await clickButton(page, /Finalizar arruma/)) ? "done" : "unsupported";
}

async function spendXp(
	page: Page,
	action: Extract<Action, { type: "SPEND_XP" }>,
	facts: ScreenFacts,
): Promise<OutputResult> {
	const label = XP_ROW[action.payload.option];
	if (!label) return "unsupported";
	const row = page
		.getByRole("dialog")
		.last()
		.locator("div", { hasText: label })
		.filter({ has: page.getByRole("button") })
		.last();
	const button = row.getByRole("button").first();
	if (!(await usable(button))) return "unsupported";
	await button.click({ timeout: 3000 });
	if (action.payload.option === "level_up") {
		await page
			.locator(".xp-level-choice__grid button")
			.nth(facts.activeHeroes.indexOf(action.payload.heroId ?? ""))
			.click({ timeout: 3000 });
	}
	return "done";
}

export function screenOutput(page: Page): ActionOutput {
	return {
		name: "tela",
		async perform(action, facts) {
			if (await page.locator(".inventory-overlay").isVisible().catch(() => false)) {
				return performInInventory(page, action, facts);
			}
			const dialog = page.getByRole("dialog").last();
			switch (action.type) {
				case "SKILL_CHOICE":
					await page
						.locator(".skill-choice-option")
						.nth(facts.choices.indexOf(action.payload.choice))
						.getByRole("button")
						.last()
						.click({ timeout: 3000 });
					return "done";
				case "SELECT_SKILL_TARGET":
					await dialog
						.getByRole("button")
						.nth(facts.targets.indexOf(action.payload.targetId))
						.click({ timeout: 3000 });
					return "done";
				case "APPLY_TRIGGER_INTERRUPT":
					await page.locator(".trigger-interrupt-modal__actions button").last().click({ timeout: 3000 });
					return "done";
				case "SKIP_TRIGGER_INTERRUPT":
					await page.locator(".trigger-interrupt-modal__actions button").first().click({ timeout: 3000 });
					return "done";
				case "SPEND_XP":
					return spendXp(page, action, facts);
				default:
					break;
			}
			const label = SCREEN_LABELS[action.type];
			if (label && (await clickButton(page, label))) return "done";
			if (await dialog.isVisible().catch(() => false)) {
				return (await clickDialog(page)) ? "done" : "unsupported";
			}
			switch (action.type) {
				case "USE_POWER":
					return clickInHeroPanel(page, facts, action.payload.heroId, page.locator('[data-tutorial-anchor="hero.power-action"]'));
				case "USE_SKILL":
					return clickInHeroPanel(page, facts, action.payload.sourceId, page.locator('[data-tutorial-anchor="hero.skill-action"]'));
				case "USE_ITEM":
					return clickInHeroPanel(page, facts, action.payload.heroId, page.getByRole("button", { name: "Usar item" }));
				case "CHOOSE_TARGET": {
					await closeHeroPanel(page);
					const hero = page.locator(".game-card--hero").nth(facts.heroes.indexOf(action.payload.heroId));
					const enemy = page
						.locator(".game-card--enemy, .game-card--boss")
						.nth(facts.enemies.indexOf(action.payload.enemyId));
					await hero.dragTo(enemy, { timeout: 5000 });
					return "done";
				}
				default:
					return "unsupported";
			}
		},
	};
}
