// Tela de Exploração — Patch 3.
// Layout: TopBar · Board (tabuleiro coletivo) · HeroFocusPanel (herói em foco).

import { UseItemModal } from "@/ui/components/modals/UseItemModal";
import { type CSSProperties, useEffect, useState } from "react";
import type { Action } from "@/core/actions/types";
import { getCardName } from "@/core/data/cardLocale";
import type { PlayerView } from "@/core/projection/playerView";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import { getCardImageUrl } from "@/ui/cardImages";
import { Board } from "@/ui/components/Board";
import { BuffBar } from "@/ui/components/BuffBar";
import type { CardType } from "@/ui/components/Card";
import { EventLogPanel } from "@/ui/components/EventLogPanel";
import { HeroFocusPanel } from "@/ui/components/HeroFocusPanel";
import { InfluencePanel } from "@/ui/components/InfluencePanel";
import { InventarioGrupo } from "@/ui/components/InventarioGrupo";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { FleeReconfigureModal } from "@/ui/components/modals/FleeReconfigureModal";
import { SkillChoiceModal } from "@/ui/components/modals/SkillChoiceModal";
import { SkillTargetModal } from "@/ui/components/modals/SkillTargetModal";
import { TriggerInterruptModal } from "@/ui/components/modals/TriggerInterruptModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
import { useBackCards } from "@/ui/hooks/useBackCards";
import { useBoardBackgrounds } from "@/ui/hooks/useBoardBackgrounds";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useGameStore } from "@/ui/store/gameStore";
import { selectFocusedHero } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";

// Estados mecânicos auto-avançados sem decisão do jogador
const AUTO_ADVANCE: Partial<Record<string, Action>> = {
	REVEAL_ROOM: { type: "REVEAL_ROOM" },
	ROOM_EFFECT: { type: "RESOLVE_ROOM_EFFECT" },
	SPAWN_ENEMIES: { type: "SPAWN_ENEMIES" },
	COMBAT_START: { type: "START_COMBAT" },
	ROLL_DICE: { type: "ROLL_DICE" },
	CHECK_COMBAT_END: { type: "CHECK_COMBAT_END" },
	DIRECT_DAMAGE: { type: "DIRECT_DAMAGE" },
};

type ModalType =
	| "xp_spend"
	| "dungeon_exhausted"
	| "flee_restart"
	| "card_detail"
	| null;

interface CardDetailState {
	id: string;
	cardType: CardType;
	heroId?: string;
}

type ActionLogMode = "open" | "collapsed" | "hidden";

const AWAKENING_LEVELS = [
	{
		name: "Branco",
		bg: "#f7ead2",
		border: "#caa15a",
		text: "#2f2417",
	},
	{
		name: "Amarelo",
		bg: "#f5cc24",
		border: "#d29310",
		text: "#2f2100",
	},
	{
		name: "Laranja",
		bg: "#f07b18",
		border: "#c34b0b",
		text: "#2d1000",
	},
	{
		name: "Vermelho",
		bg: "#d71318",
		border: "#8e0d11",
		text: "#210305",
	},
	{
		name: "Roxo",
		bg: "#a71fe2",
		border: "#6810a3",
		text: "#190221",
	},
] as const;

