import { translate } from "@/i18n";
import { type CSSProperties, useState } from "react";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardById } from "@/core/data/cards";
import { getCardImageUrl } from "@/ui/cardImages";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";

interface OpenPathsModalProps {
	onClose: () => void;
}

export function OpenPathsModal({ onClose }: OpenPathsModalProps) {
	const { view, dispatch } = useGameStore();
	const [selected, setSelected] = useState<string | null>(null);
	const [detailCardId, setDetailCardId] = useState<string | null>(null);
	const cardImageUrls = useCardImages();
	const uiAssets = useUiAssets();

	const paths = view.paths;
	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const modalStyle = {
		"--flow-modal-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--flow-modal-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;

	function confirmPath() {
		if (!selected) return;
		dispatch({ type: "CHOOSE_PATH", payload: { cardId: selected } });
		dispatch({ type: "DISCARD_PATHS" });
		dispatch({ type: "CHECK_BOSS_CONDITION" });
		onClose();
	}

	return (
		<div className="flow-modal-overlay" style={modalStyle}>
			<section
				role="dialog"
				aria-modal="true"
				aria-label={translate("game:components.modals.openPathsModal.ariaLabel001")}
				className="flow-modal-dialog flow-modal-dialog--paths"
			>
				<header className="flow-modal-header">
					<div className="flow-modal-title">
						{logoUrl ? <img src={logoUrl} alt="" /> : null}
						<div>
							<h1>{translate("game:components.modals.openPathsModal.text002")}</h1>
							<p>{translate("game:components.modals.openPathsModal.text003")}</p>
						</div>
					</div>
				</header>

				<div className="path-card-grid">
					{paths.map((cardId) => {
						const card = getCardById(cardId);
						const isSelected = selected === cardId;
						return (
							<article
								key={cardId}
								className={`path-card${isSelected ? " path-card--selected" : ""}`}
							>
								<button
									type="button"
									className="path-card__select"
									onClick={() => setSelected(cardId)}
								>
									<span className="setup-card-thumb">
										{getCardImageUrl(cardImageUrls, cardId) ? (
											<img
												src={getCardImageUrl(cardImageUrls, cardId)}
												alt=""
											/>
										) : (
											<span className="setup-card-fallback">
												{getCardName(cardId).slice(0, 1)}
											</span>
										)}
									</span>
									<span>{getCardName(cardId)}</span>
									{(card?.type === "room" || card?.type === "subboss_room") && (
										<small>
											{translate("game:components.modals.openPathsModal.text004")}{" "}{card.exits} {translate("game:components.modals.openPathsModal.text005")}{" "}{card.xp ?? 0}
										</small>
									)}
								</button>
								<button
									type="button"
									className="inventory-info-button"
									aria-label={`Informações de ${getCardName(cardId)}`}
									title={`Informações de ${getCardName(cardId)}`}
									onClick={() => setDetailCardId(cardId)}
								>
									i
								</button>
							</article>
						);
					})}
				</div>

				<footer className="flow-modal-footer">
					<button
						type="button"
						className="ornate-action ornate-action--primary"
						disabled={!selected}
						onClick={confirmPath}
					>
						{translate("game:components.modals.openPathsModal.text006")}{" "}</button>
				</footer>
			</section>

			{detailCardId ? (
				<CardDetailModal
					cardId={detailCardId}
					cardType="room"
					imageUrl={getCardImageUrl(cardImageUrls, detailCardId)}
					onClose={() => setDetailCardId(null)}
				/>
			) : null}
		</div>
	);
}
