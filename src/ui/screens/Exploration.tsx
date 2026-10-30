import { translate } from "@/i18n";
// Tela de Exploração — Patch 3.
// Layout: TopBar · Board (tabuleiro coletivo) · HeroFocusPanel (herói em foco).

import { UseItemModal } from "@/ui/components/modals/UseItemModal";
import { type CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Action } from "@/core/actions/types";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import type { PlayerView } from "@/core/projection/playerView";
import type { EnemyState } from "@/core/state/enemyState";
import type { HeroState } from "@/core/state/heroState";
import { getCardImageUrl } from "@/ui/cardImages";
import { Board } from "@/ui/components/Board";
import { BoardFooter } from "@/ui/components/BoardFooter";
import { BuffBar } from "@/ui/components/BuffBar";
import type { CardType } from "@/ui/components/Card";
import { EventLogPanel } from "@/ui/components/EventLogPanel";
import { HeroFocusPanel } from "@/ui/components/HeroFocusPanel";
import { JournalPanel } from "@/ui/components/JournalPanel";
import { InfluencePanel } from "@/ui/components/InfluencePanel";
import { InventarioGrupo } from "@/ui/components/InventarioGrupo";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { DungeonExhaustedModal } from "@/ui/components/modals/DungeonExhaustedModal";
import { FleeReconfigureModal } from "@/ui/components/modals/FleeReconfigureModal";
import { SkillChoiceModal } from "@/ui/components/modals/SkillChoiceModal";
import { SkillTargetModal } from "@/ui/components/modals/SkillTargetModal";
import { TriggerInterruptModal } from "@/ui/components/modals/TriggerInterruptModal";
import { XpSpendModal } from "@/ui/components/modals/XpSpendModal";
import { useBoardBackgrounds } from "@/ui/hooks/useBoardBackgrounds";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useGameViewport } from "@/ui/hooks/useGameViewport";
import { useGameStore } from "@/ui/store/gameStore";
import { selectFocusedHero } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";

