// Tabuleiro coletivo da partida (Patch 3).
// Layout: stacks centrais | arena | footer do grupo.

import { type DragEvent, useEffect, useRef, useState } from "react";
import { getCardName } from "@/core/data/cardLocale";
import type { PlayerView } from "@/core/projection/playerView";
import type { CombatRollResult } from "@/core/state/combatState";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import type { BackCardUrls } from "@/ui/backCards";
import type { CardImageUrls } from "@/ui/cardImages";
import { getCardImageUrl } from "@/ui/cardImages";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";
import { ActionButton } from "./ActionButton";
import { BoardFooter } from "./BoardFooter";
import { ColorBar } from "./ColorBar";
import { DiceDisplay } from "./DiceDisplay";
import { DiceRollOverlay } from "./DiceRollOverlay";
import { HeroCard } from "./HeroCard";
import { HpBar } from "./HpBar";
import { Stack } from "./Stack";

interface BoardProps {
	view: PlayerView;
	focusedHeroId: string | null;
	onHeroClick: (hero: HeroState) => void;
	onHeroDragStart: (heroId: string) => void;
	onEnemyDrop: (heroId: string, enemyId: string) => void;
	onEnemyClick: (enemy: EnemyState) => void;
	onRoomClick: () => void;
	onCardDetail: (name: string, type: CardType) => void;
	// Ações de grupo
	onReveal: () => void;
	onRevealBoss: () => void;
	onResolve: () => void;
	onSelectDie?: (side: "hero" | "enemy", index: number) => void;
	roll: CombatRollResult | null;
	combatAttackHintVisible?: boolean;
	backCardUrls?: BackCardUrls;
	cardImageUrls?: CardImageUrls;
}

const ACTIVE_DUNGEON_CARD = {
	width: 124,
	height: 172,
	radius: 10,
};

const ACTIVE_CARD_SLOT_COUNT = 4;
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

