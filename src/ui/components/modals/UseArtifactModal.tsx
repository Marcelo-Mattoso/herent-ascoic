import type { ManualArtifactAction } from "@/core/rules/artifactActivation";
import { translate } from "@/i18n";
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
		<Modal title={translate("game:components.useArtifactModal.title", { name: getCardName(action.artifactId) })} onClose={onClose}>
			<div className="flex flex-col gap-2">
				{!action.available && <p role="status">{action.reason ?? translate("game:components.useArtifactModal.unavailable")}</p>}
				{action.available && action.requiresTarget && (
					<>
						<p>{translate("game:components.useArtifactModal.chooseTarget")}</p>
						{action.targets.map((target) => (
							<ActionButton key={target.kind + ":" + target.id}
								label={target.label} variant="secondary"
								onClick={() => use(target)} />
						))}
					</>
				)}
				{action.available && !action.requiresTarget && (
					<ActionButton label={translate("game:components.useArtifactModal.confirm")} variant="primary" onClick={() => use()} />
				)}
				<ActionButton label={translate("game:components.useArtifactModal.cancel")} variant="secondary" onClick={onClose} />
			</div>
		</Modal>
	);
}
