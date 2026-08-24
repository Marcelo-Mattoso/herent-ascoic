// Tabuleiro coletivo da partida (Patch 3).
// Layout: stacks centrais | arena | footer do grupo.

import { useState } from "react";
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
	onStartCombat: () => void;
	onRevealBoss: () => void;
	onRoll: () => void;
	onResolve: () => void;
	onSelectDie?: (side: "hero" | "enemy", index: number) => void;
	roll: CombatRollResult | null;
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
				if (!isSelectable) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			}}
			onDrop={(event) => {
				event.preventDefault();
				if (isSelectable) onDrop(enemy.id);
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
	onStartCombat,
	onRevealBoss,
	onRoll,
	onResolve,
	onSelectDie,
	roll,
	backCardUrls,
	cardImageUrls,
}: BoardProps) {
	const [draggingHeroId, setDraggingHeroId] = useState<string | null>(null);

	const heroesActed = view.combat?.heroesActed ?? [];
	const selectedHeroId = view.combat?.selectedHeroId ?? null;
	const phase = view.combat?.phase ?? null;
	const status = view.status;

	const isInCombat = status === "HERO_ACTION" || status === "BOSS_COMBAT";
	const isSelectingTarget =
		isInCombat && phase === "selecting_target" && !!selectedHeroId;

	const heroes = view.heroes;
	const enemies = view.enemies.filter((e) => e.status === "active");

	function handleDragStart(heroId: string) {
		setDraggingHeroId(heroId);
		onHeroDragStart(heroId);
	}

	function handleDragEnd() {
		setDraggingHeroId(null);
	}

	function handleEnemyDrop(enemyId: string) {
		const heroId = draggingHeroId ?? selectedHeroId;
		if (heroId) onEnemyDrop(heroId, enemyId);
		setDraggingHeroId(null);
	}

	return (
		<div
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
						columnGap: "clamp(72px, 12vw, 190px)",
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
						return (
							<ActiveEnemyCard
								key={enemy?.id ?? `empty-enemy-slot-${index}`}
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
						);
					})}
				</div>

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
								const sel = view.combat?.pendingDiceSelection;
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
								<ActionButton
									label="Iniciar combate"
									icon="⚔"
									variant="primary"
									onClick={onStartCombat}
									attention
								/>
							) : status === "ROLL_DICE" ? (
								<ActionButton
									label="Rolar dados"
									icon="🎲"
									variant="primary"
									onClick={onRoll}
									attention
								/>
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
						onDragEnd={handleDragEnd}
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
								<HeroCard
									key={h.id}
									hero={h}
									isFocused={isFocused}
									hasActed={hasActed}
									isSelected={isSelected}
									canAct={canAct}
									size="board"
									imageUrl={getCardImageUrl(cardImageUrls, h.cardId)}
									onDragStart={handleDragStart}
									onClick={() => onHeroClick(h)}
								/>
							);
						})}
					</div>
				</div>
			</div>

			{/* Footer do grupo */}
			<BoardFooter view={view} onArtifactClick={onCardDetail} />
		</div>
	);
}