interface CombatImpactState {
	readonly key: string;
	readonly enemyId: string;
	readonly heroName: string;
	readonly imageUrl?: string;
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
			onClick={onClick}
			style={{
				width: ACTIVE_DUNGEON_CARD.width,
				height: ACTIVE_DUNGEON_CARD.height,
				border: `1.5px solid ${UI.borderStrong}`,
				borderRadius: ACTIVE_DUNGEON_CARD.radius,
				background: imageUrl
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
				gap: 8,
				justifyContent: imageUrl ? "flex-end" : undefined,
				overflow: "hidden",
				padding: "12px 10px",
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
						height: 62,
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
					padding: imageUrl ? "6px" : undefined,
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: 12,
						fontWeight: 700,
						lineHeight: 1.15,
						marginBottom: 6,
						overflow: "hidden",
						display: "-webkit-box",
						WebkitBoxOrient: "vertical",
						WebkitLineClamp: 3,
					}}
				>
					{getCardName(room.cardId)}
				</p>
				<p style={{ color: UI.textSecondary, fontSize: 10, marginBottom: 7 }}>
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
			className={isSelectable && !isDragOver ? "click-attention" : undefined}
			onDragOver={(event) => {
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => {
				event.preventDefault();
				onDrop(enemy.id);
			}}
			onClick={onClick}
			style={{
				width: ACTIVE_DUNGEON_CARD.width,
				height: ACTIVE_DUNGEON_CARD.height,
				border: `${borderWidth} solid ${borderColor}`,
				borderRadius: ACTIVE_DUNGEON_CARD.radius,
				background: imageUrl
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
				padding: "10px",
				position: "relative",
				textAlign: "left",
				transition: "border-color 0.1s, border-width 0.1s",
			}}
		>
			{!imageUrl && (
				<div
					style={{
						position: "relative",
						height: 68,
						borderRadius: 7,
						background: "rgba(0, 0, 0, 0.16)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						marginBottom: 8,
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
					padding: imageUrl ? "6px" : undefined,
				}}
			>
				<p
					style={{
						color: UI.textPrimary,
						fontSize: 12,
						fontWeight: 700,
						lineHeight: 1.12,
						marginBottom: 7,
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
						fontSize: 10,
						marginTop: 5,
						lineHeight: 1,
					}}
				>
					{enemy.currentLife}/{enemy.maxLife} · +{enemy.hitBonus} · D
					{enemy.damage}
				</p>
			</div>
		</button>
	);
}

export function Board({
	view,
	focusedHeroId,
	onHeroClick,
	onHeroDragStart,
	onEnemyDrop,
	onEnemyClick,
	onRoomClick,
	onCardDetail,
	onReveal,
	onRevealBoss,
	onResolve,
	onSelectDie,
	roll,
	combatAttackHintVisible = false,
	backCardUrls,
	cardImageUrls,
}: BoardProps) {
	const [draggingHeroId, setDraggingHeroId] = useState<string | null>(null);
	const [diceRollAnimation, setDiceRollAnimation] =
		useState<DiceRollAnimationState | null>(null);
	const [combatDragPreview, setCombatDragPreview] =
		useState<CombatDragPreviewState | null>(null);
	const [combatImpact, setCombatImpact] = useState<CombatImpactState | null>(
		null,
	);
	const draggingHeroIdRef = useRef<string | null>(null);
	const lastAnimatedRollRef = useRef<CombatRollResult | null>(null);

	const heroesActed = view.combat?.heroesActed ?? [];
	const selectedHeroId = view.combat?.selectedHeroId ?? null;
	const phase = view.combat?.phase ?? null;
	const status = view.status;
	const pendingDiceSelection = view.combat?.pendingDiceSelection;

	const isInCombat = status === "HERO_ACTION" || status === "BOSS_COMBAT";
	const isSelectingTarget =
		isInCombat && phase === "selecting_target" && !!selectedHeroId;

	const heroes = view.heroes;
	const enemies = view.enemies.filter((e) => e.status === "active");

	function handleDragStart(
		hero: HeroState,
		event: DragEvent<HTMLButtonElement>,
	) {
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
		const heroId =
			draggingHeroIdRef.current ?? draggingHeroId ?? selectedHeroId;
		if (heroId) {
			const hero = heroes.find((h) => h.id === heroId);
			setCombatImpact({
				key: `${heroId}-${enemyId}-${Date.now()}`,
				enemyId,
				heroName: hero ? getCardName(hero.cardId) : "Herói",
				imageUrl: hero
					? getCardImageUrl(cardImageUrls, hero.cardId)
					: undefined,
			});
			window.setTimeout(() => setCombatImpact(null), 560);
			onEnemyDrop(heroId, enemyId);
		}
		draggingHeroIdRef.current = null;
		setDraggingHeroId(null);
		setCombatDragPreview(null);
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
			{/* Área principal: stacks centrais + arena */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "clamp(10px, 2vh, 22px)",
					height: "calc(100% - 48px)",
					minHeight: 0,
					padding: "9.5vh 12vw 3vh",
				}}
			>
				{/* Pilhas principais */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3, minmax(134px, 150px))",
						justifyContent: "center",
						alignItems: "start",
						columnGap: "clamp(28px, 5vw, 76px)",
						width: "100%",
					}}
				>
					<Stack
						name="Masmorra"
						count={view.decks.dungeonDeck.available}
						discardCount={view.decks.dungeonDeck.discarded.length}
						size="board"
						imageUrl={backCardUrls?.verso_dungeon}
					/>
					<Stack
						name="Monstros"
						count={view.decks.enemyDeck.available}
						discardCount={view.decks.enemyDeck.discarded}
						size="board"
						imageUrl={backCardUrls?.verso_criatura}
					/>
					<Stack
						name="Itens"
						count={view.decks.itemDeck.available.length}
						discardCount={view.decks.itemDeck.discarded}
						size="board"
						imageUrl={backCardUrls?.verso_tesouro}
					/>
				</div>

