import { translate } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CombatRollResult, PendingPhysicalRoll } from "@/core/state/combatState";
import { DiceRollOverlay as LegacyDiceRollOverlay } from "./LegacyDiceRollOverlay";

type Confirm = (payload: {
	rollId: string; heroId: string; enemyId: string;
	heroResults: number[]; enemyResults: number[];
	source: "physics" | "fallback";
}) => void;

interface Props {
	roll: CombatRollResult | null;
	pending?: PendingPhysicalRoll;
	onConfirm?: Confirm;
	onResolveAttack: () => void;
}

export function DiceRollOverlay({ roll, pending, onConfirm, onResolveAttack }: Props) {
	if (pending || roll?.physicalRollId) {
		return <PhysicalDiceRollOverlay roll={roll} pending={pending} onConfirm={onConfirm} onResolveAttack={onResolveAttack} />;
	}
	return roll ? <LegacyDiceRollOverlay roll={roll} onResolveAttack={onResolveAttack} /> : null;
}

function PhysicalDiceRollOverlay({ roll, pending, onConfirm, onResolveAttack }: Props) {
	const initialPending = useRef(pending);
	const confirmRef = useRef(onConfirm);
	confirmRef.current = onConfirm;
	const heroArena = useRef<HTMLDivElement>(null);
	const enemyArena = useRef<HTMLDivElement>(null);
	const [complete, setComplete] = useState(!!roll);
	const [fallback, setFallback] = useState(false);
	useEffect(() => {
		const request = initialPending.current;
		if (!request || !confirmRef.current) return;
		let disposed = false;
		let completed = false;
		const cleanups: (() => void)[] = [];
		const results: { hero?: number[] | null; enemy?: number[] | null } = {};
		const confirm = (source: "physics" | "fallback") => {
			if (disposed || completed) return;
			completed = true;
			if (source === "fallback") setFallback(true);
			setComplete(true);
			confirmRef.current?.({
				rollId: request.id, heroId: request.heroId, enemyId: request.enemyId,
				heroResults: source === "physics" ? results.hero! : [...request.fallbackHeroResults],
				enemyResults: source === "physics" ? results.enemy! : [...request.fallbackEnemyResults],
				source,
			});
		};
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
			confirm("fallback");
			return () => { disposed = true; };
		}
		import("@/ui/dice/physicalRoll").then(async (module) => {
			if (disposed || !heroArena.current || !enemyArena.current) return;
			const start = async (side: "hero" | "enemy", count: number, element: HTMLElement) => {
				const stop = await module.startPhysicalArena({ side, count, element }, (value) => {
					results[side] = value;
					if ("hero" in results && "enemy" in results) {
						confirm(results.hero && results.enemy ? "physics" : "fallback");
					}
				});
				if (disposed) stop(); else cleanups.push(stop);
			};
			await Promise.all([
				start("hero", request.heroDiceCount, heroArena.current),
				start("enemy", request.enemyDiceCount, enemyArena.current),
			]);
		}).catch(() => confirm("fallback"));
		return () => { disposed = true; cleanups.forEach((cleanup) => { cleanup(); }); };
	}, []);
	const shownRoll = roll;
	return createPortal(<div className="game-dice-roll-layer">
		<div className="game-dice-roll-modal game-dice-roll-modal--physical" data-tutorial-anchor="combat.dice" role="dialog" aria-label={translate("game:components.diceRollOverlay.ariaLabel001")}>
			<div className="game-dice-roll-modal__body">
				<div className="game-dice-roll-cluster game-dice-roll-cluster--hero">
					<div className="game-dice-roll-label">{translate("game:components.diceRollOverlay.heroLabel")}</div>
					<div className="game-dice-roll-arena game-dice-roll-arena--3d" ref={heroArena} data-testid="hero-arena" />
					{complete && shownRoll && <div className="game-dice-roll-total" data-testid="hero-total">{shownRoll.heroTotal}</div>}
				</div>
				<div className="game-dice-roll-versus">{translate("game:components.diceRollOverlay.text002")}</div>
				<div className="game-dice-roll-cluster game-dice-roll-cluster--enemy">
					<div className="game-dice-roll-label">{translate("game:components.diceRollOverlay.enemyLabel")}</div>
					<div className="game-dice-roll-arena game-dice-roll-arena--3d" ref={enemyArena} data-testid="enemy-arena" />
					{complete && shownRoll && <div className="game-dice-roll-total" data-testid="enemy-total">{shownRoll.enemyTotal}</div>}
				</div>
			</div>
			{fallback && <div className="game-dice-roll-fallback">{translate("game:components.diceRollOverlay.fallback")}</div>}
			<button type="button" className="game-dice-roll-action" onClick={onResolveAttack} disabled={!complete || !shownRoll} aria-label={translate("game:components.diceRollOverlay.ariaLabel003")}>
				{complete && shownRoll ? translate("game:components.diceRollOverlay.dynamic001") : translate("game:components.diceRollOverlay.rolling")}
			</button>
		</div>
	</div>, document.body);
}
