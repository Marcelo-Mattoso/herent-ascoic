// Tela principal de exploração. Cobre todos os status de jogo exceto menus e término.
// Patch 2: herói em foco, seleção sequencial herói→monstro, fases de combate.

import { useEffect, useState } from "react";
import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";
import type { HeroState } from "@/core/state/heroState";
import { getCardByName } from "@/data/cards";
import { ActionButton } from "@/ui/components/ActionButton";
import type { CardType } from "@/ui/components/Card";
import { ColorBar } from "@/ui/components/ColorBar";
import { CombatActionPanel } from "@/ui/components/CombatActionPanel";
import { DiceDisplay } from "@/ui/components/DiceDisplay";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { OpenPathsModal } from "@/ui/components/modals/OpenPathsModal";
import { RewardModal } from "@/ui/components/modals/RewardModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
import { StackPreview } from "@/ui/components/StackPreview";
import { StatusBadge } from "@/ui/components/StatusBadge";
import { useGameStore } from "@/ui/store/gameStore";
import { selectFocusedHero } from "@/ui/store/selectors";
import { COLORS_MAP, UI } from "@/ui/theme";

// Estados que o sistema avança automaticamente (sem decisão do jogador)
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
	| "reward"
	| "card_detail"
	| null;

interface CardDetailState {
	name: string;
	cardType: CardType;
}

