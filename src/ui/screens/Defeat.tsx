import type { CSSProperties } from "react";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";

export function Defeat() {
	const { view, reset } = useGameStore();
	const uiAssets = useUiAssets();
	const hero = view.heroes[0];

	const deathReason =
		hero && hero.currentLife <= 0
			? "Herói eliminado em combate"
			: view.decks.dungeonDeck.available === 0
				? "Deck de dungeon esgotado"
				: "Derrota pelo boss";
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const monsterIconUrl = getUiAssetUrl(uiAssets, "monster-icon");
	const style = {
		"--end-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--end-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;
	const stats: [string, string | number][] = [
		["Motivo", deathReason],
		["Salas exploradas", view.roomsCleared],
		["Criaturas derrotadas", view.creaturesDefeated],
		["Chefe escolhido", view.bossCardName],
		["XP obtido", view.groupXp],
		["Artefatos encontrados", view.groupArtifacts.length],
	];

	return (
		<main className="end-screen end-screen--defeat" style={style}>
			<div className="end-screen__vignette" />
			<section className="end-card" aria-labelledby="defeat-title">
				<header className="end-card__header">
					{logoUrl ? (
						<img
							src={logoUrl}
							alt="Ascensão Heróica"
							className="end-card__logo"
						/>
					) : null}
					<div>
						<p className="end-card__kicker">Expedição encerrada</p>
						<h1 id="defeat-title">Derrota</h1>
						<span>A masmorra consumiu os heróis.</span>
					</div>
				</header>

				<div className="end-card__reason">
					{monsterIconUrl ? <img src={monsterIconUrl} alt="" /> : null}
					<div>
						<p>Motivo da queda</p>
						<strong>{deathReason}</strong>
					</div>
				</div>

				<div className="end-card__stats">
					{stats.map(([label, value]) => (
						<div key={label} className="end-card__stat">
							<span>{label}</span>
							<strong>{value}</strong>
						</div>
					))}
				</div>

				<footer className="end-card__actions">
					<button
						type="button"
						className="ornate-action ornate-action--primary"
						onClick={reset}
					>
						Tentar novamente
					</button>
					<button type="button" className="ornate-action" onClick={reset}>
						Voltar ao menu
					</button>
				</footer>
			</section>
		</main>
	);
}
