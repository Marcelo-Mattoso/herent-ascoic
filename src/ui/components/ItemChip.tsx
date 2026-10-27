import { translate } from "@/i18n";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import type { ItemSlotType } from "@/core/state/heroState";
import { UI } from "@/ui/theme";
import { ItemTile } from "./ItemTile";

interface ItemChipProps {
	item: string;
	slot?: ItemSlotType;
	onClick?: () => void;
}

const SLOT_LABELS: Record<ItemSlotType, string> = {
	clothing1: "game:components.itemChip.slotLabels.clothing1",
	clothing2: "game:components.itemChip.slotLabels.clothing2",
	hand1: "game:components.itemChip.slotLabels.hand1",
	hand2: "game:components.itemChip.slotLabels.hand2",
	amulet: "game:components.itemChip.slotLabels.amulet",
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
					({translate(SLOT_LABELS[slot])})
				</span>
			)}
		</button>
	);
}