				{/* Cartas ativas: sala + até 4 criaturas */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: `${ACTIVE_DUNGEON_CARD.width}px clamp(24px, 3vw, 54px) repeat(${ACTIVE_CARD_SLOT_COUNT}, ${ACTIVE_DUNGEON_CARD.width}px)`,
						justifyContent: "center",
						alignItems: "start",
						columnGap: "clamp(12px, 1.8vw, 26px)",
						width: "100%",
					}}
				>
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
					<div />
					{Array.from({ length: ACTIVE_CARD_SLOT_COUNT }, (_, index) => {
						const enemy = enemies[index] ?? null;
						const isSelectable = !!enemy && isSelectingTarget;
						const isDragOver = draggingHeroId !== null && isSelectable;
						const isImpacting = !!enemy && combatImpact?.enemyId === enemy.id;
						return (
							<div
								key={enemy?.id ?? `empty-enemy-slot-${index}`}
								className={isImpacting ? "combat-drop-impact" : undefined}
								style={{
									width: ACTIVE_DUNGEON_CARD.width,
									height: ACTIVE_DUNGEON_CARD.height,
									position: "relative",
								}}
							>
								{isImpacting && combatImpact && (
									<CombatImpactCard
										imageUrl={combatImpact.imageUrl}
										name={combatImpact.heroName}
									/>
								)}
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

				{diceRollAnimation && (
					<DiceRollOverlay
						key={diceRollAnimation.key}
						roll={diceRollAnimation.roll}
						onResolveAttack={() => {
							setDiceRollAnimation(null);
							onResolve();
						}}
					/>
				)}

				{/* Arena central */}
				<div
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
						<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
							{(() => {
								const sel = pendingDiceSelection;
								const heroEligible =
									sel?.side === "hero" || sel?.side === "any"
										? new Set(
												roll.heroResults.reduce<number[]>((acc, v, i) => {
													if (
														sel.filter?.value === undefined ||
														v === sel.filter.value
													)
														acc.push(i);
													return acc;
												}, []),
											)
										: undefined;
								const enemyEligible =
									sel?.side === "enemy" || sel?.side === "any"
										? new Set(
												roll.enemyResults.reduce<number[]>((acc, v, i) => {
													if (
														sel.filter?.value === undefined ||
														v === sel.filter.value
													)
														acc.push(i);
													return acc;
												}, []),
											)
										: undefined;
								return (
									<>
										{sel && (
											<DiceDisplay
												results={roll.enemyResults}
												total={roll.enemyTotal}
												bonuses={roll.enemyBreakdown}
												side="enemy"
												horizontal
												eligibleIndices={enemyEligible}
												onDieClick={(i) => onSelectDie?.("enemy", i)}
											/>
										)}
										<div
											style={{
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
											<ActionButton
												label="Resolver ataque"
												icon="💥"
												variant="primary"
												onClick={onResolve}
												disabled={!!sel}
												attention={!sel}
											/>
											<div
												style={{
													flex: 1,
													height: 1,
													borderTop: `1px dashed ${UI.border}`,
												}}
											/>
										</div>
										{sel && (
											<DiceDisplay
												results={roll.heroResults}
												total={roll.heroTotal}
												bonuses={roll.heroBreakdown}
												side="hero"
												horizontal
												eligibleIndices={heroEligible}
												onDieClick={(i) => onSelectDie?.("hero", i)}
											/>
										)}
									</>
								);
							})()}
						</div>
					) : (
						<div
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
							{status === "REVEAL_ROOM" ||
							status === "ROOM_EFFECT" ||
							status === "SPAWN_ENEMIES" ? (
								<ActionButton
									label="Revelar sala"
									icon="🚪"
									variant="primary"
									onClick={onReveal}
									attention
								/>
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
									Arraste e solte seu herói no inimigo
								</span>
							) : status === "BOSS_REVEAL" ? (
								<ActionButton
									label="Revelar chefe"
									icon="🐲"
									variant="danger"
									onClick={onRevealBoss}
									attention
								/>
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
						style={{
							display: "grid",
							gridTemplateColumns: `repeat(${Math.min(Math.max(heroes.length, 1), 8)}, ${ACTIVE_DUNGEON_CARD.width}px)`,
							gap: "clamp(10px, 1.25vw, 18px)",
							justifyContent: "center",
							alignItems: "start",
							width: "100%",
							marginTop: "clamp(22px, 5vh, 70px)",
						}}
					>
						{heroes.map((h) => {
							const isFocused = h.id === focusedHeroId;
							const hasActed = heroesActed.includes(h.id);
							const isSelected = h.id === selectedHeroId;
							const canAct =
								h.status === "active" &&
								!hasActed &&
								phase === "selecting_hero" &&
								isInCombat;

							return (
								<div
									key={h.id}
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

function CombatImpactCard({
	name,
	imageUrl,
}: {
	name: string;
	imageUrl?: string;
}) {
	return (
		<div
			className="combat-impact-card"
			style={{
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
