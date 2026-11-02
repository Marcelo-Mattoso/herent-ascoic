/**
 * Tutorial interaction firewall: spotlight holes are visual, not permission.
 * Keep the set of actions deterministic for each live training step.
 * This runs at document capture phase, including for portal-rendered dialogs.
 */
export interface TutorialInteractionContext {
	readonly stepId: string;
	readonly review: boolean;
	readonly combatPhase?: string | null;
}

const SELECT_HERO = '[data-tutorial-anchor="combat.hero"] .game-card--hero, .game-card--hero[data-tutorial-anchor="combat.hero"]';
const SELECT_ENEMY = '.game-card--enemy[data-tutorial-anchor="combat.enemy"], [data-tutorial-anchor="combat.enemy"] .game-card--enemy';
const BACKPACK = '[data-tutorial-anchor="hero.backpack"] .inventory-backpack-stack';
const JOURNAL = 'button[data-tutorial-anchor="journal.open"], [data-tutorial-anchor="journal.open"] button';

function matches(target: Element, selector: string): boolean {
	return !!target.closest(selector);
}

function inBackpackItem(target: Element, itemId: string, action?: string): boolean {
	const item = target.closest<HTMLElement>(".inventory-backpack-item");
	if (!item || item.dataset.tutorialItemId !== itemId) return false;
	if (action) return matches(target, `[data-tutorial-inventory-action="${action}"]`);
	return !target.closest("button");
}

/** Whether a user activation may reach the game while a tutorial step is active. */
export function tutorialAllowsInteraction(target: Element, ctx: TutorialInteractionContext): boolean {
	// Navigation, back, review, audit and explicit exit are always accessible.
	if (matches(target, ".tutorial-panel")) return true;
	if (ctx.review) return false;

	// Portals are outside the highlighted arena. Once a dialog opens, only its
	// legitimate close control or the specific requested action is clickable.
	const art = document.querySelector(".hero-art-viewer");
	if (art) return art.contains(target) && matches(target, ".hero-art-viewer__backdrop, .hero-art-viewer__header button");
	const dice = document.querySelector(".game-dice-roll-layer");
	if (dice) return dice.contains(target) && ["combat-select-target", "combat-dice", "hunter-attack", "fury-trigger"].includes(ctx.stepId)
		&& matches(target, ".game-dice-roll-action:not(:disabled)");
	const modalLayers = document.querySelectorAll(".modal-layer");
	const modal = modalLayers.item(modalLayers.length - 1);
	if (modal) {
		if (!modal.contains(target)) return false;
		if (matches(target, ".modal-close")) return true;
		if (ctx.stepId === "prey-mark") return matches(target, ".skill-target-option:not(:disabled)");
		if (ctx.stepId === "use-item") return matches(target, '[data-tutorial-anchor="item.confirm-use"]');
		return false;
	}
	const setupDialog = document.querySelector(".flow-modal-overlay");
	if (setupDialog) return setupDialog.contains(target) && matches(target, ".flow-modal-header button");
	const heroInventoryDialog = document.querySelector(".inventory-hero-modal-overlay");
	if (heroInventoryDialog) return heroInventoryDialog.contains(target) && matches(target, ".inventory-hero-modal__close");
	const journal = document.querySelector(".journal-layer");
	if (journal) return journal.contains(target) && matches(target, '.journal-layer__backdrop, .journal-panel button:not(:disabled), .journal-layer button:not(:disabled)');
	// Never open the game settings or unrelated side panels during an archive.
	if (matches(target, ".global-menu, .support-action, .game-portable-drawer-layer")) return false;

	switch (ctx.stepId) {
		case "choose-hero":
		case "group":
			return matches(target, ".setup-hero-select-button, .setup-hero-info-button");
		case "start":
			return matches(target, 'button[data-tutorial-anchor="setup.start-expedition"]');
		case "reveal":
			return matches(target, '[data-tutorial-anchor="board.main-action"] button, button[data-tutorial-anchor="board.main-action"]');
		case "combat-select-hero":
			return matches(target, SELECT_HERO);
		case "combat-select-target":
			return matches(target, SELECT_ENEMY);
		case "combat-drag":
			return matches(target, `${SELECT_HERO}, ${SELECT_ENEMY}`);
		case "abilities-inspect":
			return matches(target, `${SELECT_HERO}, [data-tutorial-anchor="hero.portrait"]`);
		case "prey-mark":
		case "fury-prepare":
			return matches(target, `${SELECT_HERO}, [data-tutorial-anchor="hero.skill-action"]`);
		case "hero-power":
			return matches(target, `${SELECT_HERO}, [data-tutorial-anchor="hero.power-action"]`);
		case "hunter-attack":
		case "fury-trigger":
			return matches(target, `${SELECT_HERO}, ${SELECT_ENEMY}`);
		case "inventory-open":
			return matches(target, '[data-tutorial-anchor="board.heroes"] .game-card--hero, [data-tutorial-anchor="inventory.open"]');
		case "item-inspect":
			return matches(target, BACKPACK) || inBackpackItem(target, "item_rusty_dagger");
		case "equip-dagger":
			return matches(target, BACKPACK) || inBackpackItem(target, "item_rusty_dagger", "equip");
		case "equip-axe":
			return matches(target, BACKPACK) || inBackpackItem(target, "item_ruined_hall_axe", "swap") ||
				(matches(target, '[data-tutorial-anchor="hero.hands"]') && !!target.closest('[data-tutorial-pending-equip="true"]'));
		case "equip-armor":
			return matches(target, BACKPACK) || inBackpackItem(target, "item_reinforced_leather_armor", "equip");
		case "use-item":
			return matches(target, BACKPACK) || inBackpackItem(target, "item_precision_potion", "swap") ||
				(matches(target, '[data-tutorial-anchor="hero.hands"]') && !!target.closest('[data-tutorial-pending-equip="true"]')) ||
				matches(target, '[data-tutorial-anchor="item.use-action"]');
		case "item-states":
		case "passive-effect":
		case "ability-limits":
			return matches(target, JOURNAL);
		default:
			// Narration, observation and completion only use the Archivist panel.
			return false;
	}
}
