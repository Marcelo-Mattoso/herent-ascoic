import { translate } from "@/i18n";
import { tutorialText } from "@/i18n/catalogs";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { TUTORIAL_MODULES, type TutorialModuleId } from "./registry";
import { downloadTutorialAudit, type TutorialAuditSnapshot } from "./audit";

interface TutorialHubProps {
	onStart: (id: TutorialModuleId) => void;
	onClose: () => void;
	lastAudit?: TutorialAuditSnapshot | null;
}

export function TutorialHub({ onStart, onClose, lastAudit }: TutorialHubProps) {
	const hubRef = useRef<HTMLElement>(null);
	useEffect(() => {
		hubRef.current?.querySelector("button")?.focus();
	}, []);
	function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
		if (event.key === "Escape") {
			onClose();
			return;
		}
		if (event.key !== "Tab") return;
		const buttons = [
			...(hubRef.current?.querySelectorAll<HTMLButtonElement>(
				"button:not([disabled])",
			) ?? []),
		];
		const current = buttons.indexOf(
			document.activeElement as HTMLButtonElement,
		);
		if (current < 0 || buttons.length === 0) return;
		event.preventDefault();
		buttons[
			(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
		].focus();
	}
	return (
		<section
			ref={hubRef}
			onKeyDown={handleKeyDown}
			className="tutorial-hub"
			role="dialog"
			aria-modal="true"
			aria-labelledby="tutorial-hub-title"
		>
			<div className="tutorial-hub__content">
				<div className="tutorial-hub__heading">
					<button type="button" onClick={onClose}>
						{translate("game:tutorials.tutorialHub.text001")}{" "}</button>
					<div>
						<p>{translate("game:tutorials.tutorialHub.text002")}</p>
						<h2 id="tutorial-hub-title">{translate("game:tutorials.tutorialHub.text003")}</h2>
					</div>
				</div>
				<p className="tutorial-hub__intro">
					{translate("game:tutorials.tutorialHub.text004")}{" "}</p>
				<div className="tutorial-hub__modules">
					{TUTORIAL_MODULES.map((module) => (
						<article className="tutorial-hub__module" key={module.id}>
							<h3>{tutorialText(module.id, "title")}</h3>
							<p>{tutorialText(module.id, "subtitle")}</p>
							<p>{tutorialText(module.id, "summary")}</p>
							<button
								type="button"
								disabled={!module.available}
								onClick={() => onStart(module.id)}
							>
								{translate(module.available ? "game:tutorials.tutorialHub.startArchive" : "game:tutorials.tutorialHub.comingSoon")}
							</button>
						</article>
					))}
				</div>
				{lastAudit && (
					<button
						type="button"
						className="tutorial-hub__audit"
						onClick={() => downloadTutorialAudit(lastAudit)}
					>
						{translate("game:tutorials.tutorialHub.text005")}{" "}</button>
				)}
			</div>
		</section>
	);
}
