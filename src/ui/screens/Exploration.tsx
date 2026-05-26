// Tela de Exploração — Patch 3.
// Layout: TopBar · Board (tabuleiro coletivo) · HeroFocusPanel (herói em foco).

import { useEffect, useState } from "react";
import type { Action } from "@/core/actions/types";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import type { CardType } from "@/ui/components/Card";
import { Board } from "@/ui/components/Board";
import { HeroFocusPanel } from "@/ui/components/HeroFocusPanel";
import { InventarioGrupo } from "@/ui/components/InventarioGrupo";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { FleeReconfigureModal } from "@/ui/components/modals/FleeReconfigureModal";
import { OpenPathsModal } from "@/ui/components/modals/OpenPathsModal";
import { SkillChoiceModal } from "@/ui/components/modals/SkillChoiceModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
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
	name: string;
	cardType: CardType;
	heroId?: string;
}

export function Exploration() {
	const { state, ui, dispatch, setFocusedHero } = useGameStore();
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);

	const status = state.status;
	const combat = state.combat;
	const focusedHero = selectFocusedHero(state, ui.focusedHeroId);

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

	function openCardDetail(name: string, cardType: CardType) {
		setDetailCard({ name, cardType });
	}

	// Clique em card de herói: muda foco + seleciona para combate se válido
	function handleHeroClick(h: HeroState) {
		if (h.status !== "active") return;
		setFocusedHero(h.id);
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
			status === "HERO_ACTION" &&
			combat?.phase === "selecting_target" &&
			combat.selectedHeroId
		) {
			dispatch({
				type: "CHOOSE_TARGET",
				payload: { heroId: combat.selectedHeroId, enemyId: e.id },
			});
			return;
		}
		openCardDetail(e.cardName, e.id === "boss" ? "boss" : "enemy");
	}

	// Botão "Atacar" no painel: usa selectedHeroId + primeiro inimigo ativo
	function handleAttack() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		const target = state.activeEnemies.find((e) => e.status === "active");
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

	return (
		<>
		<div className="min-h-screen py-4 px-4" style={{ background: UI.pageBg }}>
			<div className="max-w-4xl mx-auto space-y-3">

				{/* Barra de status topo */}
				<div
					className="flex items-center justify-between px-4 py-2 rounded-lg text-sm"
					style={{ background: UI.subpanelBg }}
				>
					<div className="flex gap-5 flex-wrap">
						<span style={{ color: UI.textSecondary }}>
							Sala:{" "}
							<strong style={{ color: UI.textPrimary }}>
								{state.roomsCleared}
							</strong>
						</span>
						<span style={{ color: UI.textSecondary }}>
							Heróis:{" "}
							<strong style={{ color: UI.textPrimary }}>
								{state.heroes.filter((h) => h.status === "active").length}
							</strong>{" "}
							ativos
						</span>
						{state.combat?.round ? (
							<span style={{ color: UI.textSecondary }}>
								Rodada:{" "}
								<strong style={{ color: UI.textPrimary }}>
									{state.combat.round}
								</strong>
							</span>
						) : null}
					</div>
					<span
						className="text-xs px-2 py-0.5 rounded"
						style={{ background: UI.panelBg, color: UI.textTertiary }}
					>
						{status}
					</span>
				</div>

				{/* TABULEIRO */}
				<Board
					state={state}
					focusedHeroId={ui.focusedHeroId}
					roll={roll ?? null}
					onHeroClick={handleHeroClick}
					onHeroDragStart={handleHeroDragStart}
					onEnemyDrop={handleEnemyDrop}
					onEnemyClick={handleEnemyClick}
					onRoomClick={() =>
						state.currentRoom &&
						openCardDetail(state.currentRoom.cardName, "room")
					}
					onCardDetail={openCardDetail}
					onReveal={() => dispatch({ type: "REVEAL_ROOM" })}
					onStartCombat={() => dispatch({ type: "START_COMBAT" })}
					onRevealBoss={() => dispatch({ type: "REVEAL_BOSS" })}
					onRoll={handleRollDice}
					onResolve={handleResolveAttack}
					onSelectDie={(side, index) => dispatch({ type: "SELECT_DIE", payload: { side, index } })}
				/>

				{/* PAINEL DO HERÓI EM FOCO */}
				<HeroFocusPanel
					hero={focusedHero}
					state={state}
					onAttack={handleAttack}
					onPass={handlePass}
					onCancelSelection={handleCancelSelection}
					onPower={handleUsePower}
					onFlee={handleFlee}
					onUseSkill={handleUseSkill}
					onCardDetail={openCardDetail}
					onItemDetail={(itemName, heroId) =>
						setDetailCard({ name: itemName, cardType: "item", heroId })
					}
				/>
			</div>

			{/* Modais */}
			{modal === "xp_spend" && <XpSpendModal onClose={() => {}} />}
			{modal === "open_paths" && <OpenPathsModal onClose={() => {}} />}
			{modal === "dungeon_exhausted" && <DungeonExhaustedModal />}
			{modal === "flee_restart" && <FleeReconfigureModal />}
			{state.pendingSkillChoice && <SkillChoiceModal />}
			{modal === "card_detail" && detailCard && (
				<CardDetailModal
					cardName={detailCard.name}
					cardType={detailCard.cardType}
					onClose={() => setDetailCard(null)}
					onUseItem={
						detailCard.heroId
							? () => {
									dispatch({ type: "USE_ITEM", payload: { itemName: detailCard.name, heroId: detailCard.heroId! } });
									setDetailCard(null);
								}
							: undefined
					}
				/>
			)}
		</div>

		{/* Tela de inventário — cobre a exploração durante REWARD_PHASE */}
		{status === "REWARD_PHASE" && <InventarioGrupo />}
		</>
	);
}
