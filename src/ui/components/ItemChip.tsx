import { getCardById } from "@/core/data/cards";
import type { ItemSlotType } from "@/core/state/heroState";
import { UI } from "@/ui/theme";
import { ItemTile } from "./ItemTile";

interface ItemChipProps {
	item: string;
	slot?: ItemSlotType;
	onClick?: () => void;
}

const SLOT_LABELS: Record<ItemSlotType, string> = {
	weapon: "equipável",
	armor: "consumível",
	utility: "utilitário",
	special: "especial",
};

export function ItemChip({ item, slot, onClick }: ItemChipProps) {
	const label = getCardById(item)?.name ?? item;
	return (
		<button
			type="button"
			title={label}
			className="flex items-center gap-1 px-1.5 py-0.5 rounded"
			style={{
				background: UI.subpanelBg,
				border: `1px solid ${UI.border}`,
			}}
			onClick={onClick}
		>
			{slot && <ItemTile slot={slot} filled />}
			<span style={{ color: UI.textPrimary, fontSize: 11 }}>{label}</span>
			{slot && (
				<span style={{ color: UI.textTertiary, fontSize: 10 }}>
					({SLOT_LABELS[slot]})
				</span>
			)}
		</button>
	);
}
