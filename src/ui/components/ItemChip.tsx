import { getCardName } from "@/core/data/cardLocale";
import type { ItemSlotType } from "@/core/state/heroState";
import { UI } from "@/ui/theme";
import { ItemTile } from "./ItemTile";

interface ItemChipProps {
	item: string;
	slot?: ItemSlotType;
	onClick?: () => void;
}

const SLOT_LABELS: Record<ItemSlotType, string> = {
	clothing1: "vestimenta",
	clothing2: "vestimenta",
	hand1: "mão",
	hand2: "mão",
	amulet: "amuleto",
};

export function ItemChip({ item, slot, onClick }: ItemChipProps) {
	const label = getCardName(item);
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