export function Exploration() {
	const [itemUse, setItemUse] = useState<{
		heroId: string;
		itemId?: string;
	} | null>(null);
	const { view, ui, dispatch, setFocusedHero, heroActionsFor } = useGameStore();
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);
	const [showHeroFocus, setShowHeroFocus] = useState(false);
	const [actionLogMode, setActionLogMode] = useState<ActionLogMode>("open");
	const [combatAttackHintVisible, setCombatAttackHintVisible] = useState(false);
	const [hasShownFirstAttackHint, setHasShownFirstAttackHint] = useState(false);
	const { boards, selectedBoard, selectedBoardId, setSelectedBoardId } =
		useBoardBackgrounds();
	const backCardUrls = useBackCards();
	const cardImageUrls = useCardImages();

	const status = view.status;
	const combat = view.combat;
	const focusedHero = selectFocusedHero(view, ui.focusedHeroId);
	const heroActions = heroActionsFor(focusedHero?.id ?? "");
	const activeEnemyIds = view.enemies
		.filter((enemy) => enemy.status === "active")
		.map((enemy) => enemy.id)
		.join("|");
	const heroesActedIds = combat?.heroesActed.join("|") ?? "";
	const canPromptAttack =
		(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
		(combat?.phase === "selecting_hero" ||
			combat?.phase === "selecting_target") &&
		activeEnemyIds.length > 0;
	const attackPromptTrigger = canPromptAttack
		? [
				status,
				combat?.phase,
				combat?.selectedHeroId ?? "",
				heroesActedIds,
				activeEnemyIds,
			].join(":")
		: null;

	const modal: ModalType = (() => {
		if (detailCard) return "card_detail";
		if (status === "XP_SPEND_PHASE") return "xp_spend";
		if (status === "DUNGEON_EXHAUSTED") return "dungeon_exhausted";
		if (status === "DUNGEON_RESTART_PROMPT") return "flee_restart";
		return null;
	})();

	// Auto-avança estados mecânicos
	useEffect(() => {
		const action = AUTO_ADVANCE[status];
		if (!action) return;
		const t = setTimeout(() => dispatch(action), 400);
		return () => clearTimeout(t);
	}, [status, dispatch]);

	useEffect(() => {
		if (!attackPromptTrigger) {
			setCombatAttackHintVisible(false);
			return;
		}

		if (!hasShownFirstAttackHint) {
			setHasShownFirstAttackHint(true);
			setCombatAttackHintVisible(true);
			return;
		}

		setCombatAttackHintVisible(false);
		const t = setTimeout(() => setCombatAttackHintVisible(true), 3000);
		return () => clearTimeout(t);
	}, [attackPromptTrigger, hasShownFirstAttackHint]);

	function openCardDetail(id: string, cardType: CardType) {
		setDetailCard({ id, cardType });
	}

	// Clique em card de herói: muda foco + seleciona para combate se válido
	function handleHeroClick(h: HeroState) {
		if (h.status !== "active") return;
		setFocusedHero(h.id);
		setShowHeroFocus(true);
		if (
			(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
			combat?.phase === "selecting_hero" &&
			!combat.heroesActed.includes(h.id)
		) {
			setCombatAttackHintVisible(false);
			dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: h.id } });
		}
	}

	function handleHeroDragStart(heroId: string) {
		setFocusedHero(heroId);
		setShowHeroFocus(false);
		setCombatAttackHintVisible(true);
	}

	function handleEnemyDrop(heroId: string, enemyId: string) {
		if (
			!heroActionsFor(heroId).canStartAttack ||
			!view.enemies.some(
				(enemy) => enemy.id === enemyId && enemy.status === "active",
			)
		)
			return;
		setShowHeroFocus(false);
		setCombatAttackHintVisible(false);
		dispatch({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
	}

	function handleEnemyClick(e: EnemyState) {
		openCardDetail(e.cardId, e.id === "boss" ? "boss" : "enemy");
	}

	function handleAttack() {
		setShowHeroFocus(false);
		setCombatAttackHintVisible(true);
	}

	function handlePass() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		setCombatAttackHintVisible(false);
		dispatch({ type: "PASS_HERO_ACTION", payload: { heroId: selectedHeroId } });
	}

	function handleCancelSelection() {
		setCombatAttackHintVisible(false);
		dispatch({ type: "CANCEL_HERO_SELECTION" });
	}

	function handleResolveAttack() {
		setCombatAttackHintVisible(false);
		dispatch({ type: "RESOLVE_ATTACK" });
	}

	function handleUsePower() {
		const heroId = combat?.selectedHeroId ?? focusedHero?.id;
		if (!heroId) return;
		setCombatAttackHintVisible(false);
		dispatch({ type: "USE_POWER", payload: { heroId } });
	}

	function handleFlee() {
		const heroId = combat?.selectedHeroId ?? focusedHero?.id;
		if (!heroId) return;
		setCombatAttackHintVisible(false);
		dispatch({ type: "DECLARE_FLEE", payload: { heroId } });
	}

	function handleUseSkill(skillId: string, sourceId: string) {
		dispatch({
			type: "USE_SKILL",
			payload: { skillId, sourceId },
		});
	}

	const roll = combat?.lastRoll;
	const boardBackgroundImage = selectedBoard
		? `linear-gradient(rgba(10, 9, 8, 0.08), rgba(10, 9, 8, 0.08)), url("${selectedBoard.url}")`
		: undefined;

	return (
		<>
			<div className="game-viewport">
				<div
					className="game-landscape-stage"
					style={{
						backgroundColor: UI.pageBg,
						backgroundImage: boardBackgroundImage,
					}}
				>
					<div className="game-table-vignette" />
					<div className="game-play-space">
						{/* Barra de status topo */}
						<div
							className="game-topbar flex items-center justify-between text-sm"
							style={{ background: "rgba(241, 239, 232, 0.88)" }}
						>
							<div className="flex gap-5 flex-wrap">
								<span style={{ color: UI.textSecondary }}>
									Sala:{" "}
									<strong style={{ color: UI.textPrimary }}>
										{view.roomsCleared}
									</strong>
								</span>
								<span style={{ color: UI.textSecondary }}>
									Heróis:{" "}
									<strong style={{ color: UI.textPrimary }}>
										{view.heroes.filter((h) => h.status === "active").length}
									</strong>{" "}
									ativos
								</span>
								{view.combat?.round ? (
									<span style={{ color: UI.textSecondary }}>
										Rodada:{" "}
										<strong style={{ color: UI.textPrimary }}>
											{view.combat.round}
										</strong>
									</span>
								) : null}
							</div>
							<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
								{boards.length > 0 && (
									<label
										style={{
											display: "flex",
											alignItems: "center",
											gap: 4,
											fontSize: 11,
											color: UI.textSecondary,
										}}
									>
										<span>Tabuleiro</span>
										<select
											value={selectedBoardId ?? ""}
											onChange={(event) =>
												setSelectedBoardId(event.currentTarget.value || null)
											}
											style={{
												fontSize: 11,
												borderRadius: 6,
												border: `1px solid ${UI.border}`,
												background: UI.panelBg,
												color: UI.textPrimary,
												padding: "2px 6px",
												maxWidth: 150,
											}}
										>
											{boards.map((board) => (
												<option key={board.id} value={board.id}>
													{board.name}
												</option>
											))}
										</select>
									</label>
								)}
								<span
									className="text-xs px-2 py-0.5 rounded"
									style={{ background: UI.panelBg, color: UI.textTertiary }}
								>
									{status}
								</span>
							</div>
						</div>

						{/* TABULEIRO */}
						<div className="game-board-surface">
							<Board
								view={view}
								focusedHeroId={ui.focusedHeroId}
								roll={roll ?? null}
								combatAttackHintVisible={combatAttackHintVisible}
								onHeroClick={handleHeroClick}
								onHeroDragStart={handleHeroDragStart}
								canHeroAttack={(heroId) =>
									!!heroActionsFor(heroId).canStartAttack
								}
								onEnemyDrop={handleEnemyDrop}
								onEnemyClick={handleEnemyClick}
								onRoomClick={() =>
									view.currentRoom &&
									openCardDetail(view.currentRoom.cardId, "room")
								}
								onCardDetail={openCardDetail}
								onRevealBoss={() => dispatch({ type: "REVEAL_BOSS" })}
								onContinueExploration={() =>
									dispatch({ type: "CONTINUE_EXPLORATION" })
								}
								onResolve={handleResolveAttack}
								onSelectDie={(side, index, value) =>
									dispatch({
										type: "SELECT_DIE",
										payload: { side, index, value },
									})
								}
								backCardUrls={backCardUrls}
								cardImageUrls={cardImageUrls}
							/>
						</div>

						<aside className="game-influence-chat">
							<DungeonAwakeningMarker current={view.despertar} />
							<div className="game-influence-panel">
								<InfluencePanel influences={view.activeInfluences} />
							</div>
							{actionLogMode === "hidden" ? (
								<button
									type="button"
									className="event-log-reopen"
									onClick={() => setActionLogMode("open")}
									title="Mostrar log da partida"
									aria-label="Mostrar log da partida"
								>
									📋 Log
								</button>
							) : (
								<EventLogPanel
									entries={view.eventLog}
									title="Log da partida"
									maxHeight="var(--action-log-body-max-height)"
									collapsed={actionLogMode === "collapsed"}
									onToggleCollapsed={() =>
										setActionLogMode((mode) =>
											mode === "collapsed" ? "open" : "collapsed",
										)
									}
									onClose={() => setActionLogMode("hidden")}
								/>
							)}
						</aside>

						<div className="game-bottom-dock">
							{/* EFEITOS ATIVOS — grupo (topo) + herói em foco (baixo) */}
							{(() => {
								const heroBuffs = focusedHero
									? (view.combat?.buffsByHero[focusedHero.id] ?? [])
									: [];
								const groupBuffs = view.groupBuffs;
								if (heroBuffs.length === 0 && groupBuffs.length === 0)
									return null;
								return (
									<div
										style={{
											background: UI.panelBg,
											border: `1px solid ${UI.border}`,
											borderRadius: 8,
											padding: "4px 10px",
										}}
									>
										<BuffBar buffs={groupBuffs} leadingLabel="🤝 Grupo:" />
										<hr
											style={{
												border: "none",
												borderTop: `1px dashed ${UI.border}`,
												margin: "2px 0",
											}}
										/>
										<BuffBar
											buffs={heroBuffs}
											leadingLabel={
												focusedHero
													? `🧙 ${getCardName(focusedHero.cardId).split(",")[0]?.split(" ")[0] ?? "Herói"}:`
													: "🧙 Herói:"
											}
										/>
									</div>
								);
							})()}
						</div>
					</div>

					{showHeroFocus && focusedHero && (
						<div className="game-hero-focus-layer">
							<button
								type="button"
								className="game-hero-focus-backdrop"
								onClick={() => setShowHeroFocus(false)}
								aria-label="Fechar herói em foco"
							/>
							<div className="game-hero-focus-popover">
								<HeroFocusPanel
									hero={focusedHero}
									view={view}
									heroActions={heroActions}
									onAttack={handleAttack}
									onPass={handlePass}
									onCancelSelection={handleCancelSelection}
									onPower={handleUsePower}
									onFlee={handleFlee}
									onUseSkill={handleUseSkill}
									onUseItem={() => setItemUse({ heroId: focusedHero.id })}
									onCardDetail={openCardDetail}
									onItemDetail={(itemId, heroId) =>
										setDetailCard({ id: itemId, cardType: "item", heroId })
									}
								/>
							</div>
						</div>
					)}

					{/* Modais */}
					{itemUse && (
						<UseItemModal
							heroId={itemUse.heroId}
							initialItemId={itemUse.itemId}
							onClose={() => setItemUse(null)}
						/>
					)}
					{modal === "xp_spend" && <XpSpendModal onClose={() => {}} />}
					{modal === "dungeon_exhausted" && <DungeonExhaustedModal />}
					{modal === "flee_restart" && <FleeReconfigureModal />}
					{view.pendingSkillChoice && <SkillChoiceModal />}
					{view.pendingSkillTarget && <SkillTargetModal />}
					{view.pendingTriggerInterrupt && <TriggerInterruptModal />}
					{modal === "card_detail" && detailCard && (
						<CardDetailModal
							cardId={detailCard.id}
							cardType={detailCard.cardType}
							imageUrl={getCardImageUrl(cardImageUrls, detailCard.id)}
							onClose={() => setDetailCard(null)}
							onUseItem={
								detailCard.heroId &&
								heroActionsFor(detailCard.heroId).usableItems?.some(
									(item) => item.itemId === detailCard.id,
								)
									? () => {
											setItemUse({
												heroId: detailCard.heroId!,
												itemId: detailCard.id,
											});
											setDetailCard(null);
										}
									: undefined
							}
						/>
					)}
				</div>
			</div>

			{/* Tela de inventário — cobre a exploração durante REWARD_PHASE */}
			{status === "REWARD_PHASE" && <InventarioGrupo />}
		</>
	);
}

function DungeonAwakeningMarker({
	current,
}: {
	current: PlayerView["despertar"];
}) {
	const active = AWAKENING_LEVELS[current];
	const markerStyle = {
		"--awakening-bg": active.bg,
		"--awakening-border": active.border,
		"--awakening-text": active.text,
	} as CSSProperties;

	return (
		<section className="game-awakening-marker" style={markerStyle}>
			<div className="game-awakening-marker__heading">
				<span>Despertar da Masmorra</span>
				<strong>Nível {current + 1}</strong>
			</div>
			<div className="game-awakening-marker__rule">Efeitos dos níveis</div>
			<ul
				className="game-awakening-marker__levels"
				aria-label="Níveis do despertar"
			>
				{AWAKENING_LEVELS.map((level, index) => {
					const isCurrent = index === current;
					return (
						<li
							key={level.name}
							className={`game-awakening-marker__level${
								isCurrent ? " is-current" : ""
							}`}
							style={
								{
									"--level-bg": level.bg,
									"--level-border": level.border,
									"--level-text": level.text,
								} as CSSProperties
							}
							title={`${index + 1} · ${level.name}`}
						>
							<span>{index + 1}</span>
							<small>{level.name}</small>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
