import { translate } from "@/i18n";
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
			? translate("game:screens.defeat.reason.heroEliminated")
			: view.decks.dungeonDeck.available === 0
				? translate("game:screens.defeat.reason.dungeonExhausted")
				: translate("game:screens.defeat.reason.boss");
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
		[translate("game:screens.defeat.stats.reason"), deathReason],
		[translate("game:screens.defeat.stats.rooms"), view.roomsCleared],
		[translate("game:screens.defeat.stats.creatures"), view.creaturesDefeated],
		[translate("game:screens.defeat.stats.boss"), view.bossCardName],
		[translate("game:screens.defeat.stats.xp"), view.groupXp],
		[translate("game:screens.defeat.stats.artifacts"), view.groupArtifacts.length],
	];

	return (
		<main className="end-screen end-screen--defeat" style={style}>
			<div className="end-screen__vignette" />
			<section className="end-card" aria-labelledby="defeat-title">
				<header className="end-card__header">
					{logoUrl ? (
						<img
							src={logoUrl}
							alt={translate("game:screens.defeat.alt001")}
							className="end-card__logo"
						/>
					) : null}
					<div>
						<p className="end-card__kicker">{translate("game:screens.defeat.text002")}</p>
						<h1 id="defeat-title">{translate("game:screens.defeat.text003")}</h1>
						<span>{translate("game:screens.defeat.text004")}</span>
					</div>
				</header>

				<div className="end-card__reason">
					{monsterIconUrl ? <img src={monsterIconUrl} alt="" /> : null}
					<div>
						<p>{translate("game:screens.defeat.text005")}</p>
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
						{translate("game:screens.defeat.text006")}{" "}</button>
					<button type="button" className="ornate-action" onClick={reset}>
						{translate("game:screens.defeat.text007")}{" "}</button>
				</footer>
			</section>
		</main>
	);
}
