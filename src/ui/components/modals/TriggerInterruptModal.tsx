import { translate } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardById } from "@/core/data/cards";
import { displaySkillName as getSkillName } from "@/i18n/catalogs";
import type { PlayerView } from "@/core/projection/playerView";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillText } from "@/core/skills/renderLabel";
import type {
	PendingTriggerInterrupt,
	TriggerSourceKind,
	TriggerWindow,
} from "@/core/triggers/engine";
import { useGameStore } from "@/ui/store/gameStore";
import { getCardImageUrl } from "@/ui/cardImages";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { CardDetailModal } from "./CardDetailModal";
import { PlaceholderArt } from "../PlaceholderArt";
import type { CardType } from "../Card";

const SOURCE_KIND_LABEL: Record<TriggerSourceKind, string> = {
	artifact: "game:components.modals.triggerInterruptModal.sourceKindLabel.artifact",
	boss: "game:components.modals.triggerInterruptModal.sourceKindLabel.boss",
	enemy: "game:components.modals.triggerInterruptModal.sourceKindLabel.enemy",
	hero: "game:components.modals.triggerInterruptModal.sourceKindLabel.hero",
	item: "game:components.modals.triggerInterruptModal.sourceKindLabel.item",
	room: "game:components.modals.triggerInterruptModal.sourceKindLabel.room",
};

const WINDOW_LABEL: Record<TriggerWindow, string> = {
	after_damage: "game:components.modals.triggerInterruptModal.windowLabel.after_damage",
	after_roll_before_result: "game:components.modals.triggerInterruptModal.windowLabel.after_roll_before_result",
	before_attack_roll: "game:components.modals.triggerInterruptModal.windowLabel.before_attack_roll",
	before_combat: "game:components.modals.triggerInterruptModal.windowLabel.before_combat",
	before_damage: "game:components.modals.triggerInterruptModal.windowLabel.before_damage",
	before_destroy: "game:components.modals.triggerInterruptModal.windowLabel.before_destroy",
	combat_end: "game:components.modals.triggerInterruptModal.windowLabel.combat_end",
	dungeon_discard: "game:components.modals.triggerInterruptModal.windowLabel.dungeon_discard",
	entity_enter_play: "game:components.modals.triggerInterruptModal.windowLabel.entity_enter_play",
	hero_action: "game:components.modals.triggerInterruptModal.windowLabel.hero_action",
	hero_leave_play: "game:components.modals.triggerInterruptModal.windowLabel.hero_leave_play",
	on_destroy: "game:components.modals.triggerInterruptModal.windowLabel.on_destroy",
	paths_open: "game:components.modals.triggerInterruptModal.windowLabel.paths_open",
	room_enter: "game:components.modals.triggerInterruptModal.windowLabel.room_enter",
	room_leave: "game:components.modals.triggerInterruptModal.windowLabel.room_leave",
	round_end: "game:components.modals.triggerInterruptModal.windowLabel.round_end",
	round_start: "game:components.modals.triggerInterruptModal.windowLabel.round_start",
	targeted: "game:components.modals.triggerInterruptModal.windowLabel.targeted",
};

function effectText(pending: PendingTriggerInterrupt): string {
	if (pending.description && pending.description !== pending.skillId) {
		return pending.description;
	}
	const sourceSkill = cardSkills(pending.sourceCardId).find(
		({ ref }) => ref.skillId === pending.skillId,
	);
	if (!sourceSkill) return getSkillName(pending.skillId);
	return renderSkillText(sourceSkill.ref);
}

function sourceText(
	pending: PendingTriggerInterrupt,
	view: PlayerView,
): string {
	const cardName = getCardName(pending.sourceCardId);
	const hero = pending.sourceHeroId
		? view.heroes.find((h) => h.id === pending.sourceHeroId)
		: null;
	const enemy = pending.sourceEnemyId
		? view.enemies.find((e) => e.id === pending.sourceEnemyId)
		: null;

	if (pending.sourceKind === "item" && hero) {
		return `${cardName}, equipado por ${getCardName(hero.cardId)}`;
	}
	if (pending.sourceKind === "artifact" && hero) {
		return `${cardName}, carregado por ${getCardName(hero.cardId)}`;
	}
	if (pending.sourceKind === "hero" && hero) return getCardName(hero.cardId);
	if (
		(pending.sourceKind === "enemy" || pending.sourceKind === "boss") &&
		enemy
	) {
		return getCardName(enemy.cardId);
	}
	return cardName;
}

