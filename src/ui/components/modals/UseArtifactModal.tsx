import type { ManualArtifactAction } from "@/core/rules/artifactActivation";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { Modal } from "@/ui/components/Modal";
import { ActionButton } from "@/ui/components/ActionButton";
import { useGameStore } from "@/ui/store/gameStore";

/** All targets have already been authorized by the game engine. */
export function UseArtifactModal({
	action,
	onClose,
}: {
	action: ManualArtifactAction;
	onClose: () => void;
}) {
	const { dispatch } = useGameStore();
	function use(target?: ManualArtifactAction["targets"][number]) {
		if (!action.available) return;
		dispatch({ type: "USE_ARTIFACT", payload: {
			artifactId: action.artifactId,
			abilityId: action.abilityId,
			...(target?.kind === "enemy" ? { targetEnemyId: target.id } : {}),
			...(target?.kind === "hero" ? { targetHeroId: target.id } : {}),
		} });
		onClose();
	}
	return (
		<Modal title={"Usar " + getCardName(action.artifactId)} onClose={onClose}>
			<div className="flex flex-col gap-2">
				{!action.available && <p role="status">{action.reason ?? "Ativação indisponível."}</p>}
				{action.available && action.requiresTarget && (
					<>
						<p>Escolha o alvo da habilidade:</p>
						{action.targets.map((target) => (
							<ActionButton key={target.kind + ":" + target.id}
								label={target.label} variant="secondary"
								onClick={() => use(target)} />
						))}
					</>
				)}
				{action.available && !action.requiresTarget && (
					<ActionButton label="Confirmar uso" variant="primary" onClick={() => use()} />
				)}
				<ActionButton label="Cancelar" variant="secondary" onClick={onClose} />
			</div>
		</Modal>
	);
}
