import { type CSSProperties, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { sfxPlayer } from "@/ui/audio/sfxPlayer";

export interface CardAttackActor {
	name: string;
	imageUrl?: string;
}

export interface CardAttackRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface CardAttackAnimationProps {
	attacker: CardAttackActor;
	sourceRect: CardAttackRect;
	targetRect: CardAttackRect;
	onFinish?: () => void;
	onImpact?: () => void;
}

/**
 * Primitivo visual para ataques entre quaisquer cartas.
 *
 * O chamador fornece as posições já renderizadas de atacante e alvo. A regra de
 * combate continua independente: este componente apenas encena a investida,
 * impacto e retorno da carta atacante.
 */
export function CardAttackAnimation({
	attacker,
	sourceRect,
	targetRect,
	onFinish,
	onImpact,
}: CardAttackAnimationProps) {
	const impactCallback = useRef(onImpact);
	const finishCallback = useRef(onFinish);
	const finished = useRef(false);
	impactCallback.current = onImpact;
	finishCallback.current = onFinish;
	useEffect(() => {
		sfxPlayer.play("attack_whoosh");
		const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		if (reducedMotion) {
			impactCallback.current?.();
		}
		const impactTimer = reducedMotion ? null : window.setTimeout(() => impactCallback.current?.(), 640 * 0.48);
		const finishTimer = window.setTimeout(() => {
			if (finished.current) return;
			finished.current = true;
			finishCallback.current?.();
		}, reducedMotion ? 1 : 640);
		return () => {
			if (impactTimer !== null) window.clearTimeout(impactTimer);
			window.clearTimeout(finishTimer);
		};
	}, []);
	const sourceCenterX = sourceRect.left + sourceRect.width / 2;
	const sourceCenterY = sourceRect.top + sourceRect.height / 2;
	const targetCenterX = targetRect.left + targetRect.width / 2;
	const targetCenterY = targetRect.top + targetRect.height / 2;
	const travelX = (targetCenterX - sourceCenterX) * 0.82;
	const travelY = (targetCenterY - sourceCenterY) * 0.82;

	return createPortal(
		<div className="card-attack-animation" aria-hidden="true">
			<div
				className="card-attack-animation__impact"
				style={{ left: targetCenterX, top: targetCenterY }}
			/>
			<div
				className="card-attack-animation__card"
				style={
					{
						left: sourceRect.left,
						top: sourceRect.top,
						width: sourceRect.width,
						height: sourceRect.height,
						"--attack-travel-x": `${travelX}px`,
						"--attack-travel-y": `${travelY}px`,
						backgroundImage: attacker.imageUrl
							? `linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(8, 9, 13, 0.2)), url("${attacker.imageUrl}")`
							: undefined,
					} as CSSProperties
				}
				onAnimationEnd={() => {
					if (finished.current) return;
					finished.current = true;
					finishCallback.current?.();
				}}
			>
				{attacker.imageUrl ? null : (
					<span className="card-attack-animation__fallback">{attacker.name}</span>
				)}
			</div>
		</div>,
		document.body,
	);
}