export function Exploration() {
	const { state, ui, dispatch, setFocusedHero } = useGameStore();
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);

	const status = state.status;
	const combat = state.combat;
	const heroesActed = combat?.heroesActed ?? [];
	const enemiesEngaged = new Set(combat?.enemiesEngaged ?? []);
	const allHeroes = state.heroes;
	const activeHeroes = allHeroes.filter((h) => h.status === "active");
	const enemies = state.activeEnemies.filter((e) => e.status === "active");
	const roll = combat?.lastRoll;

	// Herói em foco — determina qual inventário aparece no painel inferior
	const focusedHero = selectFocusedHero(state, ui.focusedHeroId);

	// Modal derivado do estado do jogo (sem useState para evitar cascata de renders)
	const modal: ModalType = (() => {
		if (detailCard) return "card_detail";
		if (state.pendingRewards.length > 0) return "reward";
		if (status === "XP_SPEND_PHASE") return "xp_spend";
		if (status === "CHOOSE_PATH") return "open_paths";
		if (status === "DUNGEON_EXHAUSTED") return "dungeon_exhausted";
		return null;
	})();

	// Auto-avança estados mecânicos com pequeno atraso para mostrar feedback visual
	useEffect(() => {
		const action = AUTO_ADVANCE[status];
		if (!action) return;
		const t = setTimeout(() => dispatch(action), 400);
		return () => clearTimeout(t);
	}, [status, dispatch]);

	// Auto-coleta recompensas quando entra em REWARD_PHASE sem pendências
	useEffect(() => {
		if (status === "REWARD_PHASE" && state.pendingRewards.length === 0) {
			const t = setTimeout(() => dispatch({ type: "GRANT_REWARDS" }), 300);
			return () => clearTimeout(t);
		}
	}, [status, state.pendingRewards.length, dispatch]);

	// Quando OPEN_PATHS ainda precisa de um segundo dispatch
	useEffect(() => {
		if (status === "OPEN_PATHS") {
			const t = setTimeout(() => dispatch({ type: "OPEN_PATHS" }), 200);
			return () => clearTimeout(t);
		}
	}, [status, dispatch]);

	function openCardDetail(name: string, cardType: CardType) {
		setDetailCard({ name, cardType });
	}

	// Clique em card de herói:
	// • sempre muda o foco (painel inferior)
	// • em selecting_hero e herói disponível → dispara CHOOSE_HERO_FOR_ROUND
	function handleHeroCardClick(h: HeroState) {
		if (h.status !== "active") return;
		setFocusedHero(h.id);
		if (
			status === "HERO_ACTION" &&
			combat?.phase === "selecting_hero" &&
			!heroesActed.includes(h.id)
		) {
			dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: h.id } });
		}
	}

	// Clique em card de inimigo:
	// • em selecting_target e inimigo disponível → dispara CHOOSE_TARGET
	// • caso contrário → abre modal de detalhe
	function handleEnemyCardClick(e: (typeof enemies)[number]) {
		if (
			status === "HERO_ACTION" &&
			combat?.phase === "selecting_target" &&
			!enemiesEngaged.has(e.id) &&
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

	// Botão "Atacar" no CombatActionPanel — usa selectedHeroId + primeiro inimigo livre
	function handleAttack() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		const target = enemies.find((e) => !enemiesEngaged.has(e.id));
		if (!target) return;
		dispatch({
			type: "CHOOSE_TARGET",
			payload: { heroId: selectedHeroId, enemyId: target.id },
		});
	}

	// Botão "Passar rodada" — passa o herói selecionado
	function handlePass() {
		const selectedHeroId = combat?.selectedHeroId;
		if (!selectedHeroId) return;
		dispatch({ type: "PASS_HERO_ACTION", payload: { heroId: selectedHeroId } });
	}

	// Botão "Cancelar seleção"
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

	// CombatActionPanel cobre HERO_ACTION, ROLL_DICE, RESOLVE_ATTACK
	const useCombatPanel = [
		"HERO_ACTION",
		"ROLL_DICE",
		"RESOLVE_ATTACK",
	].includes(status);
	const despertar = COLORS_MAP[state.despertar];

	return (
		<div className="min-h-screen py-4 px-4" style={{ background: UI.pageBg }}>
			<div className="max-w-4xl mx-auto space-y-3">
				{/* Barra de status */}
				<div
					className="flex items-center justify-between px-4 py-2 rounded-lg text-sm"
					style={{ background: UI.subpanelBg }}
				>
					<div className="flex gap-5 flex-wrap">
						<span style={{ color: UI.textSecondary }}>
							XP:{" "}
							<strong style={{ color: UI.textPrimary }}>{state.groupXp}</strong>
						</span>
						<span style={{ color: UI.textSecondary }}>
							Sala:{" "}
							<strong style={{ color: UI.textPrimary }}>
								{state.roomsCleared}
							</strong>
						</span>
						<span style={{ color: UI.textSecondary }}>
							Condição:{" "}
							<strong style={{ color: UI.textPrimary }}>≥2 Artefatos</strong> (
							{state.groupArtifacts.length}/2)
						</span>
						{activeHeroes.length > 0 && (
							<span style={{ color: UI.textSecondary }}>
								<strong style={{ color: UI.textPrimary }}>
									{activeHeroes.length}
								</strong>{" "}
								herói{activeHeroes.length !== 1 ? "s" : ""} ativo
								{activeHeroes.length !== 1 ? "s" : ""}
							</span>
						)}
					</div>
					<span
						className="text-xs px-2 py-0.5 rounded"
						style={{ background: UI.subpanelBg, color: UI.textTertiary }}
					>
						{status}
					</span>
				</div>

				{/* Artefatos */}
				<div
					className="px-4 py-2 rounded-lg text-sm"
					style={{
						background: UI.artifactBg,
						border: `1px solid ${UI.artifactBorder}`,
					}}
				>
					<span
						className="text-xs font-medium mr-3"
						style={{ color: UI.textSecondary }}
					>
						Artefatos do grupo
					</span>
					{state.groupArtifacts.length === 0 ? (
						<span className="text-xs" style={{ color: UI.textTertiary }}>
							Nenhum ainda · precisa de 2 para enfrentar o chefe
						</span>
					) : (
						state.groupArtifacts.map((a) => (
							<button
								key={a.cardName}
								type="button"
								className="text-xs underline mr-3"
								style={{ color: UI.textPrimary }}
								onClick={() => openCardDetail(a.cardName, "artifact")}
							>
								{a.cardName}
							</button>
						))
					)}
				</div>

				{/* Pilhas */}
				<div className="grid grid-cols-4 gap-2">
					{[
						{ name: "Monstros", deck: state.decks.enemyDeck },
						{ name: "Masmorra", deck: state.decks.dungeonDeck },
						{ name: "Itens", deck: state.decks.itemDeck },
						{ name: "Artefatos", deck: state.decks.artifactDeck },
					].map(({ name, deck }) => (
						<StackPreview
							key={name}
							name={name}
							count={deck.available.length}
							discardCount={deck.discarded.length}
						/>
					))}
				</div>

				{/* Campo de batalha */}
				<div
					className="rounded-xl p-4"
					style={{ border: `1.5px solid ${UI.borderStrong}` }}
				>
					<p
						className="text-xs font-medium mb-3"
						style={{ color: UI.textTertiary }}
					>
						CAMPO DE BATALHA
					</p>
					<div
						className="grid gap-4"
						style={{ gridTemplateColumns: "1fr 130px" }}
					>
						<div className="space-y-3">
							{/* Inimigos + Sala */}
							<div className="grid grid-cols-2 gap-3">
								{/* Inimigos */}
								<div>
									<p
										className="text-xs mb-1"
										style={{ color: UI.textTertiary }}
									>
										Inimigos
									</p>
									<div className="flex gap-2 flex-wrap">
										{enemies.length === 0 && (
											<div
												className="flex-1 h-16 rounded border-dashed border flex items-center justify-center"
												style={{ borderColor: UI.border }}
											>
												<span
													className="text-xs"
													style={{ color: UI.textTertiary }}
												>
													vazio
												</span>
											</div>
										)}
										{enemies.map((e) => {
											const isSelectingTarget =
												status === "HERO_ACTION" &&
												combat?.phase === "selecting_target" &&
												!!combat.selectedHeroId;
											const isEngaged = enemiesEngaged.has(e.id);
											const isSelectable = isSelectingTarget && !isEngaged;

											return (
												<button
													key={e.id}
													type="button"
													className="flex-1 min-w-24 p-2 rounded-lg text-left transition-all"
													style={{
														background: isSelectable
															? UI.success.bg
															: UI.subpanelBg,
														border: `1.5px solid ${
															isSelectable ? "#3B6D11" : UI.border
														}`,
														opacity: isSelectingTarget && isEngaged ? 0.45 : 1,
														cursor: isSelectable ? "pointer" : "default",
													}}
													onClick={() => handleEnemyCardClick(e)}
												>
													<p
														className="text-xs font-medium truncate"
														style={{ color: UI.textPrimary }}
													>
														{e.cardName}
														{isEngaged && (
															<span
																className="ml-1"
																style={{ color: UI.textTertiary }}
															>
																🔒
															</span>
														)}
													</p>
													<p
														className="text-xs"
														style={{ color: UI.textSecondary }}
													>
														Vida {e.currentLife}/{e.maxLife} · +{e.hitBonus} · D
														{e.damage}
													</p>
													{isSelectable && (
														<p
															className="text-xs mt-0.5"
															style={{ color: UI.success.text }}
														>
															clique para atacar
														</p>
													)}
													{isSelectingTarget && isEngaged && (
														<p
															className="text-xs mt-0.5"
															style={{ color: UI.textTertiary }}
														>
															engajado
														</p>
													)}
												</button>
											);
										})}
									</div>
								</div>

								{/* Sala atual */}
								<div>
									<p
										className="text-xs mb-1"
										style={{ color: UI.textTertiary }}
									>
										Sala atual
									</p>
									{state.currentRoom ? (
										<button
											type="button"
											className="w-full p-2 rounded-lg text-left hover:opacity-80"
											style={{
												background: UI.subpanelBg,
												border: `1px solid ${UI.border}`,
											}}
											onClick={() =>
												openCardDetail(
													state.currentRoom?.cardName ?? "",
													"room",
												)
											}
										>
											<p
												className="text-xs font-medium"
												style={{ color: UI.textPrimary }}
											>
												{state.currentRoom.cardName}
											</p>
											<p
												className="text-xs"
												style={{ color: UI.textSecondary }}
											>
												Saídas {state.currentRoom.exits} · XP{" "}
												{state.currentRoom.xp}
											</p>
											{state.currentRoom.effect && (
												<p
													className="text-xs italic mt-0.5 truncate"
													style={{ color: UI.textTertiary }}
												>
													{state.currentRoom.effect}
												</p>
											)}
										</button>
									) : (
										<div
											className="h-16 rounded border-dashed border flex items-center justify-center"
											style={{ borderColor: UI.border }}
										>
											<span
												className="text-xs"
												style={{ color: UI.textTertiary }}
											>
												sem sala
											</span>
										</div>
									)}
								</div>
							</div>

							{/* Rolagem */}
							{roll && (
								<div
									className="p-3 rounded-lg"
									style={{ background: UI.subpanelBg }}
								>
									<p
										className="text-xs font-medium mb-2"
										style={{ color: UI.textTertiary }}
									>
										ROLAGEM
									</p>
									<div className="flex items-start gap-4">
										<DiceDisplay
											results={roll.heroResults}
											total={roll.heroTotal}
											bonuses={roll.heroBreakdown}
											side="hero"
											label="Herói"
										/>
										<div
											className="text-sm font-bold self-center"
											style={{ color: UI.textTertiary }}
										>
											vs
										</div>
										<DiceDisplay
											results={roll.enemyResults}
											total={roll.enemyTotal}
											bonuses={roll.enemyBreakdown}
											side="enemy"
											label="Inimigo"
										/>
									</div>
								</div>
							)}
						</div>

						{/* Despertar */}
						<div
							className="flex flex-col items-center justify-center p-3 rounded-lg"
							style={{
								background: despertar.bg,
								border: `1px solid ${despertar.border}`,
							}}
						>
							<p
								className="text-xs font-medium mb-2"
								style={{ color: despertar.text }}
							>
								Despertar
							</p>
							<p
								className="text-lg font-medium mb-1"
								style={{ color: despertar.text }}
							>
								{despertar.name}
							</p>
							<ColorBar current={state.despertar} />
						</div>
					</div>
				</div>

				{/* Painel de ações */}
				{useCombatPanel ? (
					<CombatActionPanel
						state={state}
						onAttack={handleAttack}
						onPass={handlePass}
						onCancelSelection={handleCancelSelection}
						onRoll={handleRollDice}
						onResolve={handleResolveAttack}
						onPower={handleUsePower}
					/>
				) : (
					<ActionButtons
						state={state}
						onAttack={handleAttack}
						onRoll={handleRollDice}
						onResolve={handleResolveAttack}
						onPower={handleUsePower}
						onReveal={() => dispatch({ type: "REVEAL_ROOM" })}
						onStartCombat={() => dispatch({ type: "START_COMBAT" })}
						onRevealBoss={() => dispatch({ type: "REVEAL_BOSS" })}
					/>
				)}

				{/* Painel de heróis */}
				{allHeroes.length === 1 && allHeroes[0] && focusedHero && (
					<SingleHeroPanel
						hero={focusedHero}
						state={state}
						onHeroCardClick={handleHeroCardClick}
						onCardClick={openCardDetail}
					/>
				)}

				{allHeroes.length > 1 && (
					<MultiHeroPanel
						heroes={allHeroes}
						focusedHeroId={ui.focusedHeroId}
						focusedHero={focusedHero}
						state={state}
						heroesActed={heroesActed}
						selectedHeroId={combat?.selectedHeroId ?? null}
						combatPhase={combat?.phase ?? null}
						gameStatus={status}
						onHeroCardClick={handleHeroCardClick}
						onCardClick={openCardDetail}
					/>
				)}
			</div>

			{/* Modais */}
			{modal === "reward" && <RewardModal onClose={() => {}} />}
			{modal === "xp_spend" && <XpSpendModal onClose={() => {}} />}
			{modal === "open_paths" && <OpenPathsModal onClose={() => {}} />}
			{modal === "dungeon_exhausted" && <DungeonExhaustedModal />}
			{modal === "card_detail" && detailCard && (
				<CardDetailModal
					cardName={detailCard.name}
					cardType={detailCard.cardType}
					onClose={() => setDetailCard(null)}
				/>
			)}
		</div>
	);
}