// Estados mecânicos auto-avançados sem decisão do jogador
const AUTO_ADVANCE: Partial<Record<string, Action>> = {
	REVEAL_ROOM: { type: "REVEAL_ROOM" },
	ROOM_EFFECT: { type: "RESOLVE_ROOM_EFFECT" },
	SPAWN_ENEMIES: { type: "SPAWN_ENEMIES" },
	COMBAT_START: { type: "START_COMBAT" },
	ROLL_DICE: { type: "PREPARE_PHYSICAL_ROLL" },
	CHECK_COMBAT_END: { type: "CHECK_COMBAT_END" },
	DIRECT_DAMAGE: { type: "PREPARE_EXTRA_ATTACK" },
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
type PortableDrawer = "awakening" | "influences" | "log" | null;

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

export function Exploration({
	tutorialMode = false,
	tutorialRevealEnabled = false,
	tutorialCombatMode = false,
	tutorialCombatMethod = null,
	onTutorialAttackInput,
	tutorialInventoryMode = false,
	tutorialInventoryOpen = false,
	tutorialInventoryHeroSelected = false,
	onTutorialInventoryHeroSelected,
	onTutorialInventoryOpen,
	onTutorialItemDetailChange,
	tutorialAbilityMode = false,
	onTutorialAbilityPanelOpen,
	onTutorialAbilityCardInspect,
}: {
	tutorialMode?: boolean;
	tutorialRevealEnabled?: boolean;
	tutorialCombatMode?: boolean;
	tutorialCombatMethod?: "drag" | "tap" | null;
	onTutorialAttackInput?: (method: "drag" | "tap") => void;
	tutorialInventoryMode?: boolean;
	tutorialInventoryOpen?: boolean;
	tutorialInventoryHeroSelected?: boolean;
	onTutorialInventoryHeroSelected?: () => void;
	onTutorialInventoryOpen?: () => void;
	onTutorialItemDetailChange?: (itemId: string | null) => void;
	tutorialAbilityMode?: boolean;
	onTutorialAbilityPanelOpen?: () => void;
	onTutorialAbilityCardInspect?: () => void;
}) {
	const [itemUse, setItemUse] = useState<{
		heroId: string;
		itemId?: string;
	} | null>(null);
	const { view, ui, journal, dispatch, setFocusedHero, heroActionsFor } =
		useGameStore();
	const [detailCard, setDetailCard] = useState<CardDetailState | null>(null);
	const [showHeroFocus, setShowHeroFocus] = useState(false);
	const [actionLogMode, setActionLogMode] = useState<ActionLogMode>("open");
	const [showJournal, setShowJournal] = useState(false);
	const [portableDrawer, setPortableDrawer] = useState<{
		type: Exclude<PortableDrawer, null>;
		phaseKey: string;
	} | null>(null);
	const [combatAttackHintVisible, setCombatAttackHintVisible] = useState(false);
	const [hasShownFirstAttackHint, setHasShownFirstAttackHint] = useState(false);
	const { selectedBoard } = useBoardBackgrounds();
	const cardImageUrls = useCardImages();
	const gameGeometry = useGameViewport();

	const status = view.status;
	const combat = view.combat;
	const phaseKey = `${status}:${combat?.phase ?? ""}`;
	const activePortableDrawer =
		portableDrawer?.phaseKey === phaseKey ? portableDrawer.type : null;
	function togglePortableDrawer(type: Exclude<PortableDrawer, null>) {
		setPortableDrawer((current) =>
			current?.type === type && current.phaseKey === phaseKey
				? null
				: { type, phaseKey },
		);
	}
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
		if (tutorialMode && (status === "REVEAL_ROOM" || status === "COMBAT_START"))
			return;
		if (
			tutorialCombatMode &&
			(status === "DIRECT_DAMAGE" || status === "CHECK_COMBAT_END")
		)
			return;
		if (view.pendingTriggerInterrupt || view.pendingSkillChoice || view.pendingSkillTarget) return;
		if (status === "DIRECT_DAMAGE" && !view.combat) return;
		const action = AUTO_ADVANCE[status];
		if (!action) return;
		const t = setTimeout(() => dispatch(action), 400);
		return () => clearTimeout(t);
	}, [status, dispatch, tutorialMode, tutorialCombatMode, view.pendingTriggerInterrupt, view.pendingSkillChoice, view.pendingSkillTarget, view.combat]);

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
		if (tutorialAbilityMode && cardType === "hero") onTutorialAbilityCardInspect?.();
	}

	// Clique em card de herói: muda foco + seleciona para combate se válido
	function handleHeroClick(h: HeroState) {
		if (h.status !== "active") return;
		setFocusedHero(h.id);
		if (tutorialInventoryMode && !tutorialInventoryOpen) {
			setShowHeroFocus(false);
			onTutorialInventoryHeroSelected?.();
			return;
		}
		if (
			(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
			combat?.phase === "selecting_hero" &&
			!combat.heroesActed.includes(h.id)
		) {
			// Toque é o caminho principal: primeiro escolhe o herói, depois o alvo.
			setShowHeroFocus(false);
			setCombatAttackHintVisible(false);
			dispatch({ type: "CHOOSE_HERO_FOR_ROUND", payload: { heroId: h.id } });
			return;
		}
		setShowHeroFocus(true);
		if (tutorialAbilityMode) onTutorialAbilityPanelOpen?.();
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
		onTutorialAttackInput?.("drag");
		dispatch({ type: "CHOOSE_TARGET", payload: { heroId, enemyId } });
	}

	function handleEnemyClick(e: EnemyState) {
		const selectedHeroId = combat?.selectedHeroId;
		if (
			(status === "HERO_ACTION" || status === "BOSS_COMBAT") &&
			combat?.phase === "selecting_target" &&
			selectedHeroId &&
			e.status === "active"
		) {
			if (tutorialCombatMethod === "drag") return;
			setShowHeroFocus(false);
			setCombatAttackHintVisible(false);
			onTutorialAttackInput?.("tap");
			dispatch({
				type: "CHOOSE_TARGET",
				payload: { heroId: selectedHeroId, enemyId: e.id },
			});
			return;
		}
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
		if (tutorialAbilityMode) setShowHeroFocus(false);
		dispatch({ type: "USE_POWER", payload: { heroId } });
	}

	function handleFlee() {
		const heroId = combat?.selectedHeroId ?? focusedHero?.id;
		if (!heroId) return;
		setCombatAttackHintVisible(false);
		dispatch({ type: "DECLARE_FLEE", payload: { heroId } });
	}

	function handleUseSkill(skillId: string, sourceId: string) {
		if (tutorialAbilityMode) setShowHeroFocus(false);
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
			<div
				className="game-viewport"
				data-game-layout={gameGeometry.mode}
				style={
					{
						"--game-card-width": `min(${gameGeometry.cardWidth}px, calc((100dvw - env(safe-area-inset-left) - env(safe-area-inset-right) - 48px) / 5))`,
						"--game-card-height": "calc(var(--game-card-width) * 172 / 124)",
					} as CSSProperties
				}
			>
				<div
					className="game-landscape-stage"
					style={{
						backgroundColor: UI.pageBg,
						backgroundImage: boardBackgroundImage,
					}}
				>
					<div className="game-table-vignette" />
					<div className="game-play-space">
						{/* TABULEIRO */}
						<div className="game-board-surface">
							<Board
								tutorialMode={tutorialMode}
								tutorialRevealEnabled={tutorialRevealEnabled}
								onTutorialReveal={() => dispatch({ type: "REVEAL_ROOM" })}
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
								onConfirmDiceRoll={(payload) => dispatch({ type: "CONFIRM_DICE_ROLL", payload })}
								onSelectDie={(side, index, value) =>
									dispatch({
										type: "SELECT_DIE",
										payload: { side, index, value },
									})
								}
								cardImageUrls={cardImageUrls}
							/>
						</div>

						<aside className="game-influence-chat">
							{tutorialInventoryMode &&
								status === "REWARD_PHASE" &&
								!tutorialInventoryOpen &&
								gameGeometry.mode === "desktop" && (
									<button
										type="button"
										className="game-journal-open"
										data-tutorial-anchor="inventory.open"
										disabled={!tutorialInventoryHeroSelected}
										onClick={onTutorialInventoryOpen}
									>
										{translate("game:screens.exploration.text001")}{" "}</button>
								)}
							<DungeonAwakeningMarker current={view.despertar} />
							<div className="game-influence-panel">
								<InfluencePanel influences={view.activeInfluences} />
							</div>
							<button
								type="button"
								className="game-journal-open"
								data-tutorial-anchor={
									gameGeometry.mode === "desktop" ? "journal.open" : undefined
								}
								onClick={() => setShowJournal(true)}
							>
								{translate("game:screens.exploration.text002")}{" "}</button>
							{actionLogMode === "hidden" ? (
								<button
									type="button"
									className="event-log-reopen"
									onClick={() => setActionLogMode("open")}
									title={translate("game:screens.exploration.title003")}
									aria-label={translate("game:screens.exploration.ariaLabel004")}
								>
									{translate("game:screens.exploration.text005")}{" "}</button>
							) : (
								<EventLogPanel
									entries={view.eventLog}
									title={translate("game:screens.exploration.title006")}
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
							<div
								className="game-portable-action-bar"
								role="group"
								aria-label={translate("game:screens.exploration.ariaLabel007")}
							>
								{tutorialInventoryMode &&
									status === "REWARD_PHASE" &&
									!tutorialInventoryOpen &&
									gameGeometry.mode !== "desktop" && (
										<button
											type="button"
											data-tutorial-anchor="inventory.open"
											disabled={!tutorialInventoryHeroSelected}
											onClick={onTutorialInventoryOpen}
										>
											{translate("game:screens.exploration.text008")}{" "}</button>
									)}
								<button
									type="button"
									onClick={() => togglePortableDrawer("awakening")}
								>
									<span aria-hidden="true">⚡</span> {translate("game:screens.exploration.text009")}{" "}</button>
								<button
									type="button"
									onClick={() => togglePortableDrawer("influences")}
								>
									<span aria-hidden="true">✦</span> {translate("game:screens.exploration.text010")}{" "}</button>
								<button
									type="button"
									data-tutorial-anchor={
										gameGeometry.mode !== "desktop" ? "journal.open" : undefined
									}
									onClick={() => setShowJournal(true)}
								>
									<span aria-hidden="true">📖</span> {translate("game:screens.exploration.text011")}{" "}</button>
							</div>
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
										className="game-buff-dock"
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
								aria-label={translate("game:screens.exploration.ariaLabel012")}
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

					{activePortableDrawer && (
						<PortableGameDrawer
							type={activePortableDrawer}
							despertar={view.despertar}
							influences={view.activeInfluences}
							entries={view.eventLog}
							view={view}
							onArtifactClick={openCardDetail}
							onClose={() => setPortableDrawer(null)}
						/>
					)}

					{showJournal &&
						createPortal(
							<div className="journal-layer">
								<button
									type="button"
									className="journal-layer__backdrop"
									onClick={() => setShowJournal(false)}
									aria-label={translate("game:screens.exploration.ariaLabel013")}
								/>
								<JournalPanel
									journal={journal}
									onClose={() => setShowJournal(false)}
								/>
							</div>,
							document.body,
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
			{status === "REWARD_PHASE" &&
				!tutorialCombatMode &&
				(!tutorialInventoryMode || tutorialInventoryOpen) && (
					<InventarioGrupo onItemDetailChange={onTutorialItemDetailChange} />
				)}
		</>
	);
}

function PortableGameDrawer({
	type,
	despertar,
	influences,
	entries,
	view,
	onArtifactClick,
	onClose,
}: {
	type: Exclude<PortableDrawer, null>;
	despertar: PlayerView["despertar"];
	influences: PlayerView["activeInfluences"];
	entries: PlayerView["eventLog"];
	view: PlayerView;
	onArtifactClick: (id: string, type: CardType) => void;
	onClose: () => void;
}) {
	const title =
		type === "awakening"
			? translate("game:screens.exploration.groupDrawer")
			: type === "influences"
				? translate("game:screens.exploration.influencesDrawer")
				: translate("game:screens.exploration.logDrawer");

	return (
		<div className="game-portable-drawer-layer">
			<button
				type="button"
				className="game-portable-drawer-backdrop"
				onClick={onClose}
				aria-label={translate("game:screens.exploration.closeDrawer", { title })}
			/>
			<section
				className="game-portable-drawer"
				role="dialog"
				aria-modal="true"
				aria-label={title}
			>
				<header>
					<h2>{title}</h2>
					<button
						type="button"
						onClick={onClose}
						aria-label={`Fechar ${title}`}
					>
						×
					</button>
				</header>
				<div className="game-portable-drawer__body">
					{type === "awakening" ? (
						<>
							<DungeonAwakeningMarker current={despertar} />
							<BoardFooter view={view} onArtifactClick={onArtifactClick} />
						</>
					) : null}
					{type === "influences" ? (
						<InfluencePanel influences={influences} />
					) : null}
					{type === "log" ? (
						<EventLogPanel
							entries={entries}
							title={translate("game:screens.exploration.title014")}
							maxHeight="none"
							collapsed={false}
							onToggleCollapsed={() => {}}
							onClose={onClose}
						/>
					) : null}
				</div>
			</section>
		</div>
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
				<span>{translate("game:screens.exploration.text015")}</span>
				<strong>{translate("game:screens.exploration.text016")}{" "}{current + 1}</strong>
			</div>
			<div className="game-awakening-marker__rule">{translate("game:screens.exploration.text017")}</div>
			<ul
				className="game-awakening-marker__levels"
				aria-label={translate("game:screens.exploration.ariaLabel018")}
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