export function TriggerInterruptModal() {
	const { view, dispatch } = useGameStore();
	const cardImageUrls = useCardImages();
	const [showSourceDetail, setShowSourceDetail] = useState(false);
	const submittedFor = useRef<PendingTriggerInterrupt | null>(null);
	const pending = view.pendingTriggerInterrupt;
	const sourceCard = pending ? getCardById(pending.sourceCardId) : null;
	const sourceType: CardType | null = sourceCard
		? sourceCard.type === "creature" || sourceCard.type === "subboss"
			? "enemy"
			: sourceCard.type === "subboss_room"
				? "room"
				: sourceCard.type
		: null;

	useEffect(() => {
		if (!pending) return;
		const interruptId = pending.id;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape" || showSourceDetail) return;
			if (submittedFor.current === pending) return;
			submittedFor.current = pending;
			dispatch({
				type: "SKIP_TRIGGER_INTERRUPT",
				payload: { interruptId },
			});
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [dispatch, pending, showSourceDetail]);

	if (!pending) return null;

	const activeInterrupt = pending;
	const skillName = getSkillName(activeInterrupt.skillId);
	const source = sourceText(activeInterrupt, view);
	const sourceKind = translate(SOURCE_KIND_LABEL[activeInterrupt.sourceKind]);
	const windowName = translate(WINDOW_LABEL[activeInterrupt.window]);
	const description = effectText(activeInterrupt);
	const reason = activeInterrupt.reason || `Janela ativa: ${windowName}.`;

	function apply() {
		if (submittedFor.current === activeInterrupt) return;
		submittedFor.current = activeInterrupt;
		setShowSourceDetail(false);
		dispatch({
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId: activeInterrupt.id },
		});
	}

	function skip() {
		if (submittedFor.current === activeInterrupt) return;
		submittedFor.current = activeInterrupt;
		setShowSourceDetail(false);
		dispatch({
			type: "SKIP_TRIGGER_INTERRUPT",
			payload: { interruptId: activeInterrupt.id },
		});
	}

	return (
		<>
			<div
				className="trigger-interrupt-layer"
				role="presentation"
				aria-label={translate("game:components.modals.triggerInterruptModal.ariaLabel001")}
			>
				<section
					className="trigger-interrupt-modal"
					role="dialog"
					aria-modal="true"
					aria-labelledby="trigger-interrupt-title"
				>
					<header className="trigger-interrupt-modal__header">
						<div>
							<p>{translate("game:components.modals.triggerInterruptModal.text002")}</p>
							<h1 id="trigger-interrupt-title">{skillName}</h1>
						</div>
						<span>{windowName}</span>
					</header>

					<div className="trigger-interrupt-modal__source">
						{sourceType && (
							<button
								type="button"
								className="trigger-interrupt-modal__art"
								onClick={() => setShowSourceDetail(true)}
								aria-label={`Ver carta ${source}`}
							>
								{getCardImageUrl(
									cardImageUrls,
									activeInterrupt.sourceCardId,
								) ? (
									<img
										src={getCardImageUrl(
											cardImageUrls,
											activeInterrupt.sourceCardId,
										)}
										alt=""
									/>
								) : (
									<PlaceholderArt cardType={sourceType} size="sm" />
								)}
							</button>
						)}
						<div>
							<span>{sourceKind}</span>
							<strong>{source}</strong>
						</div>
					</div>

					<div className="trigger-interrupt-modal__body">
						<section>
							<h2>{translate("game:components.modals.triggerInterruptModal.text003")}</h2>
							<p>{reason}</p>
						</section>
						<section>
							<h2>{translate("game:components.modals.triggerInterruptModal.text004")}</h2>
							<p>{description}</p>
						</section>
					</div>

					<footer className="trigger-interrupt-modal__actions">
						<button type="button" className="ornate-action" onClick={skip}>
							{translate("game:components.modals.triggerInterruptModal.text005")}{" "}</button>
						<button
							type="button"
							className="ornate-action ornate-action--primary"
							onClick={apply}
						>
							{translate("game:components.modals.triggerInterruptModal.text006")}{" "}</button>
					</footer>
				</section>
			</div>
			{showSourceDetail && sourceType && (
				<div className="trigger-interrupt-detail">
					<CardDetailModal
						cardId={activeInterrupt.sourceCardId}
						cardType={sourceType}
						imageUrl={getCardImageUrl(
							cardImageUrls,
							activeInterrupt.sourceCardId,
						)}
						onClose={() => setShowSourceDetail(false)}
					/>
				</div>
			)}
		</>
	);
}
