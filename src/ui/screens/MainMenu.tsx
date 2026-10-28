import { translate } from "@/i18n";
import type { CSSProperties } from "react";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { getUiAssetUrl } from "@/ui/uiAssets";

interface MainMenuProps {
	onNewGame: () => void;
	onTutorial: () => void;
}

export function MainMenu({ onNewGame, onTutorial }: MainMenuProps) {
	const uiAssets = useUiAssets();
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");

	const style = {
		"--menu-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--menu-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;

	return (
		<main className="menu-screen" style={style}>
			<div className="menu-screen__vignette" />
			<div className="menu-brand-shell">
				<section className="menu-brand-panel" aria-labelledby="main-menu-title">
					{logoUrl ? (
						<img src={logoUrl} alt="" className="menu-brand-panel__logo" />
					) : null}
					<div className="menu-brand-panel__title-block">
						<h1 id="main-menu-title">{translate("common:screens.mainMenu.text001")}</h1>
					</div>
					<div className="menu-brand-panel__actions">
						<button
							type="button"
							className="ornate-action ornate-action--primary"
							onClick={onNewGame}
						>
							{translate("common:screens.mainMenu.text003")}{" "}</button>
						<button
							type="button"
							className="ornate-action"
							onClick={onTutorial}
						>
							{translate("common:screens.mainMenu.text004")}{" "}</button>
					</div>
				</section>
			</div>
		</main>
	);
}