// ─── PAINEL 1 HERÓI ───────────────────────────────────────────────────────────

function SingleHeroPanel({
	hero,
	state,
	onHeroCardClick,
	onCardClick,
}: {
	hero: HeroState;
	state: GameState;
	onHeroCardClick: (h: HeroState) => void;
	onCardClick: (name: string, type: CardType) => void;
}) {
	return (
		<div
			className="grid gap-4 p-4 rounded-xl"
			style={{
				gridTemplateColumns: "130px 1fr",
				background: UI.panelBg,
				border: `1px solid ${UI.border}`,
			}}
		>
			<div>
				<p className="text-xs mb-1" style={{ color: UI.textTertiary }}>
					Herói
				</p>
				<button
					type="button"
					className="w-full text-left"
					onClick={() => onHeroCardClick(hero)}
				>
					<div
						className="h-20 rounded mb-1 flex items-center justify-center"
						style={{ background: UI.subpanelBg }}
					>
						<span className="text-3xl">🧙</span>
					</div>
				</button>
				<p className="text-xs font-medium" style={{ color: UI.textPrimary }}>
					{hero.cardName}
				</p>
				<p className="text-xs" style={{ color: UI.textSecondary }}>
					Vida {hero.currentLife}/{hero.maxLife}
				</p>
				<p className="text-xs" style={{ color: UI.textSecondary }}>
					+{hero.hitBonus} · D{hero.damage}
				</p>
				<div className="mt-2">
					<ColorBar current={hero.impeto} label="Ímpeto" />
				</div>
				{hero.conditions.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-1">
						{hero.conditions.map((c) => (
							<StatusBadge key={c} label={c} variant="danger" />
						))}
					</div>
				)}
			</div>
			<HeroRightPanel hero={hero} state={state} onCardClick={onCardClick} />
		</div>
	);
}

