import { useLayoutEffect, useRef } from "react";
import type { PlayerView } from "@/core/projection/playerView";

// A posição sobrevive à remoção da carta e à troca imediata de tela após uma morte.
const targetRects = new Map<string, DOMRect>();
const targetNodes = new Map<string, HTMLElement>();
export function rememberCombatTarget(id: string, node: HTMLElement) {
	targetNodes.set(id, node);
	targetRects.set(id, node.getBoundingClientRect());
}

export function CombatFeedback({ view }: { view: PlayerView }) {
	const lastId = useRef(view.damageFeedback.at(-1)?.id ?? 0);
	useLayoutEffect(() => {
		const latest = view.damageFeedback.at(-1)?.id ?? 0;
		if (latest < lastId.current) lastId.current = 0;
		for (const event of view.damageFeedback) {
			if (event.id <= lastId.current) continue;
			const node = targetNodes.get(event.targetId);
			const rect = node?.isConnected ? node.getBoundingClientRect() : targetRects.get(event.targetId);
			if (!rect) continue;
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
		lastId.current = latest;
	}, [view.damageFeedback]);
	return null;
}
