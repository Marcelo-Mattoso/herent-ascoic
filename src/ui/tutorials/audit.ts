import type { TutorialSession } from "./session";

export interface TutorialAuditSnapshot {
	readonly session: TutorialSession;
	readonly gameJournalJson: string;
}

export function downloadTutorialAudit({
	session,
	gameJournalJson,
}: TutorialAuditSnapshot): void {
	const content = JSON.stringify(
		{
			tutorial: {
				id: session.id,
				moduleId: session.moduleId,
				status: session.status,
				events: session.events,
			},
			gameJournal: JSON.parse(gameJournalJson),
		},
		null,
		2,
	);
	const url = URL.createObjectURL(
		new Blob([content], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = `tutorial-${session.id}.json`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
