// Card mini de criatura/inimigo (~88px). Usado no tabuleiro.
// Aceita drop de herói para iniciar combate.

import type { EnemyState } from "@/core/state/enemyState";
import { UI } from "@/ui/theme";
import { HpBar } from "./HpBar";

interface EnemyCardProps {
	enemy: EnemyState;
	isSelectable: boolean;
	isEngaged: boolean;
	isDragOver?: boolean;
	onDrop?: (enemyId: string) => void;
	onClick: () => void;
}

export function EnemyCard({
	enemy,
	isSelectable,
	isEngaged,
	isDragOver,
	onDrop,
	onClick,
}: EnemyCardProps) {
	let borderColor: string = UI.border;
	let borderWidth = "0.5px";

	if (isDragOver && isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "2px";
	} else if (isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "1.5px";
	}

	const opacity = isEngaged ? 0.55 : 1;

	return (
		<div
			style={{
				width: 88,
				background: UI.subpanelBg,
				border: `${borderWidth} solid ${borderColor}`,
				opacity,
				borderRadius: 8,
				padding: "4px 4px 3px",
				cursor: isSelectable ? "pointer" : "default",
				transition: "border-color 0.1s, border-width 0.1s",
			}}
			onDragOver={(e) => {
				if (isSelectable) {
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
				}
			}}
			onDrop={(e) => {
				e.preventDefault();
				if (isSelectable) onDrop?.(enemy.id);
			}}
			onClick={onClick}
		>
			{/* Arte placeholder */}
			<div
				style={{
					height: 48,
					background: UI.border,
					borderRadius: 3,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					marginBottom: 3,
				}}
			>
				<span style={{ fontSize: 22 }}>👹</span>
			</div>
			{/* Nome */}
			<p
				style={{
					color: UI.textPrimary,
					fontSize: 10,
					fontWeight: 500,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
					lineHeight: 1.2,
				}}
			>
				{enemy.cardName}
			</p>
			{/* Barra de vida */}
			<HpBar current={enemy.currentLife} max={enemy.maxLife} height={3} />
			{/* Stats */}
			<p style={{ color: UI.textTertiary, fontSize: 9, marginTop: 1, lineHeight: 1 }}>
				{enemy.currentLife}/{enemy.maxLife} · +{enemy.hitBonus} · D{enemy.damage}
			</p>
			{isEngaged && (
				<p style={{ color: UI.textTertiary, fontSize: 9, marginTop: 1 }}>engajado</p>
			)}
		</div>
	);
}
