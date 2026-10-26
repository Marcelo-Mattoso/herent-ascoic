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
						<h1 id="main-menu-title">Ascensão Heróica</h1>
						<p>A Fornalha Sombria</p>
					</div>
					<div className="menu-brand-panel__actions">
						<button
							type="button"
							className="ornate-action ornate-action--primary"
							onClick={onNewGame}
						>
							JOGAR
						</button>
						<button
							type="button"
							className="ornate-action"
							onClick={onTutorial}
						>
							TUTORIAL
						</button>
					</div>
				</section>
			</div>
		</main>
	);
}
