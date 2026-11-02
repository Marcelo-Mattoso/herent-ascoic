import type { CSSProperties } from "react";
import { translate } from "@/i18n";
import type { PlayerView } from "@/core/projection/playerView";
import { useEndingMusic } from "@/ui/audio/useEndingMusic";
import type { CardImageUrls } from "@/ui/cardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";
import { EndHeroRoster } from "./EndHeroRoster";
import { endLevelColorName } from "./endLevelColor";

interface DefeatProps {
	imageUrls: CardImageUrls;
	previewView?: PlayerView;
	onPlayAgain: () => void;
	onMenu: () => void;
}

export function Defeat({ imageUrls, previewView, onPlayAgain, onMenu }: DefeatProps) {
	useEndingMusic("defeat");
	const { view: liveView } = useGameStore();
	const view = previewView ?? liveView;
	const uiAssets = useUiAssets();
	const hero = view.heroes[0];
	const deathReason = hero && hero.currentLife <= 0
		? translate("game:screens.defeat.reason.heroEliminated")
		: view.decks.dungeonDeck.available === 0
			? translate("game:screens.defeat.reason.dungeonExhausted")
			: translate("game:screens.defeat.reason.boss");
	const logoUrl = getUiAssetUrl(uiAssets, "logo-completa") ?? getUiAssetUrl(uiAssets, "newlogo");
	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const style = {
		"--end-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--end-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;
	const stats: [string, string | number][] = [
		[translate("game:screens.defeat.stats.rooms"), view.roomsCleared],
		[translate("game:screens.defeat.stats.creatures"), view.creaturesDefeated],
		[translate("game:screens.defeat.stats.boss"), view.bossCardName],
		[translate("game:screens.defeat.stats.xp"), view.groupXp],
		[translate("game:screens.defeat.stats.artifacts"), view.groupArtifacts.length],
		[translate("game:screens.defeat.stats.heroLevel"), hero ? endLevelColorName(hero.impeto) : "—"],
		[translate("game:screens.defeat.stats.dungeonLevel"), endLevelColorName(view.despertar)],
	];

	return (
		<main className="end-screen end-screen--defeat" style={style}>
			<div className="end-screen__vignette" />
			<section className="end-card" aria-labelledby="defeat-title">
				<header className="end-card__header">
					<div className="end-card__sigil" aria-hidden="true">◆</div>
					<div className="end-card__heading">
						<p className="end-card__kicker">{translate("game:screens.defeat.text002")}</p>
						<h1 id="defeat-title">{translate("game:screens.defeat.text003")}</h1>
						<p className="end-card__subtitle">{translate("game:screens.defeat.text004")}</p>
					</div>
					{logoUrl && <img src={logoUrl} alt="" className="end-card__logo" />}
				</header>

				<div className="end-card__body">
					<div className="end-card__story">
						<div className="end-card__result">
							<p>{translate("game:screens.defeat.text005")}</p>
							<strong>{deathReason}</strong>
						</div>
						<EndHeroRoster heroes={view.heroes} imageUrls={imageUrls} title={translate("game:screens.defeat.rosterTitle")} />
					</div>
					<div className="end-card__journey">
						<p className="end-card__section-title">{translate("game:screens.defeat.journeyTitle")}</p>
						<div className="end-card__stats">
							{stats.map(([label, value]) => <div key={label} className="end-card__stat"><span>{label}</span><strong>{value}</strong></div>)}
						</div>
					</div>
				</div>

				<footer className="end-card__actions">
					<button type="button" className="ornate-action ornate-action--primary" onClick={onPlayAgain}>{translate("game:screens.defeat.text006")}</button>
					<button type="button" className="ornate-action" onClick={onMenu}>{translate("game:screens.defeat.text007")}</button>
				</footer>
			</section>
		</main>
	);
}
