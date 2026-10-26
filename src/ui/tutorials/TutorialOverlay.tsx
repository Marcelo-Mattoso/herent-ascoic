import {
	type CSSProperties,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	exportJournalJson,
	type GameJournal,
} from "@/core/journal/gameJournal";
import { downloadTutorialAudit } from "./audit";
import { currentTutorialStep, type TutorialSession } from "./session";
import { getTutorialModule, type TutorialModule } from "./registry";

interface Props {
	session: TutorialSession;
	journal: GameJournal;
	nextModule?: TutorialModule;
	onNext: () => void;
	onContinue: () => void;
	onSkip: () => void;
	onBack: () => void;
	onClose: () => void;
	onRepeat: () => void;
	onHub: () => void;
	onPlay: () => void;
}

type Rect = { top: number; left: number; right: number; bottom: number };

export function TutorialOverlay({
	session,
	journal,
	nextModule,
	onNext,
	onContinue,
	onSkip,
	onBack,
	onClose,
	onRepeat,
	onHub,
	onPlay,
}: Props) {
	const module = getTutorialModule(session.moduleId);
	const step = currentTutorialStep(session);
	const highlight = step.highlights?.[session.highlightIndex];
	const anchor = highlight?.anchor ?? step.anchor;
	const [rect, setRect] = useState<Rect | null>(null);
	const [viewport, setViewport] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useLayoutEffect(() => {
		const update = () => {
			setViewport({ width: window.innerWidth, height: window.innerHeight });
			const target = anchor
				? document.querySelector<HTMLElement>(
						`[data-tutorial-anchor="${anchor}"]`,
					)
				: null;
			if (!target) {
				setRect(null);
				return;
			}
			const bounds = target.getBoundingClientRect();
			const pad = 5;
			setRect({
				top: Math.max(0, bounds.top - pad),
				left: Math.max(0, bounds.left - pad),
				right: Math.min(window.innerWidth, bounds.right + pad),
				bottom: Math.min(window.innerHeight, bounds.bottom + pad),
			});
		};
		update();
		const observer = new ResizeObserver(update);
		const target = anchor
			? document.querySelector<HTMLElement>(
					`[data-tutorial-anchor="${anchor}"]`,
				)
			: null;
		if (target) observer.observe(target);
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
		};
	}, [anchor]);

	useEffect(() => {
		const selector = anchor
			? `[data-tutorial-anchor="${anchor}"] button:not([disabled]), button[data-tutorial-anchor="${anchor}"]:not([disabled])`
			: "";
		const target =
			step.kind === "interaction" && selector
				? document.querySelector<HTMLElement>(selector)
				: null;
		const primary = document.querySelector<HTMLElement>(
			".tutorial-panel__primary",
		);
		if (!document.querySelector(".flow-modal-overlay"))
			(target ?? primary)?.focus({ preventScroll: true });
	}, [anchor, step.kind]);

	useEffect(() => {
		function trapTab(event: KeyboardEvent) {
			if (event.key !== "Tab") return;
			const selector =
				"button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";
			const panel = document.querySelector(".tutorial-panel");
			const target =
				anchor && (step.kind === "interaction" || step.id === "group")
					? document.querySelector(`[data-tutorial-anchor="${anchor}"]`)
					: null;
			const modal = document.querySelector(".flow-modal-overlay");
			const allowed = (
				modal
					? [...modal.querySelectorAll<HTMLElement>(selector)]
					: [
							...(target?.matches(selector) ? [target as HTMLElement] : []),
							...(target?.querySelectorAll<HTMLElement>(selector) ?? []),
							...(panel?.querySelectorAll<HTMLElement>(selector) ?? []),
						]
			).filter((element) => element.getClientRects().length > 0);
			if (!allowed.length) return;
			const current = allowed.indexOf(document.activeElement as HTMLElement);
			const next =
				current < 0
					? 0
					: (current + (event.shiftKey ? -1 : 1) + allowed.length) %
						allowed.length;
			event.preventDefault();
			allowed[next].focus();
		}
		document.addEventListener("keydown", trapTab);
		return () => document.removeEventListener("keydown", trapTab);
	}, [anchor, step.kind, step.id]);

	const mask = (
		top: number,
		left: number,
		width: number,
		height: number,
		key: string,
	) => (
		<div
			key={key}
			className="tutorial-mask"
			style={{
				top,
				left,
				width: Math.max(0, width),
				height: Math.max(0, height),
			}}
		/>
	);
	const masks = rect
		? [
				mask(0, 0, viewport.width, rect.top, "top"),
				mask(
					rect.bottom,
					0,
					viewport.width,
					viewport.height - rect.bottom,
					"bottom",
				),
				mask(rect.top, 0, rect.left, rect.bottom - rect.top, "left"),
				mask(
					rect.top,
					rect.right,
					viewport.width - rect.right,
					rect.bottom - rect.top,
					"right",
				),
			]
		: [mask(0, 0, viewport.width, viewport.height, "all")];
	const panelPlacement =
		step.id === "choose-hero" || (rect && rect.bottom < viewport.height * 0.55)
			? "bottom"
			: "top";
	const instruction = highlight?.instruction ?? step.instruction;
	const leftSpace = rect?.left ?? 0;
	const rightSpace = rect ? viewport.width - rect.right : 0;
	const side =
		viewport.width > 800 && leftSpace > 285
			? "left"
			: viewport.width > 800 && rightSpace > 285
				? "right"
				: null;
	const panelStyle = side
		? ({
				width: Math.min(450, (side === "left" ? leftSpace : rightSpace) - 24),
				left: side === "left" ? 12 : "auto",
				right: side === "right" ? 12 : "auto",
			} as CSSProperties)
		: undefined;
	function downloadAudit() {
		downloadTutorialAudit({
			session,
			gameJournalJson: exportJournalJson(journal),
		});
	}

	return createPortal(
		<div className="tutorial-layer" data-tutorial-step={step.id}>
			{masks}
			{rect && (
				<div
					className="tutorial-spotlight"
					aria-hidden="true"
					style={{
						top: rect.top,
						left: rect.left,
						width: rect.right - rect.left,
						height: rect.bottom - rect.top,
					}}
				/>
			)}
			{rect && step.kind !== "interaction" && step.id !== "group" && (
				<div
					className="tutorial-spotlight-shield"
					style={{
						top: rect.top,
						left: rect.left,
						width: rect.right - rect.left,
						height: rect.bottom - rect.top,
					}}
				/>
			)}
			<section
				className={`tutorial-panel tutorial-panel--${panelPlacement}${step.kind === "completion" ? " tutorial-panel--completion" : ""}`}
				style={panelStyle}
				aria-label="Orientações do Arquivista"
				aria-live="polite"
			>
				<div className="tutorial-panel__meta">
					<span>{module.title}</span>
					<span>
						Etapa {session.stepIndex + 1} de {module.steps.length}
					</span>
				</div>
				<button
					type="button"
					className="tutorial-panel__close"
					onClick={onClose}
					aria-label="Sair do tutorial"
				>
					×
				</button>
				<p className="tutorial-panel__speaker">O Arquivista</p>
				<h2>{step.title}</h2>
				{step.narration.map((paragraph) => (
					<p key={paragraph}>{paragraph}</p>
				))}
				<p className="tutorial-panel__instruction">{instruction}</p>
				{step.highlights && (
					<p className="tutorial-panel__count">
						Ponto {session.highlightIndex + 1} de {step.highlights.length}
					</p>
				)}
				<div className="tutorial-panel__actions">
					{step.kind === "completion" ? (
						<>
							<button type="button" disabled={!nextModule} onClick={onNext}>
								{nextModule
									? `Próximo arquivo — ${nextModule.title}`
									: "Próximo arquivo — em breve"}
							</button>
							<button type="button" onClick={onHub}>
								Escolher arquivo
							</button>
							<button type="button" onClick={onRepeat}>
								Repetir arquivo
							</button>
							<button type="button" onClick={onPlay}>
								Jogar normalmente
							</button>
							<button type="button" onClick={onClose}>
								Sair dos tutoriais
							</button>
						</>
					) : (
						<>
							{step.advance === "manual" && (
								<button
									type="button"
									className="tutorial-panel__primary"
									onClick={onContinue}
									disabled={
										step.id === "group" &&
										session.selectedHeroCardIds.length === 0
									}
								>
									{step.highlights &&
									session.highlightIndex < step.highlights.length - 1
										? "Próximo ponto"
										: "Continuar"}
								</button>
							)}
							{step.skippable && (
								<button type="button" onClick={onSkip}>
									Pular observação
								</button>
							)}
							{(session.highlightIndex > 0 || session.stepIndex >= 7) && (
								<button type="button" onClick={onBack}>
									Voltar
								</button>
							)}
							{step.kind === "interaction" && (
								<span className="tutorial-panel__waiting">
									Aguardando sua ação no jogo
								</span>
							)}
						</>
					)}
				</div>
				<details className="tutorial-panel__audit">
					<summary>Registro do treinamento</summary>
					<p>Sessão {session.id}</p>
					<ol>
						{session.events.map((event, index) => (
							<li key={`${index}-${event.type}`}>
								{event.source === "game-observation" ? "Jogo" : "Tutorial"}:{" "}
								{event.type} — {event.stepId}
								{event.detail ? ` (${event.detail})` : ""}
							</li>
						))}
					</ol>
					<button type="button" onClick={downloadAudit}>
						Baixar registro e diário
					</button>
				</details>
			</section>
		</div>,
		document.body,
	);
}
