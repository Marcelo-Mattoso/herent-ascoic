// Tabuleiro coletivo da partida (Patch 3).
// Layout: cartas ativas | arena | footer do grupo.

import { type DragEvent, useEffect, useRef, useState } from "react";
import { getCardName } from "@/core/data/cardLocale";
import type { PlayerView } from "@/core/projection/playerView";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { CombatRollResult } from "@/core/state/combatState";
import type { EnemyState } from "@/core/state/enemyState";
import { MAX_HEROES, type GroupArtifact } from "@/core/state/gameState";
import type { HeroState } from "@/core/state/heroState";
import type { CardImageUrls } from "@/ui/cardImages";
import { getCardImageUrl } from "@/ui/cardImages";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";
import { ActionButton } from "./ActionButton";
import { BoardFooter } from "./BoardFooter";
import { CardAttackAnimation } from "./CardAttackAnimation";
import { ColorBar } from "./ColorBar";
import { DiceSelectionPanel } from "./DiceSelectionPanel";
import { DiceRollOverlay } from "./DiceRollOverlay";
import { HeroCard } from "./HeroCard";
import { HpBar } from "./HpBar";

interface BoardProps {
	tutorialMode?: boolean;
	tutorialRevealEnabled?: boolean;
	onTutorialReveal?: () => void;
	view: PlayerView;
	focusedHeroId: string | null;
	onHeroClick: (hero: HeroState) => void;
	onHeroDragStart: (heroId: string) => void;
	canHeroAttack: (heroId: string) => boolean;
	onEnemyDrop: (heroId: string, enemyId: string) => void;
	onEnemyClick: (enemy: EnemyState) => void;
	onRoomClick: () => void;
	onCardDetail: (name: string, type: CardType) => void;
	// Ações de grupo
	onRevealBoss: () => void;
	onContinueExploration: () => void;
	onResolve: () => void;
	onSelectDie?: (side: "hero" | "enemy", index: number, value?: number) => void;
	roll: CombatRollResult | null;
	combatAttackHintVisible?: boolean;
	cardImageUrls?: CardImageUrls;
}

const ACTIVE_DUNGEON_CARD = {
	width: "var(--game-card-width, 124px)",
	height: "var(--game-card-height, 172px)",
	radius: "var(--game-card-radius, 10px)",
};

const ACTIVE_CARD_SLOT_COUNT = 4;
const BOSS_CARD = {
	width: "var(--game-boss-width, 180px)",
	height: "var(--game-boss-height, 252px)",
	radius: "var(--game-card-radius, 12px)",
};
const CARD_CONTACT_SHADOW =
	"0 7px 10px rgba(0, 0, 0, 0.34), 0 1px 2px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(255,255,255,0.28)";

interface DiceRollAnimationState {
	readonly key: string;
	readonly roll: CombatRollResult;
}

interface CombatDragPreviewState {
	readonly heroId: string;
	readonly name: string;
	readonly imageUrl?: string;
	readonly x: number;
	readonly y: number;
}

interface AttackAnimationState {
	readonly key: string;
	readonly attacker: { readonly name: string; readonly imageUrl?: string };
	readonly sourceRect: DOMRect;
	readonly targetRect: DOMRect;
}

