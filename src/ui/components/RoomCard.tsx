// Card horizontal da sala atual (~200px). Vive dentro do tabuleiro, no topo central.
// Inclui Despertar embutido.

import { getCardName } from "@/core/data/cardLocale";
import type { ColorIndex } from "@/core/state/color";
import type { RoomState } from "@/core/state/roomState";
import { UI } from "@/ui/theme";
import { ColorBar } from "./ColorBar";

interface RoomCardProps {
	room: RoomState | null;
	despertar: ColorIndex;
	onClick?: () => void;
}

export function RoomCard({ room, despertar, onClick }: RoomCardProps) {
	if (!room) {
		return (
			<div
				style={{
					width: 200,
					height: 56,
					background: UI.subpanelBg,
					border: `1px dashed ${UI.border}`,
					borderRadius: 8,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span style={{ color: UI.textTertiary, fontSize: 11 }}>sem sala</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			style={{
				display: "flex",
				alignItems: "stretch",
				gap: 8,
				background: UI.subpanelBg,
				border: `1px solid ${UI.border}`,
				borderRadius: 8,
				padding: "6px 8px",
				width: 200,
				cursor: "pointer",
				textAlign: "left",
			}}
			onClick={onClick}
		>
			{/* Arte mini */}
			<div
				style={{
					width: 32,
					background: UI.border,
					borderRadius: 3,
					flexShrink: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span style={{ fontSize: 14 }}>🚪</span>
			</div>
			{/* Info */}
			<div style={{ flex: 1, minWidth: 0 }}>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: 11,
						fontWeight: 500,
						lineHeight: 1.2,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{getCardName(room.cardId)}
				</p>
				<p style={{ color: UI.textSecondary, fontSize: 10, marginBottom: 3 }}>
					Saídas {room.exits} · XP {room.xp}
				</p>
				<ColorBar current={despertar} />
			</div>
		</button>
	);
}
