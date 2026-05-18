import type { XpSpendOption } from "@/core/config/defaults";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";
import { selectXpSpendOptions } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";

interface XpSpendModalProps {
	onClose: () => void;
}

export function XpSpendModal({ onClose }: XpSpendModalProps) {
	const { state, dispatch } = useGameStore();
	const options = selectXpSpendOptions(state);

	function spend(option: XpSpendOption) {
		dispatch({ type: "SPEND_XP", payload: { option } });
	}

	function continuar() {
		dispatch({ type: "OPEN_PATHS" });
		onClose();
	}

	return (
		<Modal title="Gastar XP" onClose={undefined} maxWidth={480}>
			<p className="text-sm mb-4" style={{ color: UI.textSecondary }}>
				Você tem{" "}
				<strong style={{ color: UI.textPrimary }}>{state.groupXp} XP</strong>.
				Gaste antes de explorar os caminhos.
			</p>

			<div className="space-y-2 mb-5">
				{options.map((opt) => (
					<div
						key={opt.option}
						className="flex items-center justify-between p-3 rounded-lg"
						style={{
							background: UI.subpanelBg,
							opacity: opt.available ? 1 : 0.45,
						}}
					>
						<div>
							<p
								className="text-sm font-medium"
								style={{ color: UI.textPrimary }}
							>
								{opt.label}
							</p>
							<p className="text-xs" style={{ color: UI.textTertiary }}>
								{opt.cost} XP
							</p>
							{!opt.available && opt.reason && (
								<p className="text-xs mt-0.5" style={{ color: "#B45309" }}>
									{opt.reason}
								</p>
							)}
						</div>
						<ActionButton
							label="Gastar"
							variant="primary"
							disabled={!opt.available}
							onClick={() => spend(opt.option)}
						/>
					</div>
				))}
			</div>

			<ActionButton
				label="Continuar sem gastar"
				variant="secondary"
				onClick={continuar}
				fullWidth
			/>
		</Modal>
	);
}
