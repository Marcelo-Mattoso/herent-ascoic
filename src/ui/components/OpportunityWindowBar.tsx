import { getSkillName } from "@/core/data/skillLocale";
import type { OpportunityWindow } from "@/core/flow/opportunityWindow";

export function OpportunityWindowBar({
	window,
	onPerform,
	onPass,
}: {
	window: OpportunityWindow;
	onPerform: (actionId: string) => void;
	onPass: () => void;
}) {
	return (
		<section className="opportunity-window" aria-label="Janela de oportunidade">
			<span className="opportunity-window__phase">
				{window.phase.replaceAll("_", " ")}
			</span>
			<div className="opportunity-window__actions">
				{window.availableActions.map((action) => (
					<button
						key={action.actionId}
						type="button"
						onClick={() => onPerform(action.actionId)}
					>
						Usar {getSkillName(action.label)}
					</button>
				))}
				<button
					type="button"
					className="opportunity-window__pass"
					onClick={onPass}
				>
					Passar
				</button>
			</div>
		</section>
	);
}
