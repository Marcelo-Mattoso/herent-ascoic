// Tela de Exploração — Patch 3.
// Layout: TopBar · Board (tabuleiro coletivo) · HeroFocusPanel (herói em foco).

import { useEffect, useState } from "react";
import type { Action } from "@/core/actions/types";
import { getCardName } from "@/core/data/cardLocale";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import { Board } from "@/ui/components/Board";
import { BuffBar } from "@/ui/components/BuffBar";
import type { CardType } from "@/ui/components/Card";
import { EventLogPanel } from "@/ui/components/EventLogPanel";
import { InfluencePanel } from "@/ui/components/InfluencePanel";
import { HeroFocusPanel } from "@/ui/components/HeroFocusPanel";
import { InventarioGrupo } from "@/ui/components/InventarioGrupo";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { FleeReconfigureModal } from "@/ui/components/modals/FleeReconfigureModal";
import { OpenPathsModal } from "@/ui/components/modals/OpenPathsModal";
import { SkillChoiceModal } from "@/ui/components/modals/SkillChoiceModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
import { getCardImageUrl } from "@/ui/cardImages";
import { useBackCards } from "@/ui/hooks/useBackCards";
import { useBoardBackgrounds } from "@/ui/hooks/useBoardBackgrounds";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useGameStore } from "@/ui/store/gameStore";
import { selectFocusedHero } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";

// Estados mecânicos auto-avançados sem decisão do jogador
const AUTO_ADVANCE: Partial<Record<string, Action>> = {
	ROOM_EFFECT: { type: "RESOLVE_ROOM_EFFECT" },
	SPAWN_ENEMIES: { type: "SPAWN_ENEMIES" },
	CHECK_COMBAT_END: { type: "CHECK_COMBAT_END" },
	DIRECT_DAMAGE: { type: "DIRECT_DAMAGE" },
};

type ModalType =
	| "xp_spend"
	| "open_paths"
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

