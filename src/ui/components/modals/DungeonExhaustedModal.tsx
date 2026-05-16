import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

export function DungeonExhaustedModal() {
	const { state, dispatch } = useGameStore();
	const canPay =
		state.groupXp >= 5 && state.decks.dungeonDeck.discarded.length > 0;

	function payXp() {
		dispatch({ type: "SPEND_XP", payload: { option: "recover_dungeon" } });
	}

	function acceptDefeat() {
		dispatch({ type: "DEFEAT", payload: { reason: "deck_exhausted" } });
	}

	return (
		<Modal title="Deck de dungeon vazio" maxWidth={440}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				Você pode gastar <strong style={{ color: UI.textPrimary }}>5 XP</strong>{" "}
				para recuperar 1 carta aleatória do descarte e continuar. Caso
				contrário, a partida termina em derrota.
			</p>

			<p className="text-xs mb-5" style={{ color: UI.textTertiary }}>
				XP disponível: {state.groupXp} · Cartas no descarte:{" "}
				{state.decks.dungeonDeck.discarded.length}
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
