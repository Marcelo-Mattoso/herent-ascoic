import { translate } from "@/i18n";
// Escolha contextual: a arte abre detalhes, e apenas os botões confirmam.
import { useRef, useState } from "react";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardById } from "@/core/data/cards";
import { displaySkillName as getSkillName } from "@/i18n/catalogs";
import { skillsOf } from "@/core/gameEngine";
import { uiEngine } from "@/ui/engine";
import { renderSkillText } from "@/core/skills/renderLabel";
import type { PlayerView } from "@/core/projection/playerView";
import { getCardImageUrl } from "@/ui/cardImages";
import { ActionButton } from "@/ui/components/ActionButton";
import type { CardType } from "@/ui/components/Card";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { Modal } from "@/ui/components/Modal";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useGameStore } from "@/ui/store/gameStore";

type PendingChoice = NonNullable<PlayerView["pendingSkillChoice"]>;

function cardTypeForModal(cardId: string): CardType | null {
	const card = getCardById(cardId);
	if (!card) return null;
	if (card.type === "creature" || card.type === "subboss") return "enemy";
	if (card.type === "subboss_room") return "room";
	return card.type;
}

export function SkillChoiceModal() {
	const { view, dispatch } = useGameStore();
	const cardImageUrls = useCardImages();
	const [detailCardId, setDetailCardId] = useState<string | null>(null);
	const submittedFor = useRef<PendingChoice | null>(null);
	const pending = view.pendingSkillChoice;
	if (!pending) return null;

	const sourceId = pending.resolvedSourceCardId;
	const sourceSkill = sourceId
		? skillsOf(uiEngine, sourceId).find(({ ref }) => ref.skillId === pending.skillId)
		: undefined;
	const sourceType = sourceId ? cardTypeForModal(sourceId) : null;
	const cardOptions = pending.options.map((option) => ({
		option,
		cardId: option.cardId,
	}));
	const hasCards = cardOptions.some(({ cardId }) => !!cardId);
	const detailType = detailCardId ? cardTypeForModal(detailCardId) : null;

	function choose(choiceId: string) {
		// A store despacha sincronamente, mas dois cliques podem chegar antes do novo render.
		if (!pending) return;
		if (submittedFor.current === pending) return;
		submittedFor.current = pending;
		dispatch({
			type: "SKILL_CHOICE",
			payload: { skillId: pending.skillId, choice: choiceId },
		});
	}

	return (
		<>
			<Modal title={getSkillName(pending.skillId)} maxWidth={760}>
				<div className="skill-choice-layout">
					{sourceSkill && (
						<section className="skill-choice-effect">
							<p>{translate("game:components.modals.skillChoiceModal.text001")}</p>
							<strong>{renderSkillText(uiEngine, sourceSkill.ref)}</strong>
						</section>
					)}
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
								<p>{translate("game:components.modals.skillChoiceModal.text002")}</p>
								<strong>{getCardName(sourceId)}</strong>
							</div>
							<button
								type="button"
								onClick={() => setDetailCardId(sourceId)}
								aria-label={`Examinar carta de origem: ${getCardName(sourceId)}`}
							>
								{translate("game:components.modals.skillChoiceModal.text003")}{" "}</button>
						</section>
					)}
					<section>
						<p className="skill-choice-prompt">{pending.prompt}</p>
						<div
							className={
								hasCards
									? "skill-choice-options skill-choice-options--cards"
									: "skill-choice-options skill-choice-options--text"
							}
						>
							{cardOptions.map(({ option, cardId }) => {
								const cardType = cardId ? cardTypeForModal(cardId) : null;
								if (!cardId || !cardType) {
									return (
										<div
											key={option.id}
											className="skill-choice-option skill-choice-option--text"
										>
											<span>{option.label}</span>
											<ActionButton
												label="Escolher"
												variant="primary"
												onClick={() => choose(option.id)}
											/>
										</div>
									);
								}
								const imageUrl = getCardImageUrl(cardImageUrls, cardId);
								return (
									<article
										key={option.id}
										className="skill-choice-option skill-choice-option--card"
									>
										<button
											type="button"
											className="skill-choice-option__art"
											onClick={() => setDetailCardId(cardId)}
											aria-label={`Examinar carta: ${getCardName(cardId)}`}
										>
											{imageUrl ? (
												<img src={imageUrl} alt={getCardName(cardId)} />
											) : (
												<PlaceholderArt cardType={cardType} size="lg" />
											)}
										</button>
										<strong className="skill-choice-option__name">
											{getCardName(cardId)}
										</strong>
										<div className="skill-choice-option__actions">
											{pending.kind === "draw_and_choose" ? (
												<>
													<ActionButton
														label="Guardar"
														variant="primary"
														onClick={() => choose(option.id)}
													/>
													<ActionButton
														label="Descartar"
														variant="secondary"
														onClick={() => choose(`__discard__:${option.id}`)}
													/>
												</>
											) : (
												<ActionButton
													label="Escolher"
													variant="primary"
													onClick={() => choose(option.id)}
												/>
											)}
										</div>
									</article>
								);
							})}
						</div>
					</section>
					{pending.allowSkip && (
						<ActionButton
							label="Passar esta habilidade"
							variant="secondary"
							fullWidth
							onClick={() => choose("__skip__")}
						/>
					)}
				</div>
			</Modal>
			{detailCardId && detailType && (
				<CardDetailModal
					cardId={detailCardId}
					cardType={detailType}
					imageUrl={getCardImageUrl(cardImageUrls, detailCardId)}
					onClose={() => setDetailCardId(null)}
				/>
			)}
		</>
	);
}