function ActiveDungeonCard({
	room,
	despertar,
	imageUrl,
	onClick,
}: {
	room: PlayerView["currentRoom"];
	despertar: PlayerView["despertar"];
	imageUrl?: string;
	onClick: () => void;
}) {
	if (!room) {
		return (
			<div
				style={{
					width: ACTIVE_DUNGEON_CARD.width,
					height: ACTIVE_DUNGEON_CARD.height,
					border: "1.5px dashed rgba(255, 255, 255, 0.38)",
					borderRadius: ACTIVE_DUNGEON_CARD.radius,
					background: "rgba(12, 11, 10, 0.28)",
					boxShadow:
						"0 5px 8px rgba(0, 0, 0, 0.28), inset 0 0 0 1px rgba(255,255,255,0.08)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<span style={{ color: "rgba(255,255,255,0.72)", fontSize: 12 }}>
					sem sala
				</span>
			</div>
		);
	}

	return (
		<button
			type="button"
			className="game-card game-card--room"
			onClick={onClick}
			style={{
				width: ACTIVE_DUNGEON_CARD.width,
				height: ACTIVE_DUNGEON_CARD.height,
				border: `1.5px solid ${UI.borderStrong}`,
				borderRadius: ACTIVE_DUNGEON_CARD.radius,
				backgroundImage: imageUrl
					? `linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.06) 48%, rgba(246, 240, 229, 0.68) 74%, rgba(238, 232, 219, 0.9)), url("${imageUrl}")`
					: "linear-gradient(160deg, rgba(253, 248, 239, 0.94), rgba(241, 239, 232, 0.9))",
				backgroundPosition: "center",
				backgroundRepeat: "no-repeat",
				backgroundSize: imageUrl ? "100% 100%" : "cover",
				backgroundOrigin: "border-box",
				backgroundClip: "border-box",
				boxShadow: CARD_CONTACT_SHADOW,
				cursor: "pointer",
				display: "flex",
				flexDirection: "column",
				gap: "var(--game-card-inner-gap, 8px)",
				justifyContent: imageUrl ? "flex-end" : undefined,
				overflow: "hidden",
				padding: "var(--game-card-padding, 12px 10px)",
				textAlign: "left",
			}}
		>
			{!imageUrl && (
				<div
					style={{
						borderRadius: 7,
						background: "rgba(0, 0, 0, 0.13)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						height: "var(--game-placeholder-art-height, 62px)",
						flexShrink: 0,
					}}
				>
					<span style={{ fontSize: 28 }}>🚪</span>
				</div>
			)}
			<div
				style={{
					minWidth: 0,
					background: imageUrl ? "rgba(246, 240, 229, 0.82)" : undefined,
					borderRadius: imageUrl ? 7 : undefined,
					padding: imageUrl ? "var(--game-card-info-padding, 6px)" : undefined,
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: "var(--game-card-name-size, 12px)",
						fontWeight: 700,
						lineHeight: "var(--game-card-line-height, 1.15)",
						marginBottom: "var(--game-card-text-margin, 6px)",
						overflow: "hidden",
						display: "-webkit-box",
						WebkitBoxOrient: "vertical",
						WebkitLineClamp: 3,
					}}
				>
					{getCardName(room.cardId)}
				</p>
				<p
					className="game-card__room-meta"
					style={{
						color: UI.textSecondary,
						fontSize: "var(--game-card-meta-size, 10px)",
						marginBottom: "var(--game-card-text-margin, 7px)",
					}}
				>
					Saídas {room.exits} · XP {room.xp}
				</p>
				<ColorBar current={despertar} />
			</div>
		</button>
	);
}
function ActiveEnemyCard({
	enemy,
	isSelectable,
	isDragOver,
	imageUrl,
	onDrop,
	onClick,
}: {
	enemy: EnemyState | null;
	isSelectable: boolean;
	isDragOver: boolean;
	imageUrl?: string;
	onDrop: (enemyId: string) => void;
	onClick?: () => void;
}) {
	if (!enemy) {
		return (
			<div
				style={{
					width: ACTIVE_DUNGEON_CARD.width,
					height: ACTIVE_DUNGEON_CARD.height,
					border: "1.5px dashed rgba(255, 255, 255, 0.32)",
					borderRadius: ACTIVE_DUNGEON_CARD.radius,
					background: "rgba(12, 11, 10, 0.22)",
					boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
				}}
			/>
		);
	}

	let borderColor: string = UI.borderStrong;
	let borderWidth = "1.5px";
	if (isDragOver && isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "3px";
	} else if (isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "2px";
	}

	return (
		<button
			type="button"
			className={`game-card game-card--enemy${isSelectable && !isDragOver ? " click-attention" : ""}`}
			onDragOver={(event) => {
				if (!isSelectable) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => {
				if (!isSelectable) return;
				event.preventDefault();
				onDrop(enemy.id);
			}}
			onClick={onClick}
			style={{
				width: ACTIVE_DUNGEON_CARD.width,
				height: ACTIVE_DUNGEON_CARD.height,
				border: `${borderWidth} solid ${borderColor}`,
				borderRadius: ACTIVE_DUNGEON_CARD.radius,
				backgroundImage: imageUrl
					? `linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.06) 48%, rgba(246, 240, 229, 0.68) 74%, rgba(238, 232, 219, 0.9)), url("${imageUrl}")`
					: "linear-gradient(160deg, rgba(241, 239, 232, 0.96), rgba(225, 219, 207, 0.94))",
				backgroundPosition: "center",
				backgroundRepeat: "no-repeat",
				backgroundSize: imageUrl ? "100% 100%" : "cover",
				backgroundOrigin: "border-box",
				backgroundClip: "border-box",
				boxShadow: CARD_CONTACT_SHADOW,
				cursor: isSelectable ? "pointer" : "default",
				display: "flex",
				flexDirection: "column",
				justifyContent: imageUrl ? "flex-end" : undefined,
				overflow: "hidden",
				padding: "var(--game-card-padding, 10px)",
				position: "relative",
				textAlign: "left",
				transition: "border-color 0.1s, border-width 0.1s",
			}}
		>
			{!imageUrl && (
				<div
					style={{
						position: "relative",
						height: "var(--game-placeholder-art-height, 68px)",
						borderRadius: 7,
						background: "rgba(0, 0, 0, 0.16)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						marginBottom: "var(--game-card-inner-gap, 8px)",
						flexShrink: 0,
					}}
				>
					<span style={{ fontSize: 32 }}>{enemy.isSubboss ? "💀" : "👹"}</span>
				</div>
			)}
			{enemy.isSubboss && (
				<span
					style={{
						position: "absolute",
						top: 8,
						right: 8,
						background: "#7C3AED",
						color: "#fff",
						fontSize: 8,
						fontWeight: 700,
						padding: "1px 4px",
						borderRadius: 4,
						lineHeight: 1.3,
					}}
				>
					Sub
				</span>
			)}
			<div
				style={{
					background: imageUrl ? "rgba(246, 240, 229, 0.82)" : undefined,
					borderRadius: 7,
					padding: imageUrl ? "var(--game-card-info-padding, 6px)" : undefined,
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: "var(--game-card-name-size, 12px)",
						fontWeight: 700,
						lineHeight: "var(--game-card-line-height, 1.12)",
						marginBottom: "var(--game-card-text-margin, 7px)",
						overflow: "hidden",
						display: "-webkit-box",
						WebkitBoxOrient: "vertical",
						WebkitLineClamp: 2,
					}}
				>
					{getCardName(enemy.cardId)}
				</p>
				<HpBar current={enemy.currentLife} max={enemy.maxLife} height={5} />
				<p
					style={{
						color: UI.textTertiary,
						fontSize: "var(--game-card-meta-size, 10px)",
						marginTop: "var(--game-card-text-margin, 5px)",
						lineHeight: "var(--game-card-line-height, 1)",
					}}
				>
					{enemy.currentLife}/{enemy.maxLife} · +{enemy.hitBonus} · D
					{enemy.damage}
				</p>
			</div>
		</button>
	);
}

function BossEncounterCard({
	bossCardId,
	bossName,
	enemy,
	isSelectable,
	isDragOver,
	imageUrl,
	onDrop,
	onClick,
}: {
	bossCardId: string;
	bossName: string;
	enemy: EnemyState | null;
	isSelectable: boolean;
	isDragOver: boolean;
	imageUrl?: string;
	onDrop: (enemyId: string) => void;
	onClick: () => void;
}) {
	let borderColor: string = UI.borderStrong;
	let borderWidth = "2px";
	if (isDragOver && isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "4px";
	} else if (isSelectable) {
		borderColor = UI.info.text;
		borderWidth = "3px";
	}

	return (
		<button
			type="button"
			className={`game-card game-card--boss${isSelectable && !isDragOver ? " click-attention" : ""}`}
			onDragOver={(event) => {
				if (!enemy || !isSelectable) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => {
				if (!enemy || !isSelectable) return;
				event.preventDefault();
				onDrop(enemy.id);
			}}
			onClick={onClick}
			style={{
				width: BOSS_CARD.width,
				height: BOSS_CARD.height,
				border: `${borderWidth} solid ${borderColor}`,
				borderRadius: BOSS_CARD.radius,
				backgroundImage: imageUrl
					? `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.02) 56%, rgba(247, 232, 199, 0.72) 78%, rgba(230, 200, 135, 0.96)), url("${imageUrl}")`
					: "linear-gradient(160deg, rgba(44, 18, 12, 0.98), rgba(7, 7, 8, 0.96))",
				backgroundPosition: "center",
				backgroundRepeat: "no-repeat",
				backgroundSize: imageUrl ? "100% 100%" : "cover",
				backgroundOrigin: "border-box",
				backgroundClip: "border-box",
				boxShadow:
					"0 14px 22px rgba(0, 0, 0, 0.42), 0 2px 4px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.25)",
				cursor: isSelectable ? "pointer" : "default",
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
				overflow: "hidden",
				padding: "var(--game-card-padding, 12px)",
				position: "relative",
				textAlign: "left",
				transition: "border-color 0.1s, border-width 0.1s, transform 0.16s",
			}}
		>
			<div
				style={{
					background: "rgba(248, 232, 195, 0.9)",
					border: "1px solid rgba(120, 72, 14, 0.52)",
					borderRadius: 8,
					boxShadow: "0 3px 10px rgba(0, 0, 0, 0.28)",
					padding: "var(--game-card-info-padding, 8px 9px)",
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: "var(--game-card-name-size, 13px)",
						fontWeight: 800,
						lineHeight: "var(--game-card-line-height, 1.08)",
						marginBottom: "var(--game-card-text-margin, 7px)",
					}}
				>
					{bossName}
				</p>
				{enemy ? (
					<>
						<HpBar current={enemy.currentLife} max={enemy.maxLife} height={6} />
						<p
							style={{
								color: UI.textSecondary,
								fontSize: "var(--game-card-meta-size, 11px)",
								fontWeight: 700,
								marginTop: "var(--game-card-text-margin, 6px)",
								lineHeight: "var(--game-card-line-height, 1)",
							}}
						>
							{enemy.currentLife}/{enemy.maxLife} Vida · +{enemy.hitBonus} · D
							{enemy.damage}
						</p>
					</>
				) : (
					<p
						style={{
							color: UI.textSecondary,
							fontSize: "var(--game-card-meta-size, 11px)",
							fontWeight: 700,
							lineHeight: "var(--game-card-line-height, 1.2)",
						}}
					>
						Confronto final disponível
					</p>
				)}
			</div>
			<span
				style={{
					position: "absolute",
					top: 10,
					left: 10,
					borderRadius: 999,
					background: "rgba(12, 10, 8, 0.74)",
					border: "1px solid rgba(239, 198, 95, 0.72)",
					color: "#F7D884",
					fontSize: 10,
					fontWeight: 800,
					letterSpacing: 0,
					padding: "3px 7px",
					textTransform: "uppercase",
				}}
			>
				Mestre
			</span>
			<span style={{ display: "none" }}>{bossCardId}</span>
		</button>
	);
}

function ArtifactDisplayCard({
	artifact,
	imageUrl,
	heroes,
	onClick,
}: {
	artifact: GroupArtifact | null;
	imageUrl?: string;
	heroes: readonly HeroState[];
	onClick: () => void;
}) {
	if (!artifact) {
		return (
			<div
				style={{
					width: ACTIVE_DUNGEON_CARD.width,
					height: ACTIVE_DUNGEON_CARD.height,
					border: "1.5px dashed rgba(255, 255, 255, 0.32)",
					borderRadius: ACTIVE_DUNGEON_CARD.radius,
					background: "rgba(12, 11, 10, 0.22)",
					boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 12,
					textAlign: "center",
				}}
			>
				<span style={{ color: "rgba(255,255,255,0.68)", fontSize: 11 }}>
					sem artefato
				</span>
			</div>
		);
	}

	const skills = cardSkills(artifact.cardId);
	const bonusText = skills[0]
		? renderSkillLabel(skills[0].ref)
		: "Artefato ativo";
	const bearer = artifact.carriedBy
		? heroes.find((hero) => hero.id === artifact.carriedBy)
		: null;
	const bearerName = bearer ? getCardName(bearer.cardId) : "Grupo";

	return (
		<button
			type="button"
			className="game-card game-card--artifact"
			onClick={onClick}
			style={{
				width: ACTIVE_DUNGEON_CARD.width,
				height: ACTIVE_DUNGEON_CARD.height,
				border: `1.5px solid ${UI.borderStrong}`,
				borderRadius: ACTIVE_DUNGEON_CARD.radius,
				backgroundImage: imageUrl
					? `linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.05) 44%, rgba(246, 240, 229, 0.74) 68%, rgba(238, 232, 219, 0.94)), url("${imageUrl}")`
					: "linear-gradient(160deg, rgba(253, 248, 239, 0.94), rgba(241, 239, 232, 0.9))",
				backgroundPosition: "center",
				backgroundRepeat: "no-repeat",
				backgroundSize: imageUrl ? "100% 100%" : "cover",
				backgroundOrigin: "border-box",
				backgroundClip: "border-box",
				boxShadow: CARD_CONTACT_SHADOW,
				cursor: "pointer",
				display: "flex",
				flexDirection: "column",
				justifyContent: "flex-end",
				overflow: "hidden",
				padding: "var(--game-card-padding, 8px)",
				textAlign: "left",
			}}
		>
			<div
				style={{
					background: "rgba(246, 240, 229, 0.86)",
					borderRadius: 7,
					padding: "var(--game-card-info-padding, 6px)",
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: "var(--game-card-name-size, 11px)",
						fontWeight: 800,
						lineHeight: "var(--game-card-line-height, 1.08)",
						marginBottom: "var(--game-card-text-margin, 4px)",
						overflow: "hidden",
						display: "-webkit-box",
						WebkitBoxOrient: "vertical",
						WebkitLineClamp: 2,
					}}
				>
					{getCardName(artifact.cardId)}
				</p>
				<p
					style={{
						color: UI.textTertiary,
						fontSize: "var(--game-card-meta-size, 9px)",
						marginBottom: "var(--game-card-text-margin, 4px)",
					}}
				>
					{bearerName}
				</p>
				<p
					style={{
						color: UI.textSecondary,
						fontSize: "var(--game-card-meta-size, 9px)",
						fontWeight: 600,
						lineHeight: "var(--game-card-line-height, 1.12)",
						overflow: "hidden",
						display: "-webkit-box",
						WebkitBoxOrient: "vertical",
						WebkitLineClamp: 3,
					}}
				>
					{bonusText}
				</p>
			</div>
		</button>
	);
}

export function Board({
	tutorialMode = false,
	tutorialRevealEnabled = false,
	onTutorialReveal,
	view,
	focusedHeroId,
	onHeroClick,
	onHeroDragStart,
	canHeroAttack,
	onEnemyDrop,
	onEnemyClick,
	onRoomClick,
	onCardDetail,
	onRevealBoss,
	onContinueExploration,
	onResolve,
	onSelectDie,
	roll,
	combatAttackHintVisible = false,
	cardImageUrls,
}: BoardProps) {
	const [draggingHeroId, setDraggingHeroId] = useState<string | null>(null);
	const [diceRollAnimation, setDiceRollAnimation] =
		useState<DiceRollAnimationState | null>(null);
	const [combatDragPreview, setCombatDragPreview] =
		useState<CombatDragPreviewState | null>(null);
	const [attackAnimation, setAttackAnimation] =
		useState<AttackAnimationState | null>(null);
	const draggingHeroIdRef = useRef<string | null>(null);
	const lastAnimatedRollRef = useRef<CombatRollResult | null>(null);
	const heroCardRefs = useRef(new Map<string, HTMLDivElement>());
	const enemyCardRefs = useRef(new Map<string, HTMLDivElement>());

	const heroesActed = view.combat?.heroesActed ?? [];
	const selectedHeroId = view.combat?.selectedHeroId ?? null;
	const status = view.status;
	const pendingDiceSelection = view.combat?.pendingDiceSelection;

	const isBossEncounter = status === "BOSS_COMBAT" || status === "BOSS_REVEAL";
	const canDropAttack =
		draggingHeroId !== null && canHeroAttack(draggingHeroId);
	const canTapTarget =
		(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
		view.combat?.phase === "selecting_target" &&
		selectedHeroId !== null;

	const heroes = view.heroes;
	const enemies = view.enemies.filter((e) => e.status === "active");
	const bossEnemy = enemies.find((e) => e.id === "boss") ?? null;

	function handleDragStart(
		hero: HeroState,
		event: DragEvent<HTMLButtonElement>,
	) {
		if (!canHeroAttack(hero.id)) {
			event.preventDefault();
			return;
		}
		const imageUrl = getCardImageUrl(cardImageUrls, hero.cardId);
		draggingHeroIdRef.current = hero.id;
		setDraggingHeroId(hero.id);
		setCombatDragPreview({
			heroId: hero.id,
			name: getCardName(hero.cardId),
			imageUrl,
			x: event.clientX,
			y: event.clientY,
		});
		onHeroDragStart(hero.id);
	}

	function handleDragEnd() {
		draggingHeroIdRef.current = null;
		setDraggingHeroId(null);
		setCombatDragPreview(null);
	}

	function handleEnemyDrop(enemyId: string) {
		const heroId = draggingHeroIdRef.current;
		if (
			heroId &&
			canHeroAttack(heroId) &&
			enemies.some((enemy) => enemy.id === enemyId)
		) {
			onEnemyDrop(heroId, enemyId);
		}
		draggingHeroIdRef.current = null;
		setDraggingHeroId(null);
		setCombatDragPreview(null);
	}

	function resolveAttackWithAnimation() {
		if (!roll || attackAnimation) return;

		const heroWon = roll.heroTotal > roll.enemyTotal;
		const enemyWon = roll.enemyTotal > roll.heroTotal;
		if (!heroWon && !enemyWon) {
			setDiceRollAnimation(null);
			onResolve();
			return;
		}

		const winnerId = heroWon ? roll.heroId : roll.enemyId;
		const loserId = heroWon ? roll.enemyId : roll.heroId;
		const source = heroWon
			? heroCardRefs.current.get(winnerId)
			: enemyCardRefs.current.get(winnerId);
		const target = heroWon
			? enemyCardRefs.current.get(loserId)
			: heroCardRefs.current.get(loserId);
		const winner = heroWon
			? heroes.find((hero) => hero.id === winnerId)
			: enemies.find((enemy) => enemy.id === winnerId);

		if (!source || !target || !winner) {
			setDiceRollAnimation(null);
			onResolve();
			return;
		}

		setDiceRollAnimation(null);
		setAttackAnimation({
			key: `${winnerId}-${loserId}-${Date.now()}`,
			attacker: {
				name: getCardName(winner.cardId),
				imageUrl: getCardImageUrl(cardImageUrls, winner.cardId),
			},
			sourceRect: source.getBoundingClientRect(),
			targetRect: target.getBoundingClientRect(),
		});
	}

	useEffect(() => {
		if (status !== "RESOLVE_ATTACK" || !roll || pendingDiceSelection) {
			setDiceRollAnimation(null);
			return;
		}
		if (lastAnimatedRollRef.current === roll) return;

		lastAnimatedRollRef.current = roll;
		setDiceRollAnimation({
			key: `${roll.heroId}-${roll.enemyId}-${Date.now()}`,
			roll,
		});
	}, [pendingDiceSelection, roll, status]);

	useEffect(() => {
		if (!draggingHeroId) return;

		function handleWindowDragOver(event: globalThis.DragEvent) {
			if (event.clientX === 0 && event.clientY === 0) return;
			setCombatDragPreview((current) =>
				current
					? {
							...current,
							x: event.clientX,
							y: event.clientY,
						}
					: current,
			);
		}

		window.addEventListener("dragover", handleWindowDragOver);
		return () => window.removeEventListener("dragover", handleWindowDragOver);
	}, [draggingHeroId]);

	return (
		<div
			className="game-board-root"
			style={{
				height: "100%",
				minHeight: 0,
				overflow: "visible",
			}}
		>
			{/* Área principal: cartas ativas + arena */}
			<div
				className={`game-board-content${isBossEncounter ? " game-board-content--boss" : ""}`}
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "var(--game-region-gap, clamp(10px, 2vh, 22px))",
					height: "var(--game-content-height, calc(100% - 48px))",
					minHeight: 0,
					padding: "var(--game-arena-padding, 9.5vh 12vw 3vh)",
				}}
			>
				{/* Cartas ativas: sala + criaturas / artefatos no encontro final */}
				{isBossEncounter ? (
					<div
						className="game-board-active-cards"
						style={{
							display: "grid",
							gridTemplateColumns: `var(--game-boss-columns, ${BOSS_CARD.width} repeat(${ACTIVE_CARD_SLOT_COUNT}, ${ACTIVE_DUNGEON_CARD.width}))`,
							justifyContent: "center",
							alignItems: "start",
							columnGap: "var(--game-card-gap, clamp(12px, 1.8vw, 26px))",
							width: "100%",
						}}
					>
						<div
							className="game-board-boss"
							ref={(node) => {
								if (!bossEnemy) return;
								if (node) enemyCardRefs.current.set(bossEnemy.id, node);
								else enemyCardRefs.current.delete(bossEnemy.id);
							}}
						>
							<BossEncounterCard
								bossCardId={view.bossCardId}
								bossName={view.bossCardName}
								enemy={bossEnemy}
								isSelectable={!!bossEnemy && (canDropAttack || canTapTarget)}
								isDragOver={
									draggingHeroId !== null && !!bossEnemy && canDropAttack
								}
								imageUrl={getCardImageUrl(cardImageUrls, view.bossCardId)}
								onDrop={handleEnemyDrop}
								onClick={() =>
									bossEnemy
										? onEnemyClick(bossEnemy)
										: onCardDetail(view.bossCardId, "boss")
								}
							/>
						</div>
						{Array.from({ length: ACTIVE_CARD_SLOT_COUNT }, (_, index) => {
							const artifact = view.groupArtifacts[index] ?? null;
							return (
								<ArtifactDisplayCard
									key={artifact?.cardId ?? `empty-artifact-slot-${index}`}
									artifact={artifact}
									heroes={heroes}
									imageUrl={
										artifact
											? getCardImageUrl(cardImageUrls, artifact.cardId)
											: undefined
									}
									onClick={() =>
										artifact && onCardDetail(artifact.cardId, "artifact")
									}
								/>
							);
						})}
					</div>
				) : (
					<div
						className="game-board-active-cards"
						style={{
							display: "grid",
							gridTemplateColumns: `var(--game-encounter-columns, ${ACTIVE_DUNGEON_CARD.width} clamp(24px, 3vw, 54px) repeat(${ACTIVE_CARD_SLOT_COUNT}, ${ACTIVE_DUNGEON_CARD.width}))`,
							justifyContent: "center",
							alignItems: "start",
							columnGap: "var(--game-card-gap, clamp(12px, 1.8vw, 26px))",
							width: "100%",
						}}
					>
						<div data-tutorial-anchor="board.current-room">
							<ActiveDungeonCard
								room={view.currentRoom}
								despertar={view.despertar}
								imageUrl={
									view.currentRoom
										? getCardImageUrl(cardImageUrls, view.currentRoom.cardId)
										: undefined
								}
								onClick={onRoomClick}
							/>
						</div>
						<div />
						{Array.from({ length: ACTIVE_CARD_SLOT_COUNT }, (_, index) => {
							const enemy = enemies[index] ?? null;
							const isSelectable = !!enemy && (canDropAttack || canTapTarget);
							const isDragOver = draggingHeroId !== null && isSelectable;
							return (
								<div
									key={enemy?.id ?? `empty-enemy-slot-${index}`}
									data-tutorial-anchor={
										index === 0 ? "board.active-enemies" : undefined
									}
									ref={(node) => {
										if (!enemy) return;
										if (node) enemyCardRefs.current.set(enemy.id, node);
										else enemyCardRefs.current.delete(enemy.id);
									}}
									style={{
										width: ACTIVE_DUNGEON_CARD.width,
										height: ACTIVE_DUNGEON_CARD.height,
										position: "relative",
									}}
								>
									<ActiveEnemyCard
										enemy={enemy}
										isSelectable={isSelectable}
										isDragOver={isDragOver}
										imageUrl={
											enemy
												? getCardImageUrl(cardImageUrls, enemy.cardId)
												: undefined
										}
										onDrop={handleEnemyDrop}
										onClick={enemy ? () => onEnemyClick(enemy) : undefined}
									/>
								</div>
							);
						})}
					</div>
				)}

				{diceRollAnimation && (
					<DiceRollOverlay
						key={diceRollAnimation.key}
						roll={diceRollAnimation.roll}
						onResolveAttack={resolveAttackWithAnimation}
					/>
				)}

				{/* Arena central */}
				<div
					className="game-board-arena"
					style={{
						display: "flex",
						flex: 1,
						flexDirection: "column",
						gap: 8,
						minHeight: 0,
					}}
				>
					{/* Linha de combate — dock para todas as ações de grupo */}
					{status === "RESOLVE_ATTACK" && roll ? (
						pendingDiceSelection ? (
							<DiceSelectionPanel
								key={`${pendingDiceSelection.skillId}:${pendingDiceSelection.heroId}:${roll.heroResults.join(",")}:${roll.enemyResults.join(",")}`}
								selection={pendingDiceSelection}
								roll={roll}
								heroName={getCardName(
									view.heroes.find((hero) => hero.id === roll.heroId)?.cardId ??
										"",
								)}
								enemyName={getCardName(
									view.enemies.find((enemy) => enemy.id === roll.enemyId)
										?.cardId ?? "",
								)}
								onConfirm={(side, index, value) =>
									onSelectDie?.(side, index, value)
								}
							/>
						) : (
							<ActionButton
								label="Resolver ataque"
								icon="💥"
								variant="primary"
								onClick={resolveAttackWithAnimation}
								attention
							/>
						)
					) : (
						<div
							className="game-board-action-line"
							data-tutorial-anchor="board.main-action"
							style={{
								position: "relative",
								display: "flex",
								alignItems: "center",
								margin: "2px 0",
							}}
						>
							<div
								style={{
									flex: 1,
									height: 1,
									borderTop: `1px dashed ${UI.border}`,
								}}
							/>
							{tutorialMode && status === "REVEAL_ROOM" ? (
								<ActionButton
									label="Revelar sala"
									icon="🚪"
									variant="primary"
									onClick={onTutorialReveal}
									disabled={!tutorialRevealEnabled}
									attention={tutorialRevealEnabled}
								/>
							) : status === "REVEAL_ROOM" ||
								status === "ROOM_EFFECT" ||
								status === "SPAWN_ENEMIES" ? (
								<span className="combat-auto-roll-status">
									Preparando sala...
								</span>
							) : status === "COMBAT_START" ? (
								<span className="combat-auto-roll-status">
									Preparando combate...
								</span>
							) : status === "ROLL_DICE" ? (
								<span className="combat-auto-roll-status">
									Rolando dados...
								</span>
							) : combatAttackHintVisible ? (
								<span className="combat-attack-hint" aria-live="polite">
									Solte seu herói sobre um inimigo para atacar e rolar os dados
								</span>
							) : status === "BOSS_REVEAL" ? (
								<div style={{ display: "flex", gap: 8 }}>
									<ActionButton
										label="Enfrentar chefe"
										icon="🐲"
										variant="danger"
										onClick={onRevealBoss}
										attention
									/>
									<ActionButton
										label="Continuar explorando"
										icon="🧭"
										onClick={onContinueExploration}
									/>
								</div>
							) : (
								<span
									style={{
										fontSize: 9,
										color: UI.textTertiary,
										background: UI.panelBg,
										padding: "0 6px",
										whiteSpace: "nowrap",
									}}
								>
									Linha de combate
								</span>
							)}
							<div
								style={{
									flex: 1,
									height: 1,
									borderTop: `1px dashed ${UI.border}`,
								}}
							/>
						</div>
					)}

					{/* Heróis */}
					<div
						className="game-board-hero-strip"
						data-tutorial-anchor="board.heroes"
						style={{
							display: "grid",
							gridTemplateColumns: `repeat(${Math.min(Math.max(heroes.length, 1), MAX_HEROES)}, ${ACTIVE_DUNGEON_CARD.width})`,
							gap: "var(--game-card-gap, clamp(10px, 1.25vw, 18px))",
							justifyContent: "center",
							alignItems: "start",
							width: "100%",
							marginTop: "var(--game-hero-margin, clamp(22px, 5vh, 70px))",
						}}
					>
						{heroes.map((h) => {
							const isFocused = h.id === focusedHeroId;
							const hasActed = heroesActed.includes(h.id);
							const isSelected = h.id === selectedHeroId;
							const canAct = canHeroAttack(h.id);

							return (
								<div
									key={h.id}
									ref={(node) => {
										if (node) heroCardRefs.current.set(h.id, node);
										else heroCardRefs.current.delete(h.id);
									}}
									style={{
										width: ACTIVE_DUNGEON_CARD.width,
									}}
								>
									<HeroCard
										hero={h}
										isFocused={isFocused}
										hasActed={hasActed}
										isSelected={isSelected}
										canAct={canAct}
										size="board"
										imageUrl={getCardImageUrl(cardImageUrls, h.cardId)}
										onDragStart={(_, event) => handleDragStart(h, event)}
										onDragEnd={handleDragEnd}
										onClick={() => onHeroClick(h)}
									/>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{/* Footer do grupo */}
			<BoardFooter view={view} onArtifactClick={onCardDetail} />
			{attackAnimation && (
				<CardAttackAnimation
					key={attackAnimation.key}
					attacker={attackAnimation.attacker}
					sourceRect={attackAnimation.sourceRect}
					targetRect={attackAnimation.targetRect}
					onFinish={() => {
						setAttackAnimation(null);
						onResolve();
					}}
				/>
			)}
			{combatDragPreview && (
				<CombatDragPreview
					name={combatDragPreview.name}
					imageUrl={combatDragPreview.imageUrl}
					x={combatDragPreview.x}
					y={combatDragPreview.y}
				/>
			)}
		</div>
	);
}

function CombatDragPreview({
	name,
	imageUrl,
	x,
	y,
}: {
	name: string;
	imageUrl?: string;
	x: number;
	y: number;
}) {
	return (
		<div
			className="combat-drag-preview"
			style={{
				left: x,
				top: y,
				backgroundImage: imageUrl
					? `linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.06) 48%, rgba(246, 240, 229, 0.68) 74%, rgba(238, 232, 219, 0.9)), url("${imageUrl}")`
					: undefined,
			}}
		>
			{!imageUrl && <span className="combat-drag-preview__icon">🧙</span>}
			<span className="combat-drag-preview__label">{name}</span>
		</div>
	);
}
