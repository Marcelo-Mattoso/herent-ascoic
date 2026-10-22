import { getSkillName } from "@/core/data/skillLocale";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

const TARGET_KIND_LABEL = {
	hero: "Herói",
	enemy: "Inimigo",
	die: "Dado",
} as const;

const TARGET_KIND_ICON = {
	hero: "✦",
	enemy: "◆",
	die: "◼",
} as const;

export function SkillTargetModal() {
	const { view, dispatch } = useGameStore();
	const pending = view.pendingSkillTarget;

	if (!pending) return null;

	function choose(targetId: string) {
		dispatch({
			type: "SELECT_SKILL_TARGET",
			payload: { targetId },
		});
	}

	function cancel() {
		dispatch({ type: "CANCEL_SKILL_TARGET" });
	}

	return (
		<Modal title="Escolha o alvo" maxWidth={440} onClose={cancel}>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div>
					<p style={{ color: UI.textPrimary, fontSize: 13, fontWeight: 600 }}>
						{getSkillName(pending.skillId)}
					</p>
					<p style={{ color: UI.textSecondary, fontSize: 13 }}>
						{pending.prompt}
					</p>
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{pending.candidates.map((candidate) => (
						<button
							key={candidate.id}
							type="button"
							className="skill-target-option"
							onClick={() => choose(candidate.id)}
							style={{
								display: "grid",
								gridTemplateColumns: "28px 1fr auto",
								alignItems: "center",
								gap: 8,
								padding: "10px 12px",
								borderRadius: 8,
								border: `1px solid ${UI.borderStrong}`,
								background: UI.subpanelBg,
								color: UI.textPrimary,
								textAlign: "left",
								cursor: "pointer",
							}}
						>
							<span style={{ color: UI.textSecondary, textAlign: "center" }}>
								{TARGET_KIND_ICON[candidate.kind]}
							</span>
							<strong style={{ fontSize: 13, fontWeight: 600 }}>
								{candidate.label}
							</strong>
							<span style={{ color: UI.textTertiary, fontSize: 11 }}>
								{TARGET_KIND_LABEL[candidate.kind]}
							</span>
						</button>
					))}
				</div>

				<ActionButton
					label="Cancelar"
					variant="secondary"
					fullWidth
					onClick={cancel}
				/>
			</div>
		</Modal>
	);
}