// ─── PAINEL MÚLTIPLOS HERÓIS ──────────────────────────────────────────────────

interface MultiHeroPanelProps {
	heroes: readonly HeroState[];
	focusedHeroId: string | null;
	focusedHero: HeroState | null;
	state: GameState;
	heroesActed: readonly string[];
	selectedHeroId: string | null;
	combatPhase: string | null;
	gameStatus: string;
	onHeroCardClick: (h: HeroState) => void;
	onCardClick: (name: string, type: CardType) => void;
}

function MultiHeroPanel({
	heroes,
	focusedHeroId,
	focusedHero,
	state,
	heroesActed,
	selectedHeroId,
	combatPhase,
	gameStatus,
	onHeroCardClick,
	onCardClick,
}: MultiHeroPanelProps) {
	const isInCombat =
		gameStatus === "HERO_ACTION" || gameStatus === "BOSS_COMBAT";

	return (
		<div
			className="p-3 rounded-xl"
			style={{ background: UI.panelBg, border: `1px solid ${UI.border}` }}
		>
			<p className="text-xs mb-2" style={{ color: UI.textTertiary }}>
				HERÓIS ({heroes.filter((h) => h.status === "active").length} ativos)
			</p>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{heroes.map((h) => {
					const isFocused = h.id === focusedHeroId;
					const isSelected = h.id === selectedHeroId;
					const hasActed = heroesActed.includes(h.id);
					const isDefeated = h.status === "defeated";
					const hasFled = h.status === "fled";
					const isActive = h.status === "active";

					// Disponível para agir nesta rodada em selecting_hero
					const isAvailableToAct =
						isActive &&
						!hasActed &&
						combatPhase === "selecting_hero" &&
						gameStatus === "HERO_ACTION";

					// Cor de borda e fundo
					let borderColor = UI.border;
					let bgColor = UI.subpanelBg;
					let borderStyle: "solid" | "dashed" = "solid";
					let borderWidth = "1px";

					if (isSelected) {
						borderColor = "#185FA5";
						bgColor = UI.info.bg;
						borderWidth = "2px";
					} else if (isFocused && isActive) {
						borderColor = "#185FA5";
						borderWidth = "2px";
					} else if (isAvailableToAct) {
						borderColor = UI.success.text;
					}

					if (hasFled) {
						borderStyle = "dashed";
						borderColor = UI.textTertiary;
					}

					const canClick = isActive;

					return (
						<button
							key={h.id}
							type="button"
							className="flex-shrink-0 p-2 rounded-lg text-left w-32 transition-all"
							style={{
								background: bgColor,
								border: `${borderWidth} ${borderStyle} ${borderColor}`,
								opacity:
									isDefeated || hasFled
										? 0.45
										: hasActed && !isFocused
											? 0.65
											: 1,
								cursor: canClick ? "pointer" : "default",
							}}
							onClick={() => canClick && onHeroCardClick(h)}
						>
							<div className="flex items-center gap-1 mb-1">
								<span className="text-base">🧙</span>
								{isSelected && (
									<span
										className="text-xs px-1 rounded"
										style={{ background: UI.info.bg, color: UI.info.text }}
									>
										▶
									</span>
								)}
								{!isSelected && isActive && isInCombat && !hasActed && (
									<span className="text-xs" style={{ color: UI.success.text }}>
										◦
									</span>
								)}
								{hasActed && (
									<span className="text-xs" style={{ color: UI.textTertiary }}>
										✓
									</span>
								)}
								{isDefeated && (
									<span className="text-xs" style={{ color: UI.danger.text }}>
										✕
									</span>
								)}
								{hasFled && (
									<span className="text-xs" style={{ color: UI.textTertiary }}>
										↩
									</span>
								)}
							</div>
							<p
								className="text-xs font-medium leading-tight truncate"
								style={{ color: isDefeated ? UI.textTertiary : UI.textPrimary }}
							>
								{h.cardName}
							</p>
							<p className="text-xs" style={{ color: UI.textSecondary }}>
								{h.currentLife}/{h.maxLife} vida
							</p>
							{isActive && <ColorBar current={h.impeto} />}
							{isDefeated && (
								<p className="text-xs mt-0.5" style={{ color: UI.danger.text }}>
									derrotado
								</p>
							)}
							{hasFled && (
								<p
									className="text-xs mt-0.5"
									style={{ color: UI.textTertiary }}
								>
									fugiu
								</p>
							)}
							{isAvailableToAct && !isSelected && (
								<p
									className="text-xs mt-0.5"
									style={{ color: UI.success.text }}
								>
									clique p/ agir
								</p>
							)}
						</button>
					);
				})}
			</div>

			{/* Painel inferior: inventário do herói em foco */}
			{focusedHero && (
				<div
					className="mt-2 pt-2"
					style={{ borderTop: `1px solid ${UI.border}` }}
				>
					<p className="text-xs mb-1" style={{ color: UI.textTertiary }}>
						{focusedHero.cardName}{" "}
						{focusedHero.status !== "active" && (
							<span style={{ color: UI.danger.text }}>
								({focusedHero.status === "defeated" ? "derrotado" : "fugiu"})
							</span>
						)}
					</p>
					<HeroRightPanel
						hero={focusedHero}
						state={state}
						onCardClick={onCardClick}
					/>
				</div>
			)}
		</div>
	);
}

