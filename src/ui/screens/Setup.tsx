import { translate } from "@/i18n";
import { type CSSProperties, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { displayCardLocale as getCardLocale, displayCardName as getCardName } from "@/i18n/catalogs";
import { getBoss, getHeroes } from "@/core/data/cards";
import type { BossCard, HeroCard } from "@/core/data/cardTypes";
import { displaySkillLocale as getSkillLocale, displaySkillName as getSkillName } from "@/i18n/catalogs";
import type { Difficulty, GameMode } from "@/core/projection/playerView";
import { MAX_HEROES } from "@/core/state/gameState";
import { getCardImageUrl } from "@/ui/cardImages";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { getUiAssetUrl } from "@/ui/uiAssets";

const DIFFICULTIES: Difficulty[] = ["very_easy", "easy", "normal", "hard", "nightmare"];

interface SetupProps {
	onBack: () => void;
	tutorialSeed?: number;
	deferInitialRoomReveal?: boolean;
	onSelectionChange?: (ids: string[]) => void;
}

export function Setup({
	onBack,
	tutorialSeed,
	deferInitialRoomReveal = false,
	onSelectionChange,
}: SetupProps) {
	const dispatch = useGameStore((s) => s.dispatch);
	const [difficulty, setDifficulty] = useState<Difficulty>("normal");
	const [mode, setMode] = useState<GameMode>("cooperative");
	const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
	const [heroInfoId, setHeroInfoId] = useState<string | null>(null);
	const [bossInfoOpen, setBossInfoOpen] = useState(false);
	const cardImageUrls = useCardImages();
	const uiAssets = useUiAssets();

	const heroes = getHeroes();
	const boss = getBoss();
	const heroInfo = heroes.find((hero) => hero.id === heroInfoId) ?? null;
	const selectedCountLabel = translate("game:screens.setup.selectedHeroes", { count: selectedHeroes.length });
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
	const diceIconUrl = getUiAssetUrl(uiAssets, "dice-token");
	const bossImageUrl =
		cardImageUrls.azhakardragaofornalhasombria ??
		cardImageUrls.Azhakardragaofornalhasombria ??
		(boss ? getCardImageUrl(cardImageUrls, boss.id) : undefined);

	const style = {
		"--setup-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--setup-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
		"--setup-border": ornateBorderUrl ? `url("${ornateBorderUrl}")` : undefined,
	} as CSSProperties;
	const modalStyle = {
		"--flow-modal-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--flow-modal-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;

	function toggleHero(id: string) {
		if (!selectedHeroes.includes(id) && selectedHeroes.length >= MAX_HEROES)
			return;
		const next = selectedHeroes.includes(id)
			? selectedHeroes.filter((heroId) => heroId !== id)
			: [...selectedHeroes, id];
		setSelectedHeroes(next);
		onSelectionChange?.(next);
	}

	function startGame() {
		if (!canStart) return;
		const seedValues = new Uint32Array(1);
		globalThis.crypto?.getRandomValues?.(seedValues);
		const seed = tutorialSeed ?? (seedValues[0] || Date.now());
		dispatch({
			type: "START_GAME",
			payload: {
				heroCardIds: selectedHeroes,
				difficulty,
				mode,
				seed,
				...(deferInitialRoomReveal ? { deferInitialRoomReveal: true } : {}),
			},
		});
	}

	return (
		<main className="setup-screen" style={style}>
			<div className="setup-screen__vignette" />
			<header className="setup-header">
				<button type="button" className="setup-back-button" onClick={onBack}>
					{translate("game:screens.setup.text001")}{" "}</button>
				<div className="setup-title">
					{logoUrl ? <img src={logoUrl} alt="" /> : null}
					<div>
						<h1>{translate("game:screens.setup.text002")}</h1>
						<p data-tutorial-anchor="setup.selected-heroes">
							{selectedHeroes.length === 0
								? translate("game:screens.setup.dynamic001")
								: selectedCountLabel}
						</p>
					</div>
				</div>
				<div className="setup-header-spacer" aria-hidden="true" />
			</header>

			<div className="setup-layout">
				<section
					className="setup-focus-card"
					aria-labelledby="setup-focus-title"
				>
					{boss ? (
						<DungeonMasterCard
							boss={boss}
							imageUrl={bossImageUrl}
							iconUrl={monsterIconUrl}
							onInfo={() => setBossInfoOpen(true)}
						/>
					) : null}
				</section>

				<section
					className="setup-selection-panel"
					aria-labelledby="setup-heroes-title"
				>
					<div className="setup-section-heading">
						{heroIconUrl ? <img src={heroIconUrl} alt="" /> : null}
						<div>
							<h2 id="setup-heroes-title">{translate("game:screens.setup.text003")}</h2>
							<p>{translate("game:screens.setup.text004")}</p>
						</div>
					</div>
					<div
						className="setup-hero-grid"
						data-tutorial-anchor="setup.hero-selection"
					>
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
					<div className="setup-rules-panel__scroll">
						<div className="setup-section-heading">
							{diceIconUrl ? <img src={diceIconUrl} alt="" /> : null}
							<div>
								<h2>{translate("game:screens.setup.text005")}</h2>
								<p>{translate("game:screens.setup.text006")}</p>
							</div>
						</div>

						<div className="setup-control-group">
							<p>{translate("game:screens.setup.text007")}</p>
							<div className="setup-segmented-control">
								{(["cooperative", "competitive"] as GameMode[]).map(
									(gameMode) => (
										<button
											key={gameMode}
											type="button"
											className={mode === gameMode ? "is-selected" : undefined}
											onClick={() => setMode(gameMode)}
										>
											{translate(`game:screens.setup.mode.${gameMode}`)}
										</button>
									),
								)}
							</div>
						</div>

						<div className="setup-control-group">
							<p>{translate("game:screens.setup.text008")}</p>
							<div className="setup-difficulty-list">
								{DIFFICULTIES.map((item) => (
									<button
										key={item}
										type="button"
										className={
											difficulty === item ? "is-selected" : undefined
										}
										onClick={() => setDifficulty(item)}
									>
										<span>{translate(`game:screens.setup.difficulty.${item}.label`)}</span>
										<small>{translate(`game:screens.setup.difficulty.${item}.hint`)}</small>
									</button>
								))}
							</div>
						</div>
					</div>

					<div className="setup-rules-panel__footer">
						<button
							type="button"
							className="ornate-action ornate-action--primary setup-start-button"
							data-tutorial-anchor="setup.start-expedition"
							onClick={startGame}
							disabled={!canStart}
						>
							{translate("game:screens.setup.text009")}{" "}</button>
						<p className="setup-save-note">
							{translate("game:screens.setup.text010")}{" "}</p>
					</div>
				</aside>
			</div>
			{heroInfo ? (
				<HeroStatsModal
					hero={heroInfo}
					imageUrl={getCardImageUrl(cardImageUrls, heroInfo.id)}
					logoUrl={logoUrl}
					modalStyle={modalStyle}
					onClose={() => setHeroInfoId(null)}
				/>
			) : null}
			{bossInfoOpen && boss ? (
				<BossInfoModal
					boss={boss}
					imageUrl={bossImageUrl}
					logoUrl={logoUrl}
					modalStyle={modalStyle}
					onClose={() => setBossInfoOpen(false)}
				/>
			) : null}
		</main>
	);
}

function DungeonMasterCard({
	boss,
	imageUrl,
	iconUrl,
	onInfo,
}: {
	boss: BossCard;
	imageUrl?: string;
	iconUrl?: string;
	onInfo: () => void;
}) {
	const locale = getCardLocale(boss.id);
	const diceText = locale?.dice ?? translate("game:screens.setup.specialDice");

	return (
		<div className="setup-dungeon-master setup-dungeon-master-panel">
			<div className="setup-section-heading setup-dungeon-master__heading">
				{iconUrl ? <img src={iconUrl} alt="" /> : null}
				<div>
					<h2 id="setup-focus-title">{translate("game:screens.setup.text011")}</h2>
					<p>{translate("game:screens.setup.text012")}</p>
				</div>
				<button
					type="button"
					className="setup-heading-info-button"
					aria-label={`Informações de ${getCardName(boss.id)}`}
					title={`Informações de ${getCardName(boss.id)}`}
					onClick={onInfo}
				>
					i
				</button>
			</div>
			<div className="setup-dungeon-master__image">
				{imageUrl ? (
					<img src={imageUrl} alt={getCardName(boss.id)} />
				) : (
					<CardFallback name={getCardName(boss.id)} />
				)}
			</div>
			<div className="setup-dungeon-master__summary">
				<h3>{getCardName(boss.id)}</h3>
				<div className="setup-dungeon-master__stats">
					<span>{translate("game:screens.setup.text013")}{" "}{boss.lifeBase}</span>
					<span>{translate("game:screens.setup.text014")}{boss.hitBonusBase}</span>
					<span>{translate("game:screens.setup.text015")}{" "}{boss.damage}</span>
					<span>{diceText}</span>
				</div>
				{locale?.condition ? <p>{locale.condition}</p> : null}
			</div>
		</div>
	);
}

function BossInfoModal({
	boss,
	imageUrl,
	logoUrl,
	modalStyle,
	onClose,
}: {
	boss: BossCard;
	imageUrl?: string;
	logoUrl?: string;
	modalStyle: CSSProperties;
	onClose: () => void;
}) {
	const locale = getCardLocale(boss.id);
	const skillEntries = boss.skills.map((skill) => {
		const skillLocale = getSkillLocale(skill.skillId);
		return {
			id: skill.skillId,
			name: getSkillName(skill.skillId),
			text: formatSkillDescription(
				skillLocale.text ?? skillLocale.label ?? skill.skillId,
				skill.params,
			),
		};
	});

	return (
		<SetupInfoModal
			title={getCardName(boss.id)}
			subtitle={translate("game:screens.setup.text011")}
			logoUrl={logoUrl}
			modalStyle={modalStyle}
			onClose={onClose}
			variant="boss"
		>
			<div className="setup-boss-modal">
				<div className="setup-boss-modal__image">
					{imageUrl ? (
						<img src={imageUrl} alt={getCardName(boss.id)} />
					) : (
						<CardFallback name={getCardName(boss.id)} />
					)}
				</div>
				<div className="setup-boss-modal__content">
					<div className="setup-boss-modal__facts">
						<strong>
							<span>{translate("game:screens.setup.text016")}</span>
							{boss.lifeBase}
						</strong>
						<strong>
							<span>{translate("game:screens.setup.text017")}</span>+{boss.hitBonusBase}
						</strong>
						<strong>
							<span>{translate("game:screens.setup.text018")}</span>
							{boss.damage}
						</strong>
						<strong>
							<span>{translate("game:screens.setup.text019")}</span>
							{locale?.dice ?? "Especial"}
						</strong>
					</div>

					<div className="setup-boss-modal__sections">
						<BossInfoSection title={translate("game:screens.setup.title020")} text={locale?.condition} />
						<BossInfoSection title={translate("game:screens.setup.title021")} text={locale?.artifactBonus} />
						<BossInfoSection
							title={translate("game:screens.setup.title022")}
							text={locale?.dungeonScaling}
						/>
						<BossInfoSection title={translate("game:screens.setup.title023")} text={locale?.victory} />
					</div>

					<div className="setup-boss-modal__skills">
						<h3>{translate("game:screens.setup.text024")}</h3>
						{skillEntries.map((skill) => (
							<div key={skill.id}>
								<h4>{skill.name}</h4>
								<p>{skill.text}</p>
							</div>
						))}
					</div>
				</div>
			</div>
		</SetupInfoModal>
	);
}

function BossInfoSection({ title, text }: { title: string; text?: string }) {
	if (!text) return null;
	return (
		<section>
			<h3>{title}</h3>
			<p>{text}</p>
		</section>
	);
}

function HeroStatsModal({
	hero,
	imageUrl,
	logoUrl,
	modalStyle,
	onClose,
}: {
	hero: HeroCard;
	imageUrl?: string;
	logoUrl?: string;
	modalStyle: CSSProperties;
	onClose: () => void;
}) {
	const skillEntries = hero.skills.map((skill) => ({
		id: skill.skillId,
		name: getSkillName(skill.skillId),
		text: getSkillLocale(skill.skillId).text,
	}));

	return (
		<SetupInfoModal
			title={getCardName(hero.id)}
			subtitle="Ficha do Herói"
			logoUrl={logoUrl}
			modalStyle={modalStyle}
			onClose={onClose}
			variant="hero"
		>
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
							<span>{translate("game:screens.setup.text025")}</span>
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
		</SetupInfoModal>
	);
}

function SetupInfoModal({
	title,
	subtitle,
	logoUrl,
	modalStyle,
	onClose,
	variant,
	children,
}: {
	title: string;
	subtitle: string;
	logoUrl?: string;
	modalStyle: CSSProperties;
	onClose: () => void;
	variant: "hero" | "boss";
	children: ReactNode;
}) {
	return createPortal(
		<div className="flow-modal-overlay" style={modalStyle}>
			<section
				role="dialog"
				aria-modal="true"
				aria-labelledby={`setup-${variant}-modal-title`}
				className={`flow-modal-dialog setup-info-modal setup-info-modal--${variant}`}
				onKeyDown={(event) => event.key === "Escape" && onClose()}
			>
				<header className="flow-modal-header setup-info-modal__header">
					<div className="flow-modal-title">
						{logoUrl ? <img src={logoUrl} alt="" /> : null}
						<div>
							<h1 id={`setup-${variant}-modal-title`}>{title}</h1>
							<p>{subtitle}</p>
						</div>
					</div>
					<button
						type="button"
						className="setup-info-close-button"
						onClick={onClose}
						aria-label={translate("game:screens.setup.ariaLabel026")}
					>
						X
					</button>
				</header>
				<div className="setup-info-modal__body">{children}</div>
			</section>
		</div>,
		document.body,
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

function formatSkillDescription(
	text: string,
	params?: Readonly<Record<string, number | string>>,
) {
	if (!params) return text;
	return Object.entries(params).reduce(
		(result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
		text,
	);
}
