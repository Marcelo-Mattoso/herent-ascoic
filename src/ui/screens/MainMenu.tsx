import type { CSSProperties } from "react";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { getUiAssetUrl } from "@/ui/uiAssets";

interface MainMenuProps {
	onNewGame: () => void;
}

export function MainMenu({ onNewGame }: MainMenuProps) {
	const uiAssets = useUiAssets();
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const cardUrl = getUiAssetUrl(uiAssets, "newcard");
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
				<div className="menu-brand-shell__art" aria-hidden="true">
					{cardUrl ? (
						<img src={cardUrl} alt="" className="menu-brand-shell__card" />
					) : (
						<div className="menu-brand-shell__card-fallback" />
					)}
				</div>

				<section className="menu-brand-panel" aria-labelledby="main-menu-title">
					{logoUrl ? (
						<img
							src={logoUrl}
							alt="Ascensão Heróica"
							className="menu-brand-panel__logo"
						/>
					) : null}
					<div className="menu-brand-panel__title-block">
						<h1 id="main-menu-title">Ascensão Heróica</h1>
						<p>Fornalha Sombria</p>
					</div>
					<div className="menu-brand-panel__actions">
						<button
							type="button"
							className="ornate-action ornate-action--primary"
							onClick={onNewGame}
						>
							Nova partida
						</button>
						<button type="button" className="ornate-action" disabled>
							Biblioteca
						</button>
						<button type="button" className="ornate-action" disabled>
							Configurações
						</button>
					</div>
				</section>
			</div>
			<p className="menu-version">MVP 1 · v0.9.132</p>
		</main>
	);
}
