import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { translate } from "@/i18n";

export function SingleDieRerollOverlay({ side, onComplete }: {
	side: "hero" | "enemy"; onComplete: (value?: number) => void;
}) {
	const arena = useRef<HTMLDivElement>(null);
	const completeRef = useRef(onComplete);
	completeRef.current = onComplete;
	useEffect(() => {
		let disposed = false;
		let finished = false;
		let cleanup: (() => void) | undefined;
		const finish = (value?: number) => {
			if (disposed || finished) return;
			finished = true;
			completeRef.current(value);
		};
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
			finish();
			return () => { disposed = true; };
		}
		import("@/ui/dice/physicalRoll").then(async (module) => {
			if (disposed || !arena.current) return;
			const stop = await module.startPhysicalArena({ side, count: 1, element: arena.current },
				(results) => finish(results?.[0]));
			if (disposed) stop(); else cleanup = stop;
		}).catch(() => finish());
		return () => { disposed = true; cleanup?.(); };
	}, [side]);
	return createPortal(<div className="game-dice-roll-layer game-dice-roll-layer--reroll">
		<div className="game-dice-roll-modal" role="dialog" aria-label={translate("game:components.diceRollOverlay.reroll")}>
			<div className="game-dice-roll-label">{translate("game:components.diceRollOverlay.reroll")}</div>
			<div ref={arena} className="game-dice-roll-arena game-dice-roll-arena--3d game-dice-roll-reroll-arena" />
		</div>
	</div>, document.body);
}
