import { translate } from "@/i18n";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CombatRollResult } from "@/core/state/combatState";

interface DiceRollOverlayProps {
	roll: CombatRollResult;
	onResolveAttack: () => void;
}
type Side = "hero" | "enemy";
type Die = {
	side: Side; index: number; finalValue: number; face: number;
	x: number; y: number; vx: number; vy: number; angle: number; spin: number; size: number;
};
const PIPS: Record<number, readonly [number, number][]> = {
	1: [[2, 2]],
	2: [[1, 1], [3, 3]],
	3: [[1, 1], [2, 2], [3, 3]],
	4: [[1, 1], [3, 1], [1, 3], [3, 3]],
	5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
	6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};
const bounds = (node: HTMLElement | null) => ({
	width: node?.getBoundingClientRect().width || 250,
	height: node?.getBoundingClientRect().height || 142,
});
const sizeFor = (width: number, height: number, count: number) =>
	Math.max(26, Math.min(54, width / (Math.max(2, count) + 0.7), height * 0.39));

function makeDice(roll: CombatRollResult, arenas: Record<Side, HTMLElement | null>): Die[] {
	return (["enemy", "hero"] as const).flatMap((side) => {
		const values = side === "hero" ? roll.heroResults : roll.enemyResults;
		const { width, height } = bounds(arenas[side]);
		const size = sizeFor(width, height, values.length);
		return values.map((finalValue, index) => ({
			side, index, finalValue, face: ((finalValue + index) % 6) + 1,
			x: Math.max(0, Math.min(width - size, width * (index + 0.5) / values.length - size / 2)),
			y: Math.max(0, height * (index % 2 ? 0.52 : 0.16)),
			vx: (index % 2 ? -1 : 1) * (125 + index * 37 + (side === "hero" ? 35 : 0)),
			vy: (index % 3 ? -1 : 1) * (105 + index * 29),
			angle: index * 29, spin: (index % 2 ? -1 : 1) * (390 + index * 53), size,
		}));
	});
}

function collide(dice: Die[]) {
	for (let i = 0; i < dice.length; i++) for (let j = i + 1; j < dice.length; j++) {
		const a = dice[i], b = dice[j];
		if (a.side !== b.side) continue;
		const dx = b.x - a.x, dy = b.y - a.y;
		const distance = Math.hypot(dx, dy) || 0.001;
		const minimum = (a.size + b.size) * 0.48;
		if (distance >= minimum) continue;
		const nx = dx / distance, ny = dy / distance;
		const overlap = (minimum - distance) / 2;
		a.x -= nx * overlap; a.y -= ny * overlap;
		b.x += nx * overlap; b.y += ny * overlap;
		const relative = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
		if (relative > 0) {
			const impulse = relative * 0.68;
			a.vx -= impulse * nx; a.vy -= impulse * ny;
			b.vx += impulse * nx; b.vy += impulse * ny;
		}
	}
}

