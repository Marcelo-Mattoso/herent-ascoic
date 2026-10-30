import { useLayoutEffect, useRef, useState } from "react";
import type { PlayerView } from "@/core/projection/playerView";
import { displayCardName } from "@/i18n/catalogs";
import { getCardImageUrl, type CardImageUrls } from "@/ui/cardImages";
import { CardAttackAnimation } from "./CardAttackAnimation";

type DamageEvent = PlayerView["damageFeedback"][number];
type ExtraAttack = PlayerView["extraAttackFeedback"][number];
type VisualAttack = ExtraAttack & { readonly sourceRect: DOMRect; readonly targetRect: DOMRect };

// A posição sobrevive à remoção da carta e à troca imediata de tela após uma morte.
const targetRects = new Map<string, DOMRect>();
const targetNodes = new Map<string, HTMLElement>();
export function rememberCombatTarget(id: string, node: HTMLElement) {
	targetNodes.set(id, node);
	targetRects.set(id, node.getBoundingClientRect());
}

function targetRect(id: string): DOMRect | undefined {
	const node = targetNodes.get(id);
	return node?.isConnected ? node.getBoundingClientRect() : targetRects.get(id);
}

function showDamage(event: DamageEvent) {
	const rect = targetRect(event.targetId);
	if (!rect) return;
	const layer = document.createElement("div");
	layer.className = "game-damage-layer";
	layer.setAttribute("aria-hidden", "true");
	const number = document.createElement("span");
	number.className = `game-damage-number game-damage-number--${event.side}${event.amount > 8 ? " game-damage-number--heavy" : ""}`;
	number.textContent = `-${event.amount}`;
	number.style.left = `${rect.left + rect.width / 2}px`;
	number.style.top = `${rect.top + rect.height * 0.36}px`;
	layer.appendChild(number);
	document.body.appendChild(layer);
	window.setTimeout(() => layer.remove(), 900);
	if (event.amount > 8 && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
		const board = document.querySelector(".game-board-content");
		if (board instanceof HTMLElement) {
			board.classList.remove("game-board-content--shaking");
			void board.offsetWidth;
			board.classList.add("game-board-content--shaking");
		}
	}
}

export function CombatFeedback({ view, cardImageUrls }: { view: PlayerView; cardImageUrls?: CardImageUrls }) {
	const lastDamageId = useRef(view.damageFeedback.at(-1)?.id ?? 0);
	const lastAttackId = useRef(view.extraAttackFeedback.at(-1)?.id ?? 0);
	const pendingDamage = useRef(new Map<number, DamageEvent[]>());
	const [attacks, setAttacks] = useState<VisualAttack[]>([]);

	useLayoutEffect(() => {
		const latestDamage = view.damageFeedback.at(-1)?.id ?? 0;
		const latestAttack = view.extraAttackFeedback.at(-1)?.id ?? 0;
		if (latestDamage < lastDamageId.current) lastDamageId.current = 0;
		if (latestAttack < lastAttackId.current) {
			lastAttackId.current = 0;
			pendingDamage.current.clear();
			setAttacks([]);
		}
		for (const event of view.damageFeedback) {
			if (event.id <= lastDamageId.current) continue;
			if (event.extraAttackId === undefined) showDamage(event);
			else {
				const existing = pendingDamage.current.get(event.extraAttackId) ?? [];
				pendingDamage.current.set(event.extraAttackId, [...existing, event]);
			}
		}
		const newAttacks: VisualAttack[] = [];
		for (const attack of view.extraAttackFeedback) {
			if (attack.id <= lastAttackId.current) continue;
			const sourceRect = targetRect(attack.enemyId);
			const destinationRect = targetRect(attack.heroId);
			if (sourceRect && destinationRect) {
				newAttacks.push({ ...attack, sourceRect, targetRect: destinationRect });
			} else {
				for (const damage of pendingDamage.current.get(attack.id) ?? []) showDamage(damage);
				pendingDamage.current.delete(attack.id);
			}
		}
		if (newAttacks.length) setAttacks((current) => [...current, ...newAttacks]);
		lastDamageId.current = latestDamage;
		lastAttackId.current = latestAttack;
	}, [view.damageFeedback, view.extraAttackFeedback]);

	function finishImpact(id: number) {
		for (const damage of pendingDamage.current.get(id) ?? []) showDamage(damage);
		pendingDamage.current.delete(id);
	}

	const attack = attacks[0];
	return attack ? (
		<CardAttackAnimation
			key={attack.id}
			attacker={{
				name: displayCardName(attack.enemyCardId),
				imageUrl: getCardImageUrl(cardImageUrls, attack.enemyCardId),
			}}
			sourceRect={attack.sourceRect}
			targetRect={attack.targetRect}
			onImpact={() => finishImpact(attack.id)}
			onFinish={() => {
				finishImpact(attack.id);
				setAttacks((current) => current.slice(1));
			}}
		/>
	) : null;
}
