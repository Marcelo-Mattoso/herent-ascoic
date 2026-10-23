import { useEffect, useState } from "react";

export type GameLayoutMode =
	| "desktop"
	| "compact-landscape"
	| "portrait-mobile";

interface GameViewportGeometry {
	mode: GameLayoutMode;
	cardWidth: number;
}

const CARD_RATIO = 172 / 124;

function measureViewport(): GameViewportGeometry {
	const width = Math.min(
		window.innerWidth,
		window.visualViewport?.width ?? window.innerWidth,
	);
	const height = Math.min(
		window.innerHeight,
		window.visualViewport?.height ?? window.innerHeight,
	);
	const mode: GameLayoutMode =
		width > 1200 && height > 500
			? "desktop"
			: height > width
				? "portrait-mobile"
				: "compact-landscape";
	if (mode === "desktop") return { mode, cardWidth: 124 };

	// Five encounter slots and two card rows must fit together with the action
	// line and portable HUD. The boss shares the encounter row with artifacts.
	const horizontal = (width - 28 - 4 * 5) / 5;
	const vertical = (height - 104) / (2 * CARD_RATIO);
	const cardWidth = Math.max(38, Math.min(124, horizontal, vertical));
	return { mode, cardWidth };
}

export function useGameViewport(): GameViewportGeometry {
	const [geometry, setGeometry] = useState(measureViewport);
	useEffect(() => {
		const update = () => {
			const next = measureViewport();
			setGeometry((current) =>
				current.mode === next.mode &&
				Math.abs(current.cardWidth - next.cardWidth) < 0.1
					? current
					: next,
			);
		};
		window.addEventListener("resize", update);
		window.visualViewport?.addEventListener("resize", update);
		return () => {
			window.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("resize", update);
		};
	}, []);
	return geometry;
}
