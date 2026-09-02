// Card mini de herói (~64px). Usado no tabuleiro.
// Suporta drag-and-drop nativo HTML5 para iniciar combate.

import type { DragEvent } from "react";
import { getCardName } from "@/core/data/cardLocale";
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
	size?: "compact" | "board";
	imageUrl?: string;
	onDragStart?: (heroId: string, event: DragEvent<HTMLButtonElement>) => void;
	onDragEnd?: () => void;
	onClick: () => void;
}

const SLOTS = ["weapon", "armor", "utility", "special"] as const;

export function HeroCard({
	hero,
	isFocused,
	hasActed,
	isSelected,
	canAct,
	size = "compact",
	imageUrl,
	onDragStart,
	onDragEnd,
	onClick,
}: HeroCardProps) {
	const isDefeated = hero.status === "defeated";
	const hasFled = hero.status === "fled";
	const isActive = hero.status === "active";
	const isRoundDisabled = isActive && hasActed;
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
			: isRoundDisabled
				? 0.42
			: isCritical
				? 0.55
				: 1;

	const heroName = getCardName(hero.cardId);
	const firstName = heroName.split(",")[0]?.split(" ")[0] ?? heroName;
	const shortName =
		firstName.length > 7 ? `${firstName.slice(0, 7)}` : firstName;
	const card =
		size === "board"
			? {
					width: 124,
					height: 172,
					artHeight: 68,
					radius: 10,
					padding: "10px",
					nameFont: 12,
					statFont: 10,
					iconFont: 32,
					hpHeight: 5,
					equipmentInside: true,
				}
			: {
					width: 64,
					height: undefined,
					artHeight: 36,
					radius: 8,
					padding: "4px 4px 3px",
					nameFont: 10,
					statFont: 9,
					iconFont: 18,
					hpHeight: 3,
					equipmentInside: false,
				};
	const displayName = size === "board" ? heroName : shortName;
	const useCardImage = size === "board" && !!imageUrl;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				width: card.width,
			}}
		>
			<button
				type="button"
				draggable={isActive && canAct}
				aria-disabled={isRoundDisabled}
				className={canAct ? "click-attention" : undefined}
				onDragStart={(e) => {
					if (!isActive || !canAct) {
						e.preventDefault();
						return;
					}
					e.dataTransfer.effectAllowed = "move";
					e.dataTransfer.setData("heroId", hero.id);
					const dragImage = new Image();
					dragImage.src =
						"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
					e.dataTransfer.setDragImage(dragImage, 0, 0);
					onDragStart?.(hero.id, e);
				}}
				onDragEnd={onDragEnd}
				style={{
					width: card.width,
					height: card.height,
					background: useCardImage
						? `linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.06) 48%, rgba(246, 240, 229, 0.68) 74%, rgba(238, 232, 219, 0.9)), url("${imageUrl}")`
						: size === "board"
							? "linear-gradient(160deg, rgba(241, 239, 232, 0.96), rgba(225, 219, 207, 0.94))"
							: UI.subpanelBg,
					backgroundPosition: "center",
					backgroundRepeat: "no-repeat",
					backgroundSize: useCardImage ? "100% 100%" : "cover",
					backgroundOrigin: "border-box",
					backgroundClip: "border-box",
					border: `${borderWidth} solid ${borderColor}`,
					opacity,
					cursor: isRoundDisabled
						? "not-allowed"
						: isActive
							? canAct
								? "grab"
								: "pointer"
							: "default",
					filter: isRoundDisabled ? "grayscale(0.88) saturate(0.22)" : undefined,
					borderRadius: card.radius,
					padding: card.padding,
					textAlign: "left",
					display: "flex",
					flexDirection: "column",
					justifyContent: useCardImage ? "flex-end" : undefined,
					overflow: "hidden",
					boxShadow:
						size === "board"
							? "0 7px 10px rgba(0, 0, 0, 0.34), 0 1px 2px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255,255,255,0.28)"
							: undefined,
				}}
				onClick={() => {
					if (!isRoundDisabled) onClick();
				}}
			>
				{/* Arte placeholder */}
				{!useCardImage && (
					<div
						style={{
							height: card.artHeight,
							background: size === "board" ? "rgba(0, 0, 0, 0.16)" : UI.border,
							borderRadius: size === "board" ? 7 : 3,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							marginBottom: size === "board" ? 8 : 3,
							flexShrink: 0,
						}}
					>
						<span style={{ fontSize: card.iconFont }}>🧙</span>
					</div>
				)}
				<div
					style={{
						background: useCardImage ? "rgba(246, 240, 229, 0.82)" : undefined,
						borderRadius: useCardImage ? 7 : undefined,
						padding: useCardImage ? "6px" : undefined,
					}}
				>
					{/* Nome curto */}
					<p
						style={{
							color: isDefeated ? UI.textTertiary : UI.textPrimary,
							fontSize: card.nameFont,
							fontWeight: size === "board" ? 700 : 500,
							overflow: "hidden",
							textOverflow: size === "board" ? undefined : "ellipsis",
							whiteSpace: size === "board" ? undefined : "nowrap",
							display: size === "board" ? "-webkit-box" : undefined,
							WebkitBoxOrient: size === "board" ? "vertical" : undefined,
							WebkitLineClamp: size === "board" ? 2 : undefined,
							lineHeight: size === "board" ? 1.12 : 1.2,
							marginBottom: size === "board" ? 7 : undefined,
						}}
					>
						{displayName}
					</p>
					{/* Barra de vida */}
					<HpBar
						current={hero.currentLife}
						max={hero.maxLife}
						height={card.hpHeight}
					/>
					{/* Vida numérica */}
					<p
						style={{
							color: UI.textTertiary,
							fontSize: card.statFont,
							marginTop: size === "board" ? 5 : 1,
							lineHeight: 1,
						}}
					>
						{hero.currentLife}/{hero.maxLife}
					</p>
					{card.equipmentInside && (
						<div
							style={{
								display: "flex",
								gap: 3,
								marginTop: "auto",
								justifyContent: "center",
								paddingTop: 8,
							}}
						>
							{SLOTS.map((slot) => (
								<ItemTile
									key={slot}
									slot={slot}
									filled={!!hero.activeItems[slot]}
									item={hero.activeItems[slot]}
								/>
							))}
						</div>
					)}
				</div>
			</button>
			{/* Mini-tiles de equipamento */}
			{!card.equipmentInside && (
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
			)}
		</div>
	);
}
