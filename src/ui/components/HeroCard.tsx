// Card mini de herói (~64px). Usado no tabuleiro.
// Suporta drag-and-drop nativo HTML5 para iniciar combate.

import type { HeroState } from "@/core/state/heroState";
import { UI } from "@/ui/theme";
import { HpBar } from "./HpBar";
import { ItemTile } from "./ItemTile";

interface HeroCardProps {
	hero: HeroState;
	isFocused: boolean;
	hasActed: boolean;
	isSelected: boolean;
	canAct: boolean;
	onDragStart?: (heroId: string) => void;
	onClick: () => void;
}

const SLOTS = ["weapon", "armor", "utility", "special"] as const;

export function HeroCard({
	hero,
	isFocused,
	hasActed,
	isSelected,
	canAct,
	onDragStart,
	onClick,
}: HeroCardProps) {
	const isDefeated = hero.status === "defeated";
	const hasFled = hero.status === "fled";
	const isActive = hero.status === "active";
	const isCritical =
		hero.maxLife > 0 && hero.currentLife / hero.maxLife <= 0.25;

	let borderColor: string = UI.border;
	let borderWidth = "0.5px";

	if (isSelected || isFocused) {
		borderColor = UI.info.text;
		borderWidth = "1.5px";
	}

	const opacity =
		isDefeated || hasFled
			? 0.45
			: isCritical
				? 0.55
				: hasActed && !isFocused
					? 0.65
					: 1;

	const firstName = hero.cardName.split(",")[0]?.split(" ")[0] ?? hero.cardName;
	const shortName =
		firstName.length > 7 ? `${firstName.slice(0, 7)}` : firstName;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				width: 64,
			}}
		>
			<button
				type="button"
				draggable={isActive}
				className={canAct ? "click-attention" : undefined}
				onDragStart={(e) => {
					if (!isActive || !canAct) {
						e.preventDefault();
						return;
					}
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("heroId", hero.id);
					onDragStart?.(hero.id);
				}}
				style={{
					width: 64,
					background: UI.subpanelBg,
					border: `${borderWidth} solid ${borderColor}`,
					opacity,
					cursor: isActive ? (canAct ? "grab" : "pointer") : "default",
					borderRadius: 8,
					padding: "4px 4px 3px",
					textAlign: "left",
				}}
				onClick={onClick}
			>
				{/* Arte placeholder */}
				<div
					style={{
						height: 36,
						background: UI.border,
						borderRadius: 3,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						marginBottom: 3,
					}}
				>
					<span style={{ fontSize: 18 }}>🧙</span>
				</div>
				{/* Nome curto */}
				<p
					style={{
						color: isDefeated ? UI.textTertiary : UI.textPrimary,
						fontSize: 10,
						fontWeight: 500,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
						lineHeight: 1.2,
					}}
				>
					{shortName}
				</p>
				{/* Barra de vida */}
				<HpBar current={hero.currentLife} max={hero.maxLife} height={3} />
				{/* Vida numérica */}
				<p
					style={{
						color: UI.textTertiary,
						fontSize: 9,
						marginTop: 1,
						lineHeight: 1,
					}}
				>
					{hero.currentLife}/{hero.maxLife}
				</p>
			</button>
			{/* Mini-tiles de equipamento */}
			<div style={{ display: "flex", gap: 2, marginTop: 3 }}>
				{SLOTS.map((slot) => (
					<ItemTile
						key={slot}
						slot={slot}
						filled={!!hero.activeItems[slot]}
						item={hero.activeItems[slot]}
					/>
				))}
			</div>
		</div>
	);
}
