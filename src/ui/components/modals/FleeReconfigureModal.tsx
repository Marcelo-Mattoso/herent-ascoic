// Modal exibido quando status === "DUNGEON_RESTART_PROMPT".
// Permite reiniciar a masmorra mantendo ou descartando equipamentos.

import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

export function FleeReconfigureModal() {
	const { dispatch } = useGameStore();

	return (
		<Modal title="🏃 Fuga bem-sucedida!" maxWidth={400}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				Todos os heróis fugiram da masmorra. Vocês podem recomeçar — escolham
				como reiniciar:
			</p>

			<div className="flex flex-col gap-3">
				<ActionButton
					label="Reiniciar mantendo equipamentos"
					onClick={() =>
						dispatch({
							type: "RESTART_DUNGEON",
							payload: { keepEquipment: true },
						})
					}
					variant="primary"
				/>
				<ActionButton
					label="Reiniciar do zero"
					onClick={() =>
						dispatch({
							type: "RESTART_DUNGEON",
							payload: { keepEquipment: false },
						})
					}
					variant="secondary"
				/>
			</div>
		</Modal>
	);
}
