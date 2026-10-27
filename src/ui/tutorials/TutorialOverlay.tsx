import {
	type CSSProperties,
	useEffect,
	useLayoutEffect,
	useMemo,
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
import type { PlayerView } from "@/core/projection/playerView";
import type { BonusEntry } from "@/core/state/combatState";
import { getCardName } from "@/core/data/cardLocale";
import { getSkillName } from "@/core/data/skillLocale";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";

interface Props {
	session: TutorialSession;
	journal: GameJournal;
	view: PlayerView;
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

function bonusDescription(entries: readonly BonusEntry[]): string {
	return (
		entries
			.map(
				({ source, value }) =>
					`${source === "hitBonus" ? "bônus de ataque" : source} ${value >= 0 ? "+" : ""}${value}`,
			)
			.join(", ") || "nenhum"
	);
}

function diceDescription(results: readonly number[]): string {
	return `${results.join(" + ")} (soma ${results.reduce((sum, value) => sum + value, 0)})`;
}

export function TutorialOverlay({
	session,
	journal,
	view,
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
	const previousStep = module.steps[session.stepIndex - 1];
	const canBack =
		session.highlightIndex > 0 ||
		(previousStep?.advance === "manual" &&
			(step.advance === "manual" ||
				step.kind === "completion" ||
				step.id === "combat-action"));
	const highlight = step.highlights?.[session.highlightIndex];
	const anchors = useMemo(() => {
		const base = highlight
			? [highlight.anchor]
			: (step.anchors ?? (step.anchor ? [step.anchor] : []));
		return session.moduleId === "archive-three" &&
			[
				"item-inspect",
				"equip-dagger",
				"equip-axe",
				"equip-armor",
				"use-item",
			].includes(step.id)
			? [
					...base,
					"hero.backpack-popover",
					...(step.id === "use-item" ? ["item.use-action"] : []),
				]
			: base;
	}, [highlight, step.anchors, step.anchor, step.id, session.moduleId]);
	const [rects, setRects] = useState<Rect[]>([]);
	const [viewport, setViewport] = useState({
		width: window.innerWidth,
		height: window.innerHeight,
	});

	useEffect(() => {
		if (session.moduleId !== "archive-three" || !anchors[0]) return;
		const target = document.querySelector<HTMLElement>(
			`[data-tutorial-anchor="${anchors[0]}"]`,
		);
		if (!target || !target.closest(".inventory-dialog")) return;
		const bounds = target.getBoundingClientRect();
		if (bounds.top < 16 || bounds.bottom > viewport.height - 16)
			target.scrollIntoView({
				block: "center",
				inline: "nearest",
				behavior: "instant",
			});
	}, [anchors, session.moduleId, viewport.height]);

	useLayoutEffect(() => {
		const update = () => {
			setViewport({ width: window.innerWidth, height: window.innerHeight });
			setRects(
				anchors.flatMap((anchor) => {
					const target = document.querySelector<HTMLElement>(
						`[data-tutorial-anchor="${anchor}"]`,
					);
					if (!target) return [];
					const bounds = target.getBoundingClientRect();
					const pad = 5;
					return [
						{
							top: Math.max(0, bounds.top - pad),
							left: Math.max(0, bounds.left - pad),
							right: Math.min(window.innerWidth, bounds.right + pad),
							bottom: Math.min(window.innerHeight, bounds.bottom + pad),
						},
					];
				}),
			);
		};
		if (view.status) update();
		const observer = new ResizeObserver(update);
		for (const anchor of anchors) {
			const target = document.querySelector<HTMLElement>(
				`[data-tutorial-anchor="${anchor}"]`,
			);
			if (target) observer.observe(target);
		}
		const mutationObserver = new MutationObserver(() => {
			update();
		});
		const inventoryDialog = document.querySelector(".inventory-dialog");
		if (inventoryDialog)
			mutationObserver.observe(inventoryDialog, {
				childList: true,
				subtree: true,
			});
		else if (
			anchors.some(
				(anchor) =>
					!document.querySelector(`[data-tutorial-anchor="${anchor}"]`),
			)
		)
			mutationObserver.observe(document.body, {
				childList: true,
				subtree: true,
			});
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		window.visualViewport?.addEventListener("resize", update);
		window.visualViewport?.addEventListener("scroll", update);
		return () => {
			observer.disconnect();
			mutationObserver.disconnect();
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
			window.visualViewport?.removeEventListener("resize", update);
			window.visualViewport?.removeEventListener("scroll", update);
		};
	}, [anchors, view.status]);

	useEffect(() => {
		const selector = anchors[0]
			? `[data-tutorial-anchor="${anchors[0]}"] button:not([disabled]), button[data-tutorial-anchor="${anchors[0]}"]:not([disabled])`
			: "";
		const target =
			step.kind === "interaction" && selector
				? document.querySelector<HTMLElement>(selector)
				: null;
		const primary = document.querySelector<HTMLElement>(
			".tutorial-panel__primary",
		);
		if (!document.querySelector(".flow-modal-overlay, .game-dice-roll-layer"))
			(target ?? primary)?.focus({ preventScroll: true });
	}, [anchors, step.kind]);

	useEffect(() => {
		function trapTab(event: KeyboardEvent) {
			if (event.key !== "Tab") return;
			const selector =
				"button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";
			const panel = document.querySelector(".tutorial-panel");
			const targets =
				step.kind === "interaction" ||
				step.id === "group" ||
				step.id === "item-states"
					? anchors
							.map((anchor) =>
								document.querySelector(`[data-tutorial-anchor="${anchor}"]`),
							)
							.filter((target) => target !== null)
					: [];
			const modal = document.querySelector(
				".flow-modal-overlay, .game-dice-roll-layer",
			);
			const close = panel?.querySelector<HTMLElement>(".tutorial-panel__close");
			const allowed = (
				modal
					? [
							...modal.querySelectorAll<HTMLElement>(selector),
							...(close ? [close] : []),
						]
					: [
							...targets.flatMap((target) => [
								...(target.matches(selector) ? [target as HTMLElement] : []),
								...target.querySelectorAll<HTMLElement>(selector),
							]),
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
	}, [anchors, step.kind, step.id]);

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
	const xCuts = [
		...new Set([
			0,
			viewport.width,
			...rects.flatMap((rect) => [rect.left, rect.right]),
		]),
	].sort((a, b) => a - b);
	const yCuts = [
		...new Set([
			0,
			viewport.height,
			...rects.flatMap((rect) => [rect.top, rect.bottom]),
		]),
	].sort((a, b) => a - b);
	const masks = xCuts.flatMap((x, xi) =>
		yCuts.flatMap((y, yi) => {
			const nextX = xCuts[xi + 1];
			const nextY = yCuts[yi + 1];
			if (nextX === undefined || nextY === undefined) return [];
			const centerX = (x + nextX) / 2;
			const centerY = (y + nextY) / 2;
			if (
				rects.some(
					(rect) =>
						centerX >= rect.left &&
						centerX <= rect.right &&
						centerY >= rect.top &&
						centerY <= rect.bottom,
				)
			)
				return [];
			return [mask(y, x, nextX - x, nextY - y, `${xi}-${yi}`)];
		}),
	);
	const rect = rects.length
		? {
				top: Math.min(...rects.map((item) => item.top)),
				left: Math.min(...rects.map((item) => item.left)),
				right: Math.max(...rects.map((item) => item.right)),
				bottom: Math.max(...rects.map((item) => item.bottom)),
			}
		: null;
	const panelPlacement =
		session.moduleId === "archive-four" &&
		(step.id === "hunter-attack" || step.id === "fury-trigger") &&
		viewport.width < 900
			? "bottom"
			: step.id === "combat-drag" && session.combatInput === "tap"
			? view.combat?.phase === "selecting_target"
				? "bottom"
				: "top"
			: step.id === "choose-hero" ||
					(rect && rect.bottom < viewport.height * 0.55)
				? "bottom"
				: "top";
	const instruction =
		step.id === "combat-drag" && session.combatInput === "tap"
			? "Toque no herói e depois na criatura para declarar o ataque."
			: (highlight?.instruction ?? step.instruction);
	const visibleRoll = step.id === "combat-dice" ? view.combat?.lastRoll : null;
	const result = session.finalAttack;
	const powerDefinition = session.moduleId === "archive-four" && view.heroes[0]
		? cardSkills(view.heroes[0].cardId).find(({ def }) => def.category === "hero_power")?.def
		: undefined;
	const powerScope = powerDefinition?.cooldown?.scope;
	const powerLimit = powerScope === "game" ? "por partida" : powerScope === "room" ? "por sala" : powerScope === "combat" ? "por combate" : powerScope === "round" ? "por rodada" : undefined;
	const damageMessage = result?.messages.find(
		(message) =>
			message.includes(result.enemyName) && message.includes("sofreu"),
	);
	const leftSpace = rect?.left ?? 0;
	const rightSpace = rect ? viewport.width - rect.right : 0;
	const side =
		step.id === "combat-result"
			? null
			: viewport.width > 800 && leftSpace > 285
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
		<div
			className={`tutorial-layer${step.id === "combat-dice" ? " tutorial-layer--dice" : ""}${session.moduleId === "archive-three" ? " tutorial-layer--inventory" : ""}${session.moduleId === "archive-four" ? " tutorial-layer--abilities" : ""}`}
			data-tutorial-step={step.id}
		>
			{masks}
			{rects.map((spotlight, index) => (
				<div
					key={index}
					className="tutorial-spotlight"
					aria-hidden="true"
					style={{
						top: spotlight.top,
						left: spotlight.left,
						width: spotlight.right - spotlight.left,
						height: spotlight.bottom - spotlight.top,
					}}
				/>
			))}
			{rects.map(
				(spotlight, index) =>
					step.kind !== "interaction" &&
					step.id !== "group" &&
					step.id !== "item-states" &&
					step.id !== "passive-effect" &&
					step.id !== "ability-limits" && (
						<div
							key={index}
							className="tutorial-spotlight-shield"
							style={{
								top: spotlight.top,
								left: spotlight.left,
								width: spotlight.right - spotlight.left,
								height: spotlight.bottom - spotlight.top,
							}}
						/>
					),
			)}
			<section
				key={step.id}
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
				{session.moduleId === "archive-four" &&
					["prey-mark", "hunter-attack", "fury-prepare", "fury-trigger", "hero-power", "passive-effect", "ability-limits"].includes(step.id) && (
						<div className="tutorial-panel__combat-detail" role="status" aria-label="Estado real das habilidades">
							{view.heroes[0] && view.abilityActionsByHero[view.heroes[0].id]?.filter((action) => action.kind !== "item" && (step.id === "passive-effect" ? false : step.id === "ability-limits" ? action.kind === "power" : true)).map((action) => (
								<p key={action.abilityId}>
									{action.label}: {action.status === "prepared" ? "preparada: aguardando o evento" : action.status === "active" ? "efeito ativo" : action.status === "exhausted" ? "limite atingido" : action.status === "available" ? "disponível" : "indisponível"}.
									{action.reason ? ` ${action.reason}` : ""}
								</p>
							))}
							{(step.id === "passive-effect" || step.id === "ability-limits") &&
								view.activeInfluences.filter((influence) => influence.from.kind === "item" && influence.from.id === "item_low_flame_charm").map((influence) => (
									<p key={influence.id}>Passivo: {influence.source} — {influence.label} ({influence.duration}).</p>
								))}
							{step.id === "ability-limits" && powerDefinition && powerLimit && (
								<p>Limite de {getSkillName(powerDefinition.id)}: {powerDefinition.cooldown?.charges ?? 1} uso(s) {powerLimit}. O ataque permanece independente.</p>
							)}
							{step.id !== "passive-effect" && step.id !== "ability-limits" && session.abilityResult?.slice(0, 3).map((change) => <p key={change}>{change}</p>)}
						</div>
					)}
				{session.moduleId === "archive-three" &&
					session.inventoryResult &&
					session.stepIndex >= 5 &&
					session.stepIndex <= 7 && (
						<div
							className="tutorial-panel__combat-detail"
							role="status"
							aria-label="Resultado real do inventário"
						>
							<p>
								{session.inventoryCheckpointReady
									? "Checkpoint anterior"
									: "Carta"}
								: {getCardName(session.inventoryResult.itemId)}.
							</p>
							{session.inventoryResult.itemId !== "item_precision_potion" &&
								cardSkills(session.inventoryResult.itemId).map(({ ref }) => (
									<p key={ref.skillId}>
										Efeito da carta: {renderSkillLabel(ref)}
									</p>
								))}
							{session.inventoryResult.changes.slice(0, 3).map((change) => (
								<p key={change}>{change}</p>
							))}
							{session.inventoryResult.itemId === "item_precision_potion" &&
								journal.current.heroes
									.flatMap((hero) =>
										hero.modifiers.filter(
											(modifier) =>
												modifier.sourceId === "ability_hit_bonus_once",
										),
									)
									.map((modifier) => (
										<p key={modifier.sourceId}>
											Efeito aplicado: {modifier.source}{" "}
											{modifier.value >= 0 ? "+" : ""}
											{modifier.value} em acerto ({modifier.duration}).
										</p>
									))}
						</div>
					)}
				{step.id === "item-states" && (
					<div
						className="tutorial-panel__combat-detail"
						role="region"
						aria-label="Estados reais dos itens"
					>
						<p>
							Consumido no checkpoint anterior:{" "}
							{session.inventoryResult?.itemId === "item_precision_potion"
								? getCardName("item_precision_potion")
								: "nenhum confirmado"}
							.
						</p>
						<p>
							Prontos:{" "}
							{journal.current.heroes
								.flatMap((hero) =>
									hero.equipment
										.filter((slot) => slot.card?.state === "ready")
										.map((slot) => slot.card!.name),
								)
								.join(", ") || "nenhum"}
							.
						</p>
						<p>
							Exauridos:{" "}
							{journal.current.heroes
								.flatMap((hero) =>
									hero.equipment
										.filter((slot) => slot.card?.state === "exhausted")
										.map((slot) => slot.card!.name),
								)
								.join(", ") || "nenhum neste encontro"}
							.
						</p>
						<p>
							Ataque do herói:{" "}
							{journal.current.heroesActed.length === 0 &&
							view.status === "HERO_ACTION"
								? "disponível nesta rodada"
								: "já realizado nesta rodada"}
							.
						</p>
					</div>
				)}
				{step.id === "combat-drag" && session.firstAttack && (
					<p className="tutorial-panel__combat-detail">
						Primeiro ataque: {session.firstAttack.roll.heroTotal} contra{" "}
						{session.firstAttack.roll.enemyTotal} —{" "}
						{session.firstAttack.roll.heroTotal >
						session.firstAttack.roll.enemyTotal
							? "acerto do herói"
							: session.firstAttack.roll.heroTotal <
									session.firstAttack.roll.enemyTotal
								? "ataque do herói falhou"
								: "empate"}
						. {session.firstAttack.enemyName}:{" "}
						{session.firstAttack.enemyLifeBefore} →{" "}
						{session.firstAttack.enemyLifeAfter} de vida.{" "}
						{session.firstAttack.heroName}: {session.firstAttack.heroLifeBefore}{" "}
						→ {session.firstAttack.heroLifeAfter} de vida.
					</p>
				)}
				{visibleRoll && (
					<div
						className="tutorial-panel__combat-detail"
						role="region"
						aria-label="Resultado real da rolagem"
					>
						<p>
							Herói: dados {diceDescription(visibleRoll.heroResults)} ·
							modificadores {bonusDescription(visibleRoll.heroBreakdown)} ·
							total {visibleRoll.heroTotal}
						</p>
						<p>
							Criatura: dados {diceDescription(visibleRoll.enemyResults)} ·
							modificadores {bonusDescription(visibleRoll.enemyBreakdown)} ·
							total {visibleRoll.enemyTotal}
						</p>
					</div>
				)}
				{(step.id === "combat-result" ||
					step.id === "combat-action" ||
					step.kind === "completion") &&
					result && (
						<div
							className="tutorial-panel__combat-detail"
							role="region"
							aria-label="Resultado registrado do ataque"
						>
							<p>
								{result.roll.heroTotal > result.roll.enemyTotal
									? "Acerto do herói"
									: result.roll.heroTotal < result.roll.enemyTotal
										? "Golpe da criatura"
										: "Empate: ambos podem sofrer dano"}
								. {result.enemyName}: {result.enemyLifeBefore} →{" "}
								{result.enemyLifeAfter} de vida. Perda de vida observada:{" "}
								{Math.max(0, result.enemyLifeBefore - result.enemyLifeAfter)}.
							</p>
							<p>
								Vida do herói: {result.heroLifeBefore} → {result.heroLifeAfter}.
								Ataque consumido:{" "}
								{result.heroesActed.includes(result.roll.heroId)
									? "sim"
									: "não"}
								.
							</p>
							<p>
								{result.heroName}: dados{" "}
								{diceDescription(result.roll.heroResults)} · modificadores{" "}
								{bonusDescription(result.roll.heroBreakdown)} · total{" "}
								{result.roll.heroTotal}.
							</p>
							<p>
								{result.enemyName}: dados{" "}
								{diceDescription(result.roll.enemyResults)} · modificadores{" "}
								{bonusDescription(result.roll.enemyBreakdown)} · total{" "}
								{result.roll.enemyTotal}.
							</p>
							{damageMessage && <p>Resolução do motor: {damageMessage}</p>}
							{result.messages.length > 0 && (
								<details>
									<summary>Detalhes da resolução no Diário</summary>
									<ul>
										{result.messages.map((message, index) => (
											<li key={`${index}-${message}`}>{message}</li>
										))}
									</ul>
								</details>
							)}
						</div>
					)}
				{step.highlights && (
					<p className="tutorial-panel__count">
						Ponto {session.highlightIndex + 1} de {step.highlights.length}
					</p>
				)}
				<div className="tutorial-panel__actions">
					{step.kind === "completion" ? (
						<>
							{nextModule && <button type="button" onClick={onNext}>
								Próximo arquivo — {nextModule.title}
							</button>}
							<button type="button" onClick={onHub}>
								{session.moduleId === "archive-four" ? "Revisar tutoriais" : "Escolher arquivo"}
							</button>
							<button type="button" onClick={onRepeat}>
								{session.moduleId === "archive-four" ? "Repetir este arquivo" : "Repetir arquivo"}
							</button>
							<button type="button" onClick={onPlay}>
								{session.moduleId === "archive-four" ? "Jogar agora" : "Jogar normalmente"}
							</button>
							<button type="button" onClick={onClose}>
								{session.moduleId === "archive-four" ? "Voltar ao menu" : "Sair dos tutoriais"}
							</button>
						</>
					) : (
						<>
							{(step.advance === "manual" || step.id === "combat-action") && (
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
										: step.id === "combat-action"
											? "Concluir combate"
											: "Continuar"}
								</button>
							)}
							{step.skippable && (
								<button type="button" onClick={onSkip}>
									Pular observação
								</button>
							)}
							{canBack && (
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
