import { useState } from "react";
import { getCardById } from "@/core/data/cards";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

interface OpenPathsModalProps {
	onClose: () => void;
}

export function OpenPathsModal({ onClose }: OpenPathsModalProps) {
	const { view, dispatch } = useGameStore();
	const [selected, setSelected] = useState<string | null>(null);

	const paths = view.paths;

	function confirmPath() {
		if (!selected) return;
		dispatch({ type: "CHOOSE_PATH", payload: { cardId: selected } });
		dispatch({ type: "DISCARD_PATHS" });
		dispatch({ type: "CHECK_BOSS_CONDITION" });
		onClose();
	}

	return (
		<Modal title="Escolher próxima sala" maxWidth={640}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				Escolha 1 caminho. As demais cartas serão descartadas.
			</p>

			<div className="grid grid-cols-3 gap-3 mb-5">
				{paths.map((cardId) => {
					const card = getCardById(cardId);
					const isSelected = selected === cardId;
					return (
						<button
							key={cardId}
							type="button"
							onClick={() => setSelected(cardId)}
							className="rounded-lg p-2 text-left transition-all"
							style={{
								background: isSelected ? UI.info.bg : UI.subpanelBg,
								border: `1.5px solid ${isSelected ? "#185FA5" : UI.border}`,
							}}
						>
							<PlaceholderArt cardType="room" size="sm" />
							<p
								className="text-xs font-medium mt-1"
								style={{ color: UI.textPrimary }}
							>
								{card?.name ?? cardId}
							</p>
							{card?.type === "room" && (
								<p className="text-xs" style={{ color: UI.textTertiary }}>
									Saídas {card.exits} · XP {card.xp ?? 0}
								</p>
							)}
						</button>
					);
				})}
			</div>

			<ActionButton
				label="Confirmar escolha"
				variant="primary"
				disabled={!selected}
				onClick={confirmPath}
				fullWidth
			/>
		</Modal>
	);
}
