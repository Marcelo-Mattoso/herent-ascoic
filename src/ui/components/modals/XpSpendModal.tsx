import { translate } from "@/i18n";
import { useState, type CSSProperties } from "react";
import type { XpSpendOption } from "@/core/config/defaults";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { selectXpSpendOptions } from "@/ui/store/selectors";
import { getUiAssetUrl } from "@/ui/uiAssets";

interface XpSpendModalProps {
	onClose: () => void;
}

export function XpSpendModal({ onClose }: XpSpendModalProps) {
	const { view, dispatch } = useGameStore();
	const options = selectXpSpendOptions(view);
	const uiAssets = useUiAssets();
	const [isChoosingLevelTarget, setIsChoosingLevelTarget] = useState(false);
	const levelEligibleHeroes = view.heroes.filter(
		(hero) => hero.status === "active" && hero.impeto < 4,
	);

	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const xpTokenUrl = getUiAssetUrl(uiAssets, "xp-token");
	const modalStyle = {
		"--flow-modal-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--flow-modal-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;

	function spend(option: XpSpendOption) {
		if (option === "level_up") {
			setIsChoosingLevelTarget(true);
			return;
		}
		dispatch({ type: "SPEND_XP", payload: { option } });
	}

	function levelUp(heroId: string) {
		dispatch({ type: "SPEND_XP", payload: { option: "level_up", heroId } });
		setIsChoosingLevelTarget(false);
	}

	function continuar() {
		dispatch({ type: "CHECK_BOSS_CONDITION" });
		onClose();
	}

	return (
		<div className="flow-modal-overlay" style={modalStyle}>
			<section
				role="dialog"
				aria-modal="true"
				aria-label={translate("game:components.modals.xpSpendModal.ariaLabel001")}
				className="flow-modal-dialog flow-modal-dialog--xp"
			>
				<header className="flow-modal-header">
					<div className="flow-modal-title">
						{logoUrl ? <img src={logoUrl} alt="" /> : null}
						<div>
							<h1>{translate("game:components.modals.xpSpendModal.text002")}</h1>
							<p>{translate("game:components.modals.xpSpendModal.text003")}</p>
						</div>
					</div>
					<div className="xp-total-badge">
						{xpTokenUrl ? <img src={xpTokenUrl} alt="" /> : null}
						<span>{view.groupXp}</span>
						<small>{translate("game:components.modals.xpSpendModal.text004")}</small>
					</div>
				</header>

				<div className="xp-option-grid">
					{options.map((opt) => (
						<article
							key={opt.option}
							className={`xp-option-card${opt.available ? "" : " xp-option-card--disabled"}`}
						>
							<div>
								<h2>{opt.label}</h2>
								<p>{getXpOptionHint(opt.option)}</p>
								{!opt.available && opt.reason ? (
									<span>{opt.reason}</span>
								) : null}
							</div>
							<div className="xp-option-card__footer">
								<strong>{opt.cost} {translate("game:components.modals.xpSpendModal.text005")}</strong>
								<button
									type="button"
									className="ornate-action ornate-action--primary"
									disabled={!opt.available}
									onClick={() =>
										opt.option === "level_up" && isChoosingLevelTarget
											? setIsChoosingLevelTarget(false)
											: spend(opt.option)
									}
								>
									{opt.option === "level_up" && isChoosingLevelTarget
										? "Cancelar"
										: opt.option === "level_up"
											? "Escolher"
											: "Gastar"}
								</button>
							</div>
							{opt.option === "level_up" && isChoosingLevelTarget ? (
								<div className="xp-level-choice">
									<p>{translate("game:components.modals.xpSpendModal.text006")}</p>
									<div className="xp-level-choice__grid">
										{levelEligibleHeroes.map((hero) => (
											<button
												key={hero.id}
												type="button"
												className="xp-level-choice__hero"
												onClick={() => levelUp(hero.id)}
											>
												<strong>{getCardName(hero.cardId)}</strong>
												<span>{translate("game:components.modals.xpSpendModal.text007")}{" "}{hero.impeto + 1} → {hero.impeto + 2}</span>
											</button>
										))}
									</div>
								</div>
							) : null}
						</article>
					))}
				</div>

				<footer className="flow-modal-footer">
					<button type="button" className="ornate-action" onClick={continuar}>
						{translate("game:components.modals.xpSpendModal.text008")}{" "}</button>
				</footer>
			</section>
		</div>
	);
}

function getXpOptionHint(option: XpSpendOption) {
	switch (option) {
		case "recover_dungeon":
			return translate("game:components.modals.xpSpendModal.recoverDungeonHint");
		case "level_up":
			return translate("game:components.modals.xpSpendModal.levelUpHint");
		case "buy_item":
			return translate("game:components.modals.xpSpendModal.buyItemHint");
		case "lower_despertar":
			return translate("game:components.modals.xpSpendModal.lowerDespertarHint");
		case "buy_artifact":
			return translate("game:components.modals.xpSpendModal.buyArtifactHint");
	}
}
