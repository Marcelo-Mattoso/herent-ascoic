// Tabuleiro coletivo da partida (Patch 3).
// Layout: pilha-esq | arena-central | pilha-dir, com footer do grupo embaixo.

import { useState } from "react";
import type { PlayerView } from "@/core/projection/playerView";
import type { CombatRollResult } from "@/core/state/combatState";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";
import { ActionButton } from "./ActionButton";
import { BoardFooter } from "./BoardFooter";
import { DiceDisplay } from "./DiceDisplay";
import { EnemyCard } from "./EnemyCard";
import { HeroCard } from "./HeroCard";
import { RoomCard } from "./RoomCard";
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
				background: UI.panelBg,
				border: `1.5px solid ${UI.borderStrong}`,
				borderRadius: 12,
				overflow: "hidden",
			}}
		>
			{/* Área principal: 3 colunas */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "52px 1fr 52px",
					gap: 0,
					padding: "12px 8px 8px",
				}}
			>
				{/* Pilhas esquerda: Masmorra + Monstros */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
						alignItems: "center",
						paddingTop: 8,
					}}
				>
					<Stack
						name="Masmorra"
						count={view.decks.dungeonDeck.available}
						discardCount={view.decks.dungeonDeck.discarded.length}
					/>
					<Stack
						name="Monstros"
						count={view.decks.enemyDeck.available}
						discardCount={view.decks.enemyDeck.discarded}
					/>
				</div>

				{/* Arena central */}
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{/* Sala no topo */}
					<div style={{ display: "flex", justifyContent: "center" }}>
						{view.currentRoom ? (
							<RoomCard
								room={view.currentRoom}
								despertar={view.despertar}
								onClick={onRoomClick}
							/>
						) : (
							<div
								style={{
									width: 200,
									height: 56,
									background: UI.subpanelBg,
									border: `1px dashed ${UI.border}`,
									borderRadius: 8,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<span style={{ color: UI.textTertiary, fontSize: 11 }}>
									sem sala
								</span>
							</div>
						)}
					</div>

					{/* Criaturas */}
					<div>
						{enemies.length === 0 ? (
							<div
								style={{
									height: 70,
									border: `1px dashed ${UI.border}`,
									borderRadius: 8,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								<span style={{ color: UI.textTertiary, fontSize: 11 }}>
									sem inimigos
								</span>
							</div>
						) : (
							<div
								style={{
									display: "flex",
									gap: 6,
									flexWrap: "wrap",
									justifyContent: "center",
								}}
							>
								{enemies.map((e) => {
									const isSelectable = isSelectingTarget;
									const isDragOver = draggingHeroId !== null && isSelectable;
									return (
										<EnemyCard
											key={e.id}
											enemy={e}
											isSelectable={isSelectable}
											isEngaged={false}
											isDragOver={isDragOver}
											onDrop={handleEnemyDrop}
											onClick={() => onEnemyClick(e)}
										/>
									);
								})}
							</div>
						)}
					</div>

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
										<DiceDisplay
											results={roll.enemyResults}
											total={roll.enemyTotal}
											bonuses={roll.enemyBreakdown}
											side="enemy"
											horizontal
											eligibleIndices={enemyEligible}
											onDieClick={(i) => onSelectDie?.("enemy", i)}
										/>
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
											/>
											<div
												style={{
													flex: 1,
													height: 1,
													borderTop: `1px dashed ${UI.border}`,
												}}
											/>
										</div>
										<DiceDisplay
											results={roll.heroResults}
											total={roll.heroTotal}
											bonuses={roll.heroBreakdown}
											side="hero"
											horizontal
											eligibleIndices={heroEligible}
											onDieClick={(i) => onSelectDie?.("hero", i)}
										/>
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
								/>
							) : status === "COMBAT_START" ? (
								<ActionButton
									label="Iniciar combate"
									icon="⚔"
									variant="primary"
									onClick={onStartCombat}
								/>
							) : status === "ROLL_DICE" ? (
								<ActionButton
									label="Rolar dados"
									icon="🎲"
									variant="primary"
									onClick={onRoll}
								/>
							) : status === "BOSS_REVEAL" ? (
								<ActionButton
									label="Revelar chefe"
									icon="🐲"
									variant="danger"
									onClick={onRevealBoss}
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
							display: "flex",
							gap: 6,
							flexWrap: "wrap",
							justifyContent: "center",
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
									onDragStart={handleDragStart}
									onClick={() => onHeroClick(h)}
								/>
							);
						})}
					</div>
				</div>

				{/* Pilhas direita: Tesouros + Artefatos */}
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 12,
						alignItems: "center",
						paddingTop: 8,
					}}
				>
					<Stack
						name="Itens"
						count={view.decks.itemDeck.available.length}
						discardCount={view.decks.itemDeck.discarded}
					/>
					<Stack
						name="Artefatos"
						count={view.decks.artifactDeck.available.length}
						discardCount={view.decks.artifactDeck.discarded}
					/>
				</div>
			</div>

			{/* Footer do grupo */}
			<BoardFooter view={view} onArtifactClick={onCardDetail} />
		</div>
	);
}