export function Exploration() {
	const { view, ui, dispatch, setFocusedHero, heroActionsFor } = useGameStore();
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);
	const [showHeroFocus, setShowHeroFocus] = useState(false);
	const [actionLogMode, setActionLogMode] = useState<ActionLogMode>("open");
	const { boards, selectedBoard, selectedBoardId, setSelectedBoardId } =
		useBoardBackgrounds();
	const backCardUrls = useBackCards();
	const cardImageUrls = useCardImages();

	const status = view.status;
	const combat = view.combat;
	const focusedHero = selectFocusedHero(view, ui.focusedHeroId);
	const heroActions = heroActionsFor(focusedHero?.id ?? "");

	const modal: ModalType = (() => {
		if (detailCard) return "card_detail";
		if (status === "XP_SPEND_PHASE") return "xp_spend";
		if (status === "CHOOSE_PATH") return "open_paths";
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

	// Segundo dispatch do OPEN_PATHS
	useEffect(() => {
		if (status === "OPEN_PATHS") {
			const t = setTimeout(() => dispatch({ type: "OPEN_PATHS" }), 200);
			return () => clearTimeout(t);
		}
	}, [status, dispatch]);

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
			dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: h.id } });
		}
	}

	// Drag do herói: garante que o herói seja selecionado para a rodada
	function handleHeroDragStart(heroId: string) {
		setFocusedHero(heroId);
		if (
			(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
			combat?.phase === "selecting_hero" &&
			!combat.heroesActed.includes(heroId)
		) {
			dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId } });
		}
	}

	// Drop de herói sobre inimigo → ataca
	function handleEnemyDrop(heroId: string, enemyId: string) {
		dispatch({
			type: "CHOOSE_TARGET",
			payload: { heroId, enemyId },
		});
	}

	// Clique em inimigo: seleciona alvo em selecting_target, ou abre detalhe
	function handleEnemyClick(e: EnemyState) {
		if (
			(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
			combat?.phase === "selecting_target" &&
			combat.selectedHeroId
		) {
			dispatch({
				type: "CHOOSE_TARGET",
				payload: { heroId: combat.selectedHeroId, enemyId: e.id },
			});
			return;
		}
		openCardDetail(e.cardId, e.id === "boss" ? "boss" : "enemy");
	}

	// Botão "Atacar" no painel: usa selectedHeroId + primeiro inimigo ativo
	function handleAttack() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		const target = view.enemies.find((e) => e.status === "active");
		if (!target) return;
		dispatch({
			type: "CHOOSE_TARGET",
			payload: { heroId: selectedHeroId, enemyId: target.id },
		});
	}

	function handlePass() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		dispatch({ type: "PASS_HERO_ACTION", payload: { heroId: selectedHeroId } });
	}

	function handleCancelSelection() {
		dispatch({ type: "CANCEL_HERO_SELECTION" });
	}

	function handleRollDice() {
		dispatch({ type: "ROLL_DICE" });
	}

	function handleResolveAttack() {
		dispatch({ type: "RESOLVE_ATTACK" });
	}

	function handleUsePower() {
		const heroId = combat?.selectedHeroId ?? focusedHero?.id;
		if (!heroId) return;
		dispatch({ type: "USE_POWER", payload: { heroId } });
	}

	function handleFlee() {
		const heroId = combat?.selectedHeroId ?? focusedHero?.id;
		if (!heroId) return;
		dispatch({ type: "DECLARE_FLEE", payload: { heroId } });
	}

	function handleUseSkill(skillId: string, sourceId: string) {
		// Por ora auto-alvo: o herói usa a habilidade em si mesmo.
		// Habilidades que exigem seleção de alvo serão tratadas numa camada de targeting futura.
		dispatch({
			type: "USE_SKILL",
			payload: { skillId, sourceId, targetIds: [sourceId] },
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
								onHeroClick={handleHeroClick}
								onHeroDragStart={handleHeroDragStart}
								onEnemyDrop={handleEnemyDrop}
								onEnemyClick={handleEnemyClick}
								onRoomClick={() =>
									view.currentRoom &&
									openCardDetail(view.currentRoom.cardId, "room")
								}
								onCardDetail={openCardDetail}
								onReveal={() => dispatch({ type: "REVEAL_ROOM" })}
								onStartCombat={() => dispatch({ type: "START_COMBAT" })}
								onRevealBoss={() => dispatch({ type: "REVEAL_BOSS" })}
								onRoll={handleRollDice}
								onResolve={handleResolveAttack}
								onSelectDie={(side, index) =>
									dispatch({ type: "SELECT_DIE", payload: { side, index } })
								}
								backCardUrls={backCardUrls}
								cardImageUrls={cardImageUrls}
							/>
						</div>

						<aside className="game-influence-chat">
							<InfluencePanel influences={view.activeInfluences} />
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
						<div
							className="game-hero-focus-layer"
							onMouseDown={() => setShowHeroFocus(false)}
						>
							<div
								className="game-hero-focus-popover"
								onMouseDown={(event) => event.stopPropagation()}
							>
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
									onCardDetail={openCardDetail}
									onItemDetail={(itemId, heroId) =>
										setDetailCard({ id: itemId, cardType: "item", heroId })
									}
								/>
							</div>
						</div>
					)}

					{/* Modais */}
					{modal === "xp_spend" && <XpSpendModal onClose={() => {}} />}
					{modal === "open_paths" && <OpenPathsModal onClose={() => {}} />}
					{modal === "dungeon_exhausted" && <DungeonExhaustedModal />}
					{modal === "flee_restart" && <FleeReconfigureModal />}
					{view.pendingSkillChoice && <SkillChoiceModal />}
					{modal === "card_detail" && detailCard && (
						<CardDetailModal
							cardId={detailCard.id}
							cardType={detailCard.cardType}
							imageUrl={getCardImageUrl(cardImageUrls, detailCard.id)}
							onClose={() => setDetailCard(null)}
							onUseItem={
								detailCard.heroId
									? () => {
											dispatch({
												type: "USE_ITEM",
												payload: {
													itemId: detailCard.id,
													heroId: detailCard.heroId!,
												},
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
