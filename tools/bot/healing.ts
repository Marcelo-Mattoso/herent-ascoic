import type { PlayerView } from "@/core/projection/playerView";
import { cardById, skillById } from "@/core/gameEngine";
import { engine } from "../golden/lib";

/** Resolve healing by effect definition, not translated card names. */
export function itemHealingAmount(itemId: string): number | null {
	const card = cardById(engine, itemId);
	if (!card || card.type !== "item") return null;
	const grant = card.grants?.find((entry) => entry.activation.kind === "manual");
	const ref = card.skills?.find((entry) => entry.skillId === grant?.abilityId) ?? card.skills?.[0];
	const ability = skillById(engine, grant?.abilityId ?? ref?.skillId ?? "");
	if (!ability) return null;
	const params: Record<string, unknown> = { ...(ref?.params ?? {}), ...(grant?.params ?? {}) };
	function findHeal(node: unknown): number | null {
		if (!node || typeof node !== "object") return null;
		if (Array.isArray(node)) {
			for (const child of node) { const found = findHeal(child); if (found !== null) return found; }
			return null;
		}
		const entry = node as Record<string, unknown>;
		if (entry.kind === "i_full_heal") return Number.POSITIVE_INFINITY;
		if (entry.kind === "i_heal") {
			const raw = entry.amount;
			const resolved = typeof raw === "string" && raw.startsWith("$") ? params[raw.slice(1)] : raw;
			return typeof resolved === "number" && resolved > 0 ? resolved : null;
		}
		for (const value of Object.values(entry)) {
			const found = findHeal(value);
			if (found !== null) return found;
		}
		return null;
	}
	return findHeal(ability.effect);
}

/** A legal, equipped heal offered by the UI projection. */
export function healingItemOptions(view: PlayerView): readonly {
	ownerId: string; itemId: string; targetId: string; amount: number; missing: number;
}[] {
	const active = view.heroes.filter((hero) => hero.status === "active");
	return active.flatMap((owner) => (view.abilityActionsByHero[owner.id] ?? []).flatMap((ability) => {
		if (ability.kind !== "item" || ability.activation !== "manual" || ability.status !== "available")
			return [];
		const amount = itemHealingAmount(ability.sourceCardId);
		if (amount === null) return [];
		return (ability.targetRequired ? ability.validTargetIds : [owner.id]).flatMap((targetId) => {
			const target = active.find((hero) => hero.id === targetId);
			if (!target || target.currentLife >= target.maxLife) return [];
			return [{ ownerId: owner.id, itemId: ability.sourceCardId, targetId, amount,
				missing: target.maxLife - target.currentLife }];
		});
	}));
}

export function healingMoveScore(view: PlayerView, targetId: string, amount: number): number {
	const hero = view.heroes.find((entry) => entry.id === targetId && entry.status === "active");
	if (!hero) return -1;
	const missing = hero.maxLife - hero.currentLife;
	if (missing <= 0) return -1;
	const heal = Math.min(missing, amount);
	const threat = Math.max(0, ...view.enemies.filter((enemy) => enemy.status === "active").map((enemy) => enemy.damage));
	const lethal = hero.currentLife <= threat;
	const outsideCombat = !["HERO_ACTION", "BOSS_COMBAT", "ROLL_DICE", "RESOLVE_ATTACK", "DIRECT_DAMAGE"].includes(view.status);
	if (heal < 2 && !lethal) return 25;
	if (lethal && hero.currentLife + heal > threat) return 320 + heal * 5;
	if (lethal || hero.currentLife / hero.maxLife <= 0.35) return 250 + heal * 5;
	if (outsideCombat && (missing >= 3 || missing / hero.maxLife >= 0.3)) return 215 + heal * 5;
	return heal >= 3 ? 170 + heal * 5 : 70;
}
