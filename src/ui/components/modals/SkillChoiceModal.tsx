// Decisão contextual de habilidade: mostra origem, efeito e cartas/opções disponíveis.

import { useMemo, useState } from "react";
import { getCardName } from "@/core/data/cardLocale";
import { getCardById } from "@/core/data/cards";
import { getSkillName } from "@/core/data/skillLocale";
import { cardSkills, skillUsedBy } from "@/core/skills/lookup";
import { renderSkillText } from "@/core/skills/renderLabel";
import type { GameState } from "@/core/state/gameState";
import { getCardImageUrl } from "@/ui/cardImages";
import type { CardType } from "@/ui/components/Card";
import { ActionButton } from "@/ui/components/ActionButton";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { Modal } from "@/ui/components/Modal";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useGameStore } from "@/ui/store/gameStore";

function cardTypeForModal(cardId: string): CardType | null {
	const card = getCardById(cardId);
	if (!card) return null;
	if (card.type === "creature" || card.type === "subboss") return "enemy";
	if (card.type === "subboss_room") return "room";
	return card.type;
}

function sourceCardId(
	state: GameState,
	pending: NonNullable<GameState["pendingSkillChoice"]>,
): string | null {
	const usedBy = skillUsedBy(pending.skillId);
	const hero = pending.sourceHeroId
		? state.heroes.find((candidate) => candidate.id === pending.sourceHeroId)
		: undefined;
	const carriedCards = hero
		? [hero.cardId, ...Object.values(hero.activeItems), ...hero.backpack]
		: [];
	return carriedCards.find(
		(cardId): cardId is string => !!cardId && usedBy.includes(cardId),
	) ?? usedBy[0] ?? null;
}

export function SkillChoiceModal() {
	const { state, view, dispatch } = useGameStore();
	const cardImageUrls = useCardImages();
	const [detailCardId, setDetailCardId] = useState<string | null>(null);
	const pending = view.pendingSkillChoice;
	const choiceKind = state.pendingSkillChoice?.kind;
	const sourceId = useMemo(
		() => (pending ? sourceCardId(state, pending) : null),
		[pending, state],
	);

	if (!pending) return null;

	const sourceSkill = sourceId
		? cardSkills(sourceId).find(({ ref }) => ref.skillId === pending.skillId)
		: undefined;
	const effectText = sourceSkill
		? renderSkillText(sourceSkill.ref)
		: pending.prompt;
	const sourceType = sourceId ? cardTypeForModal(sourceId) : null;

	function choose(choiceId: string) {
		if (!pending) return;
		dispatch({
			type: "SKILL_CHOICE",
			payload: { skillId: pending.skillId, choice: choiceId },
		});
	}

	function discard(cardId: string) {
		choose(`__discard__:${cardId}`);
	}

	return (
		<>
			<Modal title={getSkillName(pending.skillId)} maxWidth={560}>
				<div className="space-y-4">
					<section className="skill-choice-effect">
						<p>Habilidade ativada</p>
						<strong>{effectText}</strong>
					</section>

					{sourceId && sourceType && (
						<section className="skill-choice-source">
							<div className="skill-choice-source__art">
								{getCardImageUrl(cardImageUrls, sourceId) ? (
									<img src={getCardImageUrl(cardImageUrls, sourceId)} alt="" />
								) : (
									<PlaceholderArt cardType={sourceType} size="sm" />
								)}
							</div>
							<div>
								<p>Origem</p>
								<strong>{getCardName(sourceId)}</strong>
							</div>
							<button type="button" onClick={() => setDetailCardId(sourceId)} aria-label={`Ver carta completa: ${getCardName(sourceId)}`}>i</button>
						</section>
					)}

					<section>
						<p className="skill-choice-prompt">{pending.prompt}</p>
						<div className="skill-choice-options">
							{pending.options.map((option) => {
								const optionType = cardTypeForModal(option.id);
								const optionIsCard = !!optionType;
								return (
									<div key={option.id} className="skill-choice-option">
										{optionIsCard && (
											<button type="button" className="skill-choice-option__art" onClick={() => setDetailCardId(option.id)} aria-label={`Ver carta completa: ${getCardName(option.id)}`}>
												{getCardImageUrl(cardImageUrls, option.id) ? (
													<img src={getCardImageUrl(cardImageUrls, option.id)} alt="" />
												) : (
													<PlaceholderArt cardType={optionType} size="sm" />
												)}
											</button>
										)}
										<div className="skill-choice-option__text">
											<strong>{optionIsCard ? getCardName(option.id) : option.label}</strong>
											{optionIsCard && <span>{option.label}</span>}
										</div>
										{optionIsCard && choiceKind === "draw_and_choose" ? (
											<div className="skill-choice-option__actions">
												<ActionButton label="Guardar" variant="primary" onClick={() => choose(option.id)} />
												<ActionButton label="Descartar" variant="secondary" onClick={() => discard(option.id)} />
											</div>
										) : (
											<ActionButton label={optionIsCard ? "Usar" : "Escolher"} variant="primary" onClick={() => choose(option.id)} />
										)}
									</div>
								);
							})}
						</div>
					</section>

					<ActionButton label="Passar esta habilidade" variant="secondary" fullWidth onClick={() => choose("__skip__")} />
				</div>
			</Modal>

			{detailCardId && cardTypeForModal(detailCardId) && (
				<CardDetailModal cardId={detailCardId} cardType={cardTypeForModal(detailCardId)!} imageUrl={getCardImageUrl(cardImageUrls, detailCardId)} onClose={() => setDetailCardId(null)} />
			)}
		</>
	);
}