// ─── BOTÕES DE AÇÃO (estados não-combate) ─────────────────────────────────────

function ActionButtons({
	state,
	onAttack,
	onRoll,
	onResolve,
	onPower,
	onReveal,
	onStartCombat,
	onRevealBoss,
}: {
	state: GameState;
	onAttack: () => void;
	onRoll: () => void;
	onResolve: () => void;
	onPower: () => void;
	onReveal: () => void;
	onStartCombat: () => void;
	onRevealBoss: () => void;
}) {
	const { status } = state;

	if (
		status === "REVEAL_ROOM" ||
		status === "ROOM_EFFECT" ||
		status === "SPAWN_ENEMIES"
	)
		return (
			<ActionButton
				label="Revelar sala"
				icon="🚪"
				variant="primary"
				onClick={onReveal}
				fullWidth
			/>
		);

	if (status === "COMBAT_START")
		return (
			<ActionButton
				label="Iniciar combate"
				icon="⚔"
				variant="primary"
				onClick={onStartCombat}
				fullWidth
			/>
		);

	if (status === "BOSS_COMBAT") {
		const hero = state.heroes.find((h) => h.status === "active");
		const hasPower = hero && !state.combat?.powersUsedThisRoom[hero.id];
		return (
			<div className="flex gap-2">
				<ActionButton
					label="Atacar"
					icon="⚔"
					variant="primary"
					onClick={onAttack}
				/>
				<ActionButton
					label="Usar poder"
					icon="⚡"
					variant="secondary"
					disabled={!hasPower}
					onClick={onPower}
				/>
			</div>
		);
	}

	if (status === "ROLL_DICE")
		return (
			<ActionButton
				label="Rolar dados"
				icon="🎲"
				variant="primary"
				onClick={onRoll}
				fullWidth
			/>
		);

	if (status === "RESOLVE_ATTACK")
		return (
			<ActionButton
				label="Resolver ataque"
				icon="💥"
				variant="primary"
				onClick={onResolve}
				fullWidth
			/>
		);

	if (status === "REWARD_PHASE")
		return (
			<div
				className="h-10 flex items-center justify-center text-xs"
				style={{ color: UI.textTertiary }}
			>
				Distribuindo recompensas...
			</div>
		);

	if (
		status === "XP_SPEND_PHASE" ||
		status === "OPEN_PATHS" ||
		status === "CHOOSE_PATH"
	)
		return (
			<div
				className="h-10 flex items-center justify-center text-xs"
				style={{ color: UI.textTertiary }}
			>
				Aguardando decisão...
			</div>
		);

	if (status === "BOSS_REVEAL")
		return (
			<ActionButton
				label="Revelar chefe"
				icon="🐲"
				variant="danger"
				onClick={onRevealBoss}
				fullWidth
			/>
		);

	return null;
}

