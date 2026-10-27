import { translate } from "@/i18n";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

export function DungeonExhaustedModal() {
	const { view, dispatch } = useGameStore();
	const canPay =
		view.groupXp >= 5 && view.decks.dungeonDeck.discarded.length > 0;

	function payXp() {
		dispatch({ type: "SPEND_XP", payload: { option: "recover_dungeon" } });
	}

	function acceptDefeat() {
		dispatch({ type: "DEFEAT", payload: { reason: "deck_exhausted" } });
	}

	return (
		<Modal title={translate("game:components.modals.dungeonExhaustedModal.title001")} maxWidth={440}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				{translate("game:components.modals.dungeonExhaustedModal.text002")}{" "}<strong style={{ color: UI.textPrimary }}>{translate("game:components.modals.dungeonExhaustedModal.text003")}</strong>{" "}
				{translate("game:components.modals.dungeonExhaustedModal.text004")}{" "}</p>

			<p className="text-xs mb-5" style={{ color: UI.textTertiary }}>
				{translate("game:components.modals.dungeonExhaustedModal.text005")}{" "}{view.groupXp} {translate("game:components.modals.dungeonExhaustedModal.text006")}{" "}
				{view.decks.dungeonDeck.discarded.length}
			</p>

			<div className="flex gap-3">
				<ActionButton
					label="Gastar 5 XP"
					variant="primary"
					disabled={!canPay}
					onClick={payXp}
				/>
				<ActionButton
					label="Aceitar derrota"
					variant="danger"
					onClick={acceptDefeat}
				/>
			</div>
		</Modal>
	);
}
