// Modal genérico para SKILL_CHOICE — exibe prompt e opções da skill pendente.
// O jogador escolhe e dispara SKILL_CHOICE; o reducer roteia para a continuação.

import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

export function SkillChoiceModal() {
	const { view, dispatch } = useGameStore();
	const pending = view.pendingSkillChoice;

	if (!pending) return null;

	function choose(choiceId: string) {
		if (!pending) return;
		dispatch({
			type: "SKILL_CHOICE",
			payload: { skillId: pending.skillId, choice: choiceId },
		});
	}

	return (
		<Modal title="Escolha de habilidade" maxWidth={420}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				{pending.prompt}
			</p>

			<div className="flex flex-col gap-2">
				{pending.options.map((opt) => (
					<ActionButton
						key={opt.id}
						label={opt.label}
						onClick={() => choose(opt.id)}
						variant="secondary"
						fullWidth
					/>
				))}
			</div>
		</Modal>
	);
}