// ─── PAINEL DIREITO DO HERÓI ──────────────────────────────────────────────────

function HeroRightPanel({
	hero,
	state,
	onCardClick,
}: {
	hero: HeroState;
	state: GameState;
	onCardClick: (name: string, type: CardType) => void;
}) {
	const heroCard = getCardByName(hero.cardName);
	const powerUsed = state.combat?.powersUsedThisRoom[hero.id] ?? false;

	return (
		<div className="space-y-3 text-xs">
			{heroCard?.type === "hero" && (
				<>
					<div>
						<p
							className="font-medium mb-0.5"
							style={{ color: UI.textSecondary }}
						>
							Habilidade (passiva)
						</p>
						<p style={{ color: UI.textPrimary }}>{heroCard.skill}</p>
					</div>
					<div>
						<div className="flex items-center gap-2 mb-0.5">
							<p className="font-medium" style={{ color: UI.textSecondary }}>
								Poder
							</p>
							<StatusBadge
								label={powerUsed ? "usado" : "disponível"}
								variant={powerUsed ? "neutral" : "success"}
							/>
						</div>
						<p style={{ color: UI.textPrimary }}>{heroCard.power}</p>
					</div>
				</>
			)}
			<div>
				<p className="font-medium mb-0.5" style={{ color: UI.textSecondary }}>
					Mochila · {hero.backpack.length}{" "}
					{hero.backpack.length === 1 ? "item" : "itens"}
				</p>
				{hero.backpack.length === 0 ? (
					<span style={{ color: UI.textTertiary }}>vazia</span>
				) : (
					<div className="flex flex-wrap gap-1">
						{hero.backpack.map((item) => (
							<button
								key={item}
								type="button"
								className="px-2 py-0.5 rounded"
								style={{ background: UI.subpanelBg, color: UI.textPrimary }}
								onClick={() => onCardClick(item, "item")}
							>
								{item}
							</button>
						))}
					</div>
				)}
			</div>
			<div>
				<p className="font-medium mb-1" style={{ color: UI.textSecondary }}>
					Equipamentos ativos
				</p>
				<div className="grid grid-cols-4 gap-1">
					{(["weapon", "armor", "utility", "special"] as const).map((slot) => {
						const item = hero.activeItems[slot];
						const slotLabel: Record<string, string> = {
							weapon: "Equipável",
							armor: "Armadura",
							utility: "Utilitário",
							special: "Especial",
						};
						return (
							<div
								key={slot}
								className="p-1.5 rounded"
								style={{
									background: UI.subpanelBg,
									border: `1px dashed ${UI.border}`,
								}}
							>
								<p style={{ color: UI.textTertiary }}>{slotLabel[slot]}</p>
								{item ? (
									<button
										type="button"
										className="mt-0.5 truncate w-full text-left"
										style={{ color: UI.textPrimary }}
										onClick={() => onCardClick(item, "item")}
									>
										{item}
									</button>
								) : (
									<p style={{ color: UI.textTertiary }}>vazio</p>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
