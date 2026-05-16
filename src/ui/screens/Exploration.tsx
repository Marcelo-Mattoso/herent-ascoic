// Tela principal de exploração. Cobre todos os status de jogo exceto menus e término.
// Auto-avança por estados mecânicos; estados de decisão exibem botões ou modais.

import { useEffect, useState } from "react";
import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";
import { getCardByName } from "@/data/cards";
import { ActionButton } from "@/ui/components/ActionButton";
import type { CardType } from "@/ui/components/Card";
import { ColorBar } from "@/ui/components/ColorBar";
import { DiceDisplay } from "@/ui/components/DiceDisplay";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { OpenPathsModal } from "@/ui/components/modals/OpenPathsModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
import { StackPreview } from "@/ui/components/StackPreview";
import { StatusBadge } from "@/ui/components/StatusBadge";
import { useGameStore } from "@/ui/store/gameStore";
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
	| "card_detail"
	| null;

interface CardDetailState {
	name: string;
	cardType: CardType;
}

export function Exploration() {
	const { state, dispatch } = useGameStore();
	const [modal, setModal] = useState<ModalType>(null);
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);

	const status = state.status;
	const hero =
		state.heroes.find((h) => h.status === "active") ?? state.heroes[0];
	const enemies = state.activeEnemies.filter((e) => e.status === "active");
	const roll = state.combat?.lastRoll;

	// Auto-avança estados mecânicos com pequeno atraso para mostrar feedback visual
	useEffect(() => {
		const action = AUTO_ADVANCE[status];
		if (!action) return;
		const t = setTimeout(() => dispatch(action), 400);
		return () => clearTimeout(t);
	}, [status, dispatch]);

	// Abre modais automaticamente nos estados de decisão
	useEffect(() => {
		if (status === "XP_SPEND_PHASE") setModal("xp_spend");
		else if (status === "CHOOSE_PATH") setModal("open_paths");
		else if (status === "DUNGEON_EXHAUSTED") setModal("dungeon_exhausted");
	}, [status]);

	// Quando OPEN_PATHS ainda precisa de um segundo dispatch
	useEffect(() => {
		if (status === "OPEN_PATHS") {
			const t = setTimeout(() => dispatch({ type: "OPEN_PATHS" }), 200);
			return () => clearTimeout(t);
		}
	}, [status, dispatch]);

	function openCardDetail(name: string, cardType: CardType) {
		setDetailCard({ name, cardType });
		setModal("card_detail");
	}

	function handleAttack() {
		if (!hero) return;
		const enemy = enemies[0];
		if (!enemy) return;
		dispatch({
			type: "CHOOSE_TARGET",
			payload: { heroId: hero.id, enemyId: enemy.id },
		});
	}

	function handleRollDice() {
		dispatch({ type: "ROLL_DICE" });
	}

	function handleResolveAttack() {
		dispatch({ type: "RESOLVE_ATTACK" });
	}

	function handleUsePower() {
		if (!hero) return;
		dispatch({ type: "USE_POWER", payload: { heroId: hero.id } });
	}

	const isCombat = [
		"HERO_ACTION",
		"ROLL_DICE",
		"RESOLVE_ATTACK",
		"BOSS_COMBAT",
		"CHECK_COMBAT_END",
		"DIRECT_DAMAGE",
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
					<div className="flex gap-5">
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
								<div>
									<p
										className="text-xs mb-1"
										style={{ color: UI.textTertiary }}
									>
										Inimigos
									</p>
									<div className="flex gap-2">
										{enemies.length === 0 && !isCombat && (
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
										{enemies.map((e) => (
											<button
												key={e.id}
												type="button"
												className="flex-1 p-2 rounded-lg text-left hover:opacity-80"
												style={{
													background: UI.subpanelBg,
													border: `1px solid ${UI.border}`,
												}}
												onClick={() =>
													openCardDetail(
														e.cardName,
														e.id === "boss" ? "boss" : "enemy",
													)
												}
											>
												<p
													className="text-xs font-medium truncate"
													style={{ color: UI.textPrimary }}
												>
													{e.cardName}
												</p>
												<p
													className="text-xs"
													style={{ color: UI.textSecondary }}
												>
													Vida {e.currentLife}/{e.maxLife} · +{e.hitBonus} · D
													{e.damage}
												</p>
											</button>
										))}
									</div>
								</div>
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

				{/* Botões de ação */}
				<ActionButtons
					state={state}
					onAttack={handleAttack}
					onRoll={handleRollDice}
					onResolve={handleResolveAttack}
					onPower={handleUsePower}
					onReveal={() => dispatch({ type: "REVEAL_ROOM" })}
					onStartCombat={() => dispatch({ type: "START_COMBAT" })}
					onGrantRewards={() => dispatch({ type: "GRANT_REWARDS" })}
					onRevealBoss={() => dispatch({ type: "REVEAL_BOSS" })}
				/>

				{/* Painel do herói */}
				{hero && (
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
								onClick={() => openCardDetail(hero.cardName, "hero")}
							>
								<div
									className="h-20 rounded mb-1 flex items-center justify-center"
									style={{ background: UI.subpanelBg }}
								>
									<span className="text-3xl">🧙</span>
								</div>
							</button>
							<p
								className="text-xs font-medium"
								style={{ color: UI.textPrimary }}
							>
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
						<HeroRightPanel
							hero={hero}
							state={state}
							onCardClick={openCardDetail}
						/>
					</div>
				)}
			</div>

			{/* Modais */}
			{modal === "xp_spend" && <XpSpendModal onClose={() => setModal(null)} />}
			{modal === "open_paths" && (
				<OpenPathsModal onClose={() => setModal(null)} />
			)}
			{modal === "dungeon_exhausted" && <DungeonExhaustedModal />}
			{modal === "card_detail" && detailCard && (
				<CardDetailModal
					cardName={detailCard.name}
					cardType={detailCard.cardType}
					onClose={() => setModal(null)}
				/>
			)}
		</div>
	);
}

// Botões de ação por status
function ActionButtons({
	state,
	onAttack,
	onRoll,
	onResolve,
	onPower,
	onReveal,
	onStartCombat,
	onGrantRewards,
	onRevealBoss,
}: {
	state: GameState;
	onAttack: () => void;
	onRoll: () => void;
	onResolve: () => void;
	onPower: () => void;
	onReveal: () => void;
	onStartCombat: () => void;
	onGrantRewards: () => void;
	onRevealBoss: () => void;
}) {
	const { status } = state;
	const hero = state.heroes.find((h) => h.status === "active");
	const hasPower = hero && !state.combat?.powersUsedThisRoom[hero.id];

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

	if (status === "HERO_ACTION" || status === "BOSS_COMBAT")
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
			<ActionButton
				label="Receber recompensas"
				icon="🏆"
				variant="primary"
				onClick={onGrantRewards}
				fullWidth
			/>
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

// Painel direito do herói: habilidade, poder, mochila, equipamentos
function HeroRightPanel({
	hero,
	state,
	onCardClick,
}: {
	hero: NonNullable<GameState["heroes"][number]>;
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
						return (
							<div
								key={slot}
								className="p-1.5 rounded"
								style={{
									background: UI.subpanelBg,
									border: `1px dashed ${UI.border}`,
								}}
							>
								<p style={{ color: UI.textTertiary }}>{slot}</p>
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
