import type { CSSProperties } from "react";
import type { XpSpendOption } from "@/core/config/defaults";
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
		dispatch({ type: "SPEND_XP", payload: { option } });
	}

	function continuar() {
		dispatch({ type: "OPEN_PATHS" });
		onClose();
	}

	return (
		<div className="flow-modal-overlay" style={modalStyle}>
			<section
				role="dialog"
				aria-modal="true"
				aria-label="Gastar XP"
				className="flow-modal-dialog flow-modal-dialog--xp"
			>
				<header className="flow-modal-header">
					<div className="flow-modal-title">
						{logoUrl ? <img src={logoUrl} alt="" /> : null}
						<div>
							<h1>Gastar XP</h1>
							<p>Prepare o grupo antes dos próximos caminhos</p>
						</div>
					</div>
					<div className="xp-total-badge">
						{xpTokenUrl ? <img src={xpTokenUrl} alt="" /> : null}
						<span>{view.groupXp}</span>
						<small>XP</small>
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
								<strong>{opt.cost} XP</strong>
								<button
									type="button"
									className="ornate-action ornate-action--primary"
									disabled={!opt.available}
									onClick={() => spend(opt.option)}
								>
									Gastar
								</button>
							</div>
						</article>
					))}
				</div>

				<footer className="flow-modal-footer">
					<button type="button" className="ornate-action" onClick={continuar}>
						Continuar sem gastar
					</button>
				</footer>
			</section>
		</div>
	);
}

function getXpOptionHint(option: XpSpendOption) {
	switch (option) {
		case "recover_dungeon":
			return "Reembaralha o descarte da masmorra para prolongar a expedição.";
		case "level_up":
			return "Aumenta o nível de ímpeto de um herói disponível.";
		case "buy_item":
			return "Compra um item novo para a próxima organização do grupo.";
		case "lower_despertar":
			return "Reduz a pressão da masmorra antes da próxima sala.";
		case "buy_artifact":
			return "Busca um artefato para fortalecer o grupo.";
	}
}
