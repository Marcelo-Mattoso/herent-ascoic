import { type CSSProperties, useState } from "react";
import { getCardLocale, getCardName } from "@/core/data/cardLocale";
import { getBoss, getHeroes } from "@/core/data/cards";
import type { BossCard, HeroCard } from "@/core/data/cardTypes";
import { getSkillLocale, getSkillName } from "@/core/data/skillLocale";
import type { Difficulty, GameMode } from "@/core/projection/playerView";
import { getCardImageUrl } from "@/ui/cardImages";
import { Modal } from "@/ui/components/Modal";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
	{
		value: "very_easy",
		label: "Muito fácil",
		hint: "Herói +2, Masmorra +0",
	},
	{
		value: "easy",
		label: "Fácil",
		hint: "Herói +1, Masmorra +0",
	},
	{
		value: "normal",
		label: "Padrão",
		hint: "Herói +0, Masmorra +0",
	},
	{
		value: "hard",
		label: "Difícil",
		hint: "Herói +0, Masmorra +1",
	},
	{
		value: "nightmare",
		label: "Pesadelo",
		hint: "Herói +0, Masmorra +2",
	},
];

interface SetupProps {
	onBack: () => void;
}

export function Setup({ onBack }: SetupProps) {
	const dispatch = useGameStore((s) => s.dispatch);
	const [difficulty, setDifficulty] = useState<Difficulty>("normal");
	const [mode, setMode] = useState<GameMode>("cooperative");
	const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
	const [heroInfoId, setHeroInfoId] = useState<string | null>(null);
	const cardImageUrls = useCardImages();
	const uiAssets = useUiAssets();

	const heroes = getHeroes();
	const boss = getBoss();
	const heroInfo = heroes.find((hero) => hero.id === heroInfoId) ?? null;
	const selectedCountLabel =
		selectedHeroes.length === 1
			? "1 herói selecionado"
			: `${selectedHeroes.length} heróis selecionados`;
	const canStart =
		selectedHeroes.length > 0 &&
		(mode === "cooperative" || selectedHeroes.length >= 2);

	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const ornateBorderUrl = getUiAssetUrl(uiAssets, "ornate-border");
	const heroIconUrl = getUiAssetUrl(uiAssets, "hero-icon");
	const monsterIconUrl = getUiAssetUrl(uiAssets, "monster-icon");
	const bossImageUrl =
		cardImageUrls.azhakardragaofornalhasombria ??
		cardImageUrls.Azhakardragaofornalhasombria ??
		(boss ? getCardImageUrl(cardImageUrls, boss.id) : undefined);

	const style = {
		"--setup-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--setup-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
		"--setup-border": ornateBorderUrl ? `url("${ornateBorderUrl}")` : undefined,
	} as CSSProperties;

	function toggleHero(id: string) {
		setSelectedHeroes((prev) => {
			if (prev.includes(id)) return prev.filter((heroId) => heroId !== id);
			if (prev.length >= 8) return prev;
			return [...prev, id];
		});
	}

	function startGame() {
		if (!canStart) return;
		dispatch({
			type: "START_GAME",
			payload: { heroCardIds: selectedHeroes, difficulty, mode },
		});
	}

	return (
		<main className="setup-screen" style={style}>
			<div className="setup-screen__vignette" />
			<header className="setup-header">
				<button type="button" className="setup-back-button" onClick={onBack}>
					Voltar
				</button>
				<div className="setup-title">
					{logoUrl ? <img src={logoUrl} alt="" /> : null}
					<div>
						<h1>Preparar Expedição</h1>
						<p>
							{selectedHeroes.length === 0
								? "Escolha seus heróis"
								: selectedCountLabel}
						</p>
					</div>
				</div>
				<button
					type="button"
					className="ornate-action ornate-action--primary setup-start-button"
					onClick={startGame}
					disabled={!canStart}
				>
					Iniciar partida
				</button>
			</header>

			<div className="setup-layout">
				<section
					className="setup-focus-card"
					aria-labelledby="setup-focus-title"
				>
					{boss ? (
						<DungeonMasterCard boss={boss} imageUrl={bossImageUrl} />
					) : null}
				</section>

				<section
					className="setup-selection-panel"
					aria-labelledby="setup-heroes-title"
				>
					<div className="setup-section-heading">
						{heroIconUrl ? <img src={heroIconUrl} alt="" /> : null}
						<div>
							<h2 id="setup-heroes-title">Heróis</h2>
							<p>1 a 8 participantes</p>
						</div>
					</div>
					<div className="setup-hero-grid">
						{heroes.map((hero) => {
							const selected = selectedHeroes.includes(hero.id);
							return (
								<article
									key={hero.id}
									className={`setup-hero-option${selected ? " setup-hero-option--selected" : ""}`}
								>
									<button
										type="button"
										className="setup-hero-select-button"
										onClick={() => toggleHero(hero.id)}
									>
										<CardThumb
											imageUrl={getCardImageUrl(cardImageUrls, hero.id)}
											name={getCardName(hero.id)}
										/>
										<span>{getCardName(hero.id)}</span>
									</button>
									<button
										type="button"
										className="setup-hero-info-button"
										aria-label={`Informações de ${getCardName(hero.id)}`}
										title={`Informações de ${getCardName(hero.id)}`}
										onClick={() => setHeroInfoId(hero.id)}
									>
										i
									</button>
								</article>
							);
						})}
					</div>
				</section>

				<aside className="setup-rules-panel">
					<div className="setup-section-heading">
						{monsterIconUrl ? <img src={monsterIconUrl} alt="" /> : null}
						<div>
							<h2>Configuração</h2>
							<p>Modo e desafio</p>
						</div>
					</div>

					<div className="setup-control-group">
						<p>Modo</p>
						<div className="setup-segmented-control">
							{(["cooperative", "competitive"] as GameMode[]).map(
								(gameMode) => (
									<button
										key={gameMode}
										type="button"
										className={mode === gameMode ? "is-selected" : undefined}
										onClick={() => setMode(gameMode)}
									>
										{gameMode === "cooperative" ? "Coop" : "Competitivo"}
									</button>
								),
							)}
						</div>
					</div>

					<div className="setup-control-group">
						<p>Dificuldade</p>
						<div className="setup-difficulty-list">
							{DIFFICULTIES.map((item) => (
								<button
									key={item.value}
									type="button"
									className={
										difficulty === item.value ? "is-selected" : undefined
									}
									onClick={() => setDifficulty(item.value)}
								>
									<span>{item.label}</span>
									<small>{item.hint}</small>
								</button>
							))}
						</div>
					</div>

					{boss ? (
						<div className="setup-boss-panel">
							<CardThumb imageUrl={bossImageUrl} name={getCardName(boss.id)} />
							<div>
								<p>Chefe final</p>
								<h3>{getCardName(boss.id)}</h3>
								<span>{getCardLocale(boss.id)?.condition}</span>
							</div>
						</div>
					) : null}
				</aside>
			</div>
			{heroInfo ? (
				<HeroStatsModal
					hero={heroInfo}
					imageUrl={getCardImageUrl(cardImageUrls, heroInfo.id)}
					onClose={() => setHeroInfoId(null)}
				/>
			) : null}
		</main>
	);
}

