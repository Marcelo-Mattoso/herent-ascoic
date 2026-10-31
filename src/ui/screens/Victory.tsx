import type { CSSProperties } from "react";
import { translate } from "@/i18n";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import type { PlayerView } from "@/core/projection/playerView";
import { useEndingMusic } from "@/ui/audio/useEndingMusic";
import type { CardImageUrls } from "@/ui/cardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";
import { EndHeroRoster } from "./EndHeroRoster";
import { endLevelColorName } from "./endLevelColor";

interface VictoryProps {
	imageUrls: CardImageUrls;
	previewView?: PlayerView;
	onPlayAgain: () => void;
	onMenu: () => void;
}

export function Victory({ imageUrls, previewView, onPlayAgain, onMenu }: VictoryProps) {
	useEndingMusic("victory");
	const { view: liveView } = useGameStore();
	const view = previewView ?? liveView;
	const uiAssets = useUiAssets();
	const hero = view.heroes[0];
	const isCompetitive = view.mode === "competitive";
	const winner = view.winner;
	const logoUrl = getUiAssetUrl(uiAssets, "logo-completa") ?? getUiAssetUrl(uiAssets, "newlogo");
	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const style = {
		"--end-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--end-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;
	const stats: [string, string | number][] = [
		[translate("game:screens.victory.dynamic004"), view.roomsCleared],
		[translate("game:screens.victory.dynamic005"), view.creaturesDefeated],
		[translate("game:screens.victory.dynamic006"), view.groupArtifacts.length],
		...(isCompetitive ? [] : [[translate("game:screens.victory.dynamic007"), view.groupXp] as [string, number]]),
		[translate("game:screens.victory.dynamic008"), hero ? endLevelColorName(hero.impeto) : "—"],
		[translate("game:screens.victory.dynamic009"), endLevelColorName(view.despertar)],
	];

	return (
		<main className="end-screen end-screen--victory" style={style}>
			<div className="end-screen__vignette" />
			<section className="end-card" aria-labelledby="victory-title">
				<header className="end-card__header">
					<div className="end-card__sigil" aria-hidden="true">✦</div>
					<div className="end-card__heading">
						<p className="end-card__kicker">{translate("game:screens.victory.kicker")}</p>
						<h1 id="victory-title">{isCompetitive && winner ? translate("game:screens.victory.winnerTitle", { winner }) : translate("game:screens.victory.dynamic001")}</h1>
						<p className="end-card__subtitle">{isCompetitive && winner ? translate("game:screens.victory.winnerDescription", { winner }) : translate("game:screens.victory.dynamic002")}</p>
					</div>
					{logoUrl && <img src={logoUrl} alt="" className="end-card__logo" />}
				</header>

				<div className="end-card__body">
					<div className="end-card__story">
						<div className="end-card__result">
							<p>{translate("game:screens.victory.dynamic003")}</p>
							<strong>{view.bossCardName}</strong>
						</div>
						<EndHeroRoster heroes={view.heroes} imageUrls={imageUrls} title={translate("game:screens.victory.rosterTitle")} />
					</div>
					<div className="end-card__journey">
						<p className="end-card__section-title">{translate("game:screens.victory.journeyTitle")}</p>
						<div className="end-card__stats">
							{stats.map(([label, value]) => <div key={label} className="end-card__stat"><span>{label}</span><strong>{value}</strong></div>)}
							{isCompetitive && view.heroes.map((h) => (
								<div key={h.id} className="end-card__stat">
									<span>{translate("game:screens.victory.text001")} {getCardName(h.cardId)} (J{h.playerIndex + 1})</span>
									<strong>{h.xp}</strong>
								</div>
							))}
						</div>
					</div>
				</div>

				<footer className="end-card__actions">
					<button type="button" className="ornate-action ornate-action--primary" onClick={onPlayAgain}>{translate("game:screens.victory.retry")}</button>
					<button type="button" className="ornate-action" onClick={onMenu}>{translate("game:screens.victory.menu")}</button>
				</footer>
			</section>
		</main>
	);
}
