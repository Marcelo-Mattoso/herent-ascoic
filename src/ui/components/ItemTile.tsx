import type { ItemSlotType } from "@/core/state/heroState";

interface ItemTileProps {
	slot: ItemSlotType;
	filled: boolean;
	item?: string;
}

const SLOT_COLORS: Record<ItemSlotType, { bg: string; border: string }> = {
	weapon: { bg: "#FAC775", border: "#BA7517" },
	armor: { bg: "#B5D4F4", border: "#185FA5" },
	utility: { bg: "#C0DD97", border: "#3B6D11" },
	special: { bg: "#ED93B1", border: "#8B1A4A" },
};

export function ItemTile({ slot, filled, item }: ItemTileProps) {
	const colors = SLOT_COLORS[slot];
	return (
		<div
			title={item ?? ""}
			style={{
				width: 12,
				height: 16,
				borderRadius: 2,
				background: filled ? colors.bg : "#F1EFE8",
				border: `1px ${filled ? "solid" : "dashed"} ${filled ? colors.border : "rgba(0,0,0,0.2)"}`,
				flexShrink: 0,
			}}
		/>
	);
}