function DungeonMasterCard({
	boss,
	imageUrl,
}: {
	boss: BossCard;
	imageUrl?: string;
}) {
	const locale = getCardLocale(boss.id);

	return (
		<div className="setup-dungeon-master">
			<div className="setup-dungeon-master__image">
				{imageUrl ? (
					<img src={imageUrl} alt={getCardName(boss.id)} />
				) : (
					<CardFallback name={getCardName(boss.id)} />
				)}
			</div>
			<div className="setup-dungeon-master__caption">
				<p>Mestre da Masmorra</p>
				<h2 id="setup-focus-title">{getCardName(boss.id)}</h2>
				<div className="setup-dungeon-master__stats">
					<span>Vida {boss.lifeBase}</span>
					<span>Acerto +{boss.hitBonusBase}</span>
					<span>Dano {boss.damage}</span>
				</div>
				<span>{locale?.condition}</span>
			</div>
		</div>
	);
}

function HeroStatsModal({
	hero,
	imageUrl,
	onClose,
}: {
	hero: HeroCard;
	imageUrl?: string;
	onClose: () => void;
}) {
	const skillEntries = hero.skills.map((skill) => ({
		id: skill.skillId,
		name: getSkillName(skill.skillId),
		text: getSkillLocale(skill.skillId).text,
	}));

	return (
		<Modal title={getCardName(hero.id)} onClose={onClose} maxWidth={680}>
			<div className="setup-hero-modal">
				<div className="setup-hero-modal__image">
					{imageUrl ? (
						<img src={imageUrl} alt={getCardName(hero.id)} />
					) : (
						<CardFallback name={getCardName(hero.id)} />
					)}
				</div>
				<div className="setup-hero-modal__content">
					<p className="setup-hero-modal__style">
						{getCardLocale(hero.id)?.style}
					</p>
					<div className="setup-hero-modal__stats">
						<StatRow label="Vida" values={hero.life} />
						<StatRow label="Acerto" values={hero.hitBonus} prefix="+" />
						<StatRow label="Dados" values={hero.diceByColor} />
						<div className="setup-hero-modal__damage">
							<span>Dano</span>
							<strong>{hero.damage}</strong>
						</div>
					</div>
					<div className="setup-hero-modal__skills">
						{skillEntries.map((skill) => (
							<div key={skill.id}>
								<h3>{skill.name}</h3>
								<p>{skill.text ?? skill.id}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</Modal>
	);
}

function StatRow({
	label,
	values,
	prefix = "",
}: {
	label: string;
	values: readonly number[];
	prefix?: string;
}) {
	return (
		<div className="setup-hero-modal__stat-row">
			<span>{label}</span>
			{values.map((value, index) => (
				<strong key={`${label}-${index}`}>{`${prefix}${value}`}</strong>
			))}
		</div>
	);
}

function CardThumb({ imageUrl, name }: { imageUrl?: string; name: string }) {
	return (
		<span className="setup-card-thumb">
			{imageUrl ? <img src={imageUrl} alt="" /> : <CardFallback name={name} />}
		</span>
	);
}

function CardFallback({ name }: { name: string }) {
	return <span className="setup-card-fallback">{name.slice(0, 1)}</span>;
}