export function DiceRollOverlay({ roll, onResolveAttack }: DiceRollOverlayProps) {
	const enemyArena = useRef<HTMLDivElement>(null);
	const heroArena = useRef<HTMLDivElement>(null);
	const [dice, setDice] = useState<Die[]>([]);
	const [canResolve, setCanResolve] = useState(false);
	const [reducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

	useEffect(() => {
		const arenas = { enemy: enemyArena.current, hero: heroArena.current };
		const bodies = makeDice(roll, arenas);
		let frame = 0, previous = 0, elapsed = 0, quietFrames = 0, disposed = false;
		const publish = () => setDice(bodies.map((die) => ({ ...die })));
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
			for (const die of bodies) {
				const { width, height } = bounds(arenas[die.side]);
				die.size = sizeFor(width, height, die.side === "hero" ? roll.heroResults.length : roll.enemyResults.length);
				die.x = Math.max(0, Math.min(width - die.size, die.x));
				die.y = Math.max(0, Math.min(height - die.size, die.y));
			}
			publish();
		});
		if (arenas.enemy) observer?.observe(arenas.enemy);
		if (arenas.hero) observer?.observe(arenas.hero);
		setCanResolve(false);
		if (reducedMotion || bodies.length === 0) {
			for (const die of bodies) die.face = die.finalValue;
			publish(); setCanResolve(true);
			return () => { disposed = true; observer?.disconnect(); };
		}
		publish();
		function step(time: number) {
			if (disposed) return;
			const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 1 / 60;
			previous = time; elapsed += dt;
			for (const die of bodies) {
				const { width, height } = bounds(arenas[die.side]);
				die.x += die.vx * dt; die.y += die.vy * dt; die.angle += die.spin * dt;
				if (die.x < 0 || die.x > width - die.size) {
					die.x = Math.max(0, Math.min(width - die.size, die.x)); die.vx *= -0.62;
				}
				if (die.y < 0 || die.y > height - die.size) {
					die.y = Math.max(0, Math.min(height - die.size, die.y)); die.vy *= -0.62;
				}
				const drag = Math.pow(0.972, dt * 60);
				die.vx *= drag; die.vy *= drag; die.spin *= Math.pow(0.958, dt * 60);
				die.face = ((Math.floor(Math.abs(die.angle) / 48) + die.index) % 6) + 1;
			}
			collide(bodies);
			if (elapsed > 0.7 && bodies.every((die) => Math.hypot(die.vx, die.vy) < 9 && Math.abs(die.spin) < 14)) quietFrames++;
			else quietFrames = 0;
			if (quietFrames >= 8) {
				for (const die of bodies) { die.face = die.finalValue; die.angle = Math.round(die.angle / 360) * 360; }
				publish(); setCanResolve(true); return;
			}
			publish(); frame = requestAnimationFrame(step);
		}
		frame = requestAnimationFrame(step);
		return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); };
	}, [roll, reducedMotion]);

	return createPortal(<div className="game-dice-roll-layer">
		<div className="game-dice-roll-modal" data-tutorial-anchor="combat.dice" role="dialog" aria-label={translate("game:components.diceRollOverlay.ariaLabel001")}>
			<div className="game-dice-roll-modal__body">
				<Cluster side="enemy" label={translate("game:components.diceRollOverlay.enemyLabel")} results={roll.enemyResults} total={roll.enemyTotal} dice={dice} arenaRef={enemyArena} canResolve={canResolve} />
				<div className="game-dice-roll-versus">{translate("game:components.diceRollOverlay.text002")}</div>
				<Cluster side="hero" label={translate("game:components.diceRollOverlay.heroLabel")} results={roll.heroResults} total={roll.heroTotal} dice={dice} arenaRef={heroArena} canResolve={canResolve} />
			</div>
			<button type="button" className="game-dice-roll-action" onClick={onResolveAttack} disabled={!canResolve} aria-label={translate("game:components.diceRollOverlay.ariaLabel003")}>
				{canResolve ? translate("game:components.diceRollOverlay.dynamic001") : translate("game:components.diceRollOverlay.rolling")}
			</button>
		</div>
	</div>, document.body);
}

function Cluster({ side, label, results, total, dice, arenaRef, canResolve }: {
	side: Side; label: string; results: readonly number[]; total: number;
	dice: readonly Die[]; arenaRef: React.RefObject<HTMLDivElement | null>; canResolve: boolean;
}) {
	return <div className={`game-dice-roll-cluster game-dice-roll-cluster--${side}`}>
		<div className="game-dice-roll-label">{label}</div>
		<div className="game-dice-roll-arena" ref={arenaRef} data-testid={`${side}-arena`}>
			{dice.filter((die) => die.side === side).map((die) => <Face key={die.index} die={die} />)}
		</div>
		{canResolve && <div className="game-dice-roll-total" data-testid={`${side}-total`}>{total}</div>}
		{results.length === 0 && <span className="game-dice-roll-empty" aria-hidden="true" />}
	</div>;
}

function Face({ die }: { die: Die }) {
	const style = { width: die.size, height: die.size, transform: `translate3d(${die.x}px, ${die.y}px, 0) rotate(${die.angle}deg)` } as CSSProperties;
	return <div className="game-dice-roll-die" data-testid={`${die.side}-die-${die.index}`} data-face={die.face} style={style}>
		{(PIPS[die.face] ?? PIPS[6]).map(([column, row], index) => <span key={index} className="game-dice-roll-pip" style={{ gridColumn: column, gridRow: row }} />)}
	</div>;
}
