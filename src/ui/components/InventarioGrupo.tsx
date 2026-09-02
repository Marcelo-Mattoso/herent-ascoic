// Tela de gerenciamento de inventário do grupo — Patch 4.
// Substitui o modal de recompensa por uma tela completa de organização.
// Drag & drop livre entre todas as zonas: mesa ↔ herói-slot ↔ herói-mochila.

import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { InvFromZone, InvToZone } from "@/core/actions/types";
import { getCardLocale, getCardName } from "@/core/data/cardLocale";
import { getCardById } from "@/core/data/cards";
import {
	collectHeroDamageBonusesFromItems,
	collectHeroDamageReductionsFromItems,
	collectHeroHitBonusesFromItems,
	totalItemValue,
} from "@/core/rules/itemEffects";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { GameState } from "@/core/state/gameState";
import type { HeroState, ItemSlotType } from "@/core/state/heroState";
import { getCardImageUrl, type CardImageUrls } from "@/ui/cardImages";
import type { CardType } from "@/ui/components/Card";
import { CardDetailModal } from "@/ui/components/modals/CardDetailModal";
import { useCardImages } from "@/ui/hooks/useCardImages";
import { useUiAssets } from "@/ui/hooks/useUiAssets";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";
import { getUiAssetUrl } from "@/ui/uiAssets";

// ── Constantes de cor ─────────────────────────────────────────────────────────

const AMBER = { bg: "#FAEEDA", border: "#BA7517", ink: "#633806" } as const;

// Mesma paleta do ItemTile (board): weapon=ouro, armor=azul, utility=verde, special=rosa
const SLOT_COLORS_INV: Record<
	string,
	{ bg: string; border: string; text: string }
> = {
	weapon: { bg: "#FAC775", border: "#BA7517", text: "#5C3A00" },
	armor: { bg: "#B5D4F4", border: "#185FA5", text: "#0D3A6E" },
	utility: { bg: "#C0DD97", border: "#3B6D11", text: "#1B4500" },
	special: { bg: "#ED93B1", border: "#8B1A4A", text: "#5A0022" },
};

// itemClass → cor mais próxima da paleta de slots
const ITEM_COLORS: Record<
	string,
	{ bg: string; border: string; text: string }
> = {
	equipment: { bg: "#FAC775", border: "#BA7517", text: "#5C3A00" }, // ouro (weapon)
	consumable: { bg: "#C0DD97", border: "#3B6D11", text: "#1B4500" }, // verde (utility)
	utility: { bg: "#B5D4F4", border: "#185FA5", text: "#0D3A6E" }, // azul (armor)
	special: { bg: "#ED93B1", border: "#8B1A4A", text: "#5A0022" }, // rosa (special)
};

function itemColor(itemId: string) {
	const card = getCardById(itemId);
	if (!card || card.type !== "item") return null;
	return ITEM_COLORS[card.itemClass] ?? null;
}

// ── Outros helpers ────────────────────────────────────────────────────────────

const SLOT_TYPES: ItemSlotType[] = ["weapon", "armor", "utility", "special"];
const SLOT_LABELS: Record<ItemSlotType, string> = {
	weapon: "arm",
	armor: "esc",
	utility: "utl",
	special: "esp",
};
const SLOT_TITLES: Record<ItemSlotType, string> = {
	weapon: "Arma",
	armor: "Defesa",
	utility: "Utilidade",
	special: "Especial",
};
const MAX_BACKPACK = 8;

function shortLabel(name: string): string {
	const word = name.split(" ")[0] ?? name;
	return word.length <= 6 ? word : `${word.slice(0, 5)}…`;
}

function artifactRequiresBearer(cardId: string): boolean {
	const card = getCardById(cardId);
	if (card?.type !== "artifact") return false;
	const main = cardSkills(card.id)[0];
	if (!main) return false;
	return renderSkillLabel(main.ref).toLowerCase().includes("portador");
}

function signed(value: number): string {
	return `${value >= 0 ? "+" : ""}${value}`;
}

function heroItemStats(hero: HeroState, state: GameState) {
	const hitBonus = totalItemValue(collectHeroHitBonusesFromItems(hero, state));
	const damageBonus = totalItemValue(
		collectHeroDamageBonusesFromItems(hero, state, undefined, 4),
	);
	const protectionEntries = collectHeroDamageReductionsFromItems(hero, state);
	const protection = totalItemValue(protectionEntries);
	return {
		hit: hero.hitBonus + hitBonus,
		hitBonus,
		damage: hero.damage + damageBonus,
		damageBonus,
		protection,
		protectionText:
			protection > 0
				? protectionEntries
						.map((entry) => `${entry.source} -${entry.value}`)
						.join(", ")
				: "",
	};
}

// ── Tipo do item em voo ───────────────────────────────────────────────────────

type DragItem = {
	name: string;
	kind: "item";
	from: InvFromZone;
};

type DetailCardTarget = {
	cardId: string;
	cardType: CardType;
	heroId?: string;
};

// ── Slot visual ───────────────────────────────────────────────────────────────

interface SlotProps {
	label?: string;
	title?: string;
	amber?: boolean;
	color?: { bg: string; border: string; text: string } | null;
	filled?: boolean;
	draggable?: boolean;
	isValidDrop?: boolean;
	isHover?: boolean;
	isDragging?: boolean;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: () => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDragLeave?: () => void;
	onDrop?: (e: React.DragEvent) => void;
	onMouseEnter?: (e: React.MouseEvent) => void;
	onMouseMove?: (e: React.MouseEvent) => void;
	onMouseLeave?: () => void;
}

function Slot({
	label,
	title: _title,
	amber,
	color,
	filled,
	draggable,
	isValidDrop,
	isHover,
	isDragging,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDragLeave,
	onDrop,
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
}: SlotProps) {
	// Cor base: prioridade color > amber > default
	const baseBg = color ? color.bg : amber ? AMBER.bg : "transparent";
	const baseBorder = color
		? color.border
		: amber
			? AMBER.border
			: `rgba(0,0,0,${filled ? 0.2 : 0.12})`;
	const baseText = color ? color.text : amber ? AMBER.ink : UI.textTertiary;

	let bg = baseBg;
	let border = baseBorder;
	let opacity = isDragging ? 0.35 : 1;
	let borderStyle: "solid" | "dashed" = "solid";

	if (isValidDrop !== undefined) {
		// Drag ativo no ar
		if (isValidDrop) {
			borderStyle = "dashed";
			border = isHover ? "#0044AA" : "#3B82F6";
			bg = isHover ? "#BFDBFE" : "#EFF6FF";
			opacity = 1;
		} else if (!filled) {
			opacity = 0.25;
		} else {
			// Slots preenchidos inválidos ficam com 60%
			opacity = isDragging ? 0.35 : 0.6;
		}
	}

	return (
		<button
			type="button"
			draggable={draggable}
			tabIndex={draggable ? 0 : undefined}
			title={undefined}
			data-item={draggable ? "true" : undefined}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
			onMouseEnter={onMouseEnter}
			onMouseMove={onMouseMove}
			onMouseLeave={onMouseLeave}
			style={{
				width: 36,
				height: 36,
				borderRadius: 4,
				border: `1px ${borderStyle} ${border}`,
				background: bg,
				opacity,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: 9,
				fontWeight: 500,
				color: baseText,
				cursor: draggable ? "grab" : "default",
				userSelect: "none",
				flexShrink: 0,
				transition: "background 0.1s, border-color 0.1s, opacity 0.12s",
			}}
		>
			{label}
		</button>
	);
}

// ── Componente de herói ───────────────────────────────────────────────────────

type TooltipTarget = {
	name: string;
	kind: "item" | "artifact";
	x: number;
	y: number;
	heroId?: string;
};

interface HeroColumnProps {
	hero: HeroState;
	imageUrl?: string;
	dragging: DragItem | null;
	hoverZone: string | null;
	onDrop: (zone: string) => void;
	onSetHover: (zone: string | null) => void;
	onDragItemStart: (name: string, from: InvFromZone) => void;
	onDragEnd: () => void;
	onShowTooltip: (t: TooltipTarget) => void;
	onHideTooltip: () => void;
	onUseItem: (itemId: string, heroId: string) => void;
	onHeroDetail: (hero: HeroState) => void;
	gameState: GameState;
}

function HeroColumn({
	hero,
	imageUrl,
	dragging,
	hoverZone,
	onDrop,
	onSetHover,
	onDragItemStart,
	onDragEnd,
	onShowTooltip,
	onHideTooltip,
	onUseItem: _onUseItem,
	onHeroDetail,
	gameState,
}: HeroColumnProps) {
	const equipZone = `hero_equip_${hero.id}`;
	const mochilaZone = `hero_mochila_${hero.id}`;
	const [backpackOpen, setBackpackOpen] = useState(false);

	function canEquipDrag(): boolean {
		if (!dragging || dragging.kind !== "item") return false;
		const card = getCardById(dragging.name);
		return card?.type === "item" && card.itemClass !== "consumable";
	}

	function canMochilaDrag(): boolean {
		if (!dragging || dragging.kind !== "item") return false;
		// Se o drag vem da mochila deste herói, libera espaço ao remover
		const isFromSameBackpack =
			dragging.from.kind === "hero_backpack" &&
			dragging.from.heroId === hero.id;
		const effectiveCount = isFromSameBackpack
			? hero.backpack.length - 1
			: hero.backpack.length;
		return effectiveCount < MAX_BACKPACK;
	}

	const isDragging = !!dragging;
	const heroName = getCardName(hero.cardId);
	const effectiveStats = heroItemStats(hero, gameState);
	const backpackDropActive = canMochilaDrag();

	function areaDropHandlers(zone: string, valid: boolean) {
		return {
			onDragOver: (e: React.DragEvent) => {
				if (valid) {
					e.preventDefault();
					onSetHover(zone);
				}
			},
			onDragLeave: () => onSetHover(null),
			onDrop: (e: React.DragEvent) => {
				e.preventDefault();
				onSetHover(null);
				if (valid) onDrop(zone);
			},
		};
	}

	const canEquip = canEquipDrag();
	const canMochila = backpackDropActive;

	return (
		<div
			className="inventory-hero-card"
			style={{
				width: 178,
			}}
		>
			<button
				type="button"
				className="inventory-hero-info-button"
				data-item="true"
				aria-label={`Detalhes de ${heroName}`}
				title={`Detalhes de ${heroName}`}
				onClick={() => onHeroDetail(hero)}
			>
				i
			</button>

			{/* 4 slots de equipamento — zona de drop inteira */}
			<div
				{...areaDropHandlers(equipZone, canEquip)}
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 36px)",
					gap: 4,
					marginBottom: 6,
					borderRadius: 4,
					padding: 2,
					border: isDragging
						? canEquip
							? `1px dashed ${hoverZone === equipZone ? "#0044AA" : "#3B82F6"}`
							: "1px dashed transparent"
						: "1px solid transparent",
					background:
						canEquip && hoverZone === equipZone ? "#BFDBFE" : "transparent",
					transition: "background 0.1s",
				}}
			>
				{SLOT_TYPES.map((slotType) => {
					const name = hero.activeItems[slotType];
					const col = name
						? (SLOT_COLORS_INV[slotType] ?? itemColor(name))
						: null;
					const isThisItemDragging =
						dragging?.from.kind === "hero_slot" &&
						dragging.from.heroId === hero.id &&
						dragging.from.slotType === slotType;

					return name ? (
						<Slot
							key={slotType}
							label={shortLabel(name)}
							color={col}
							filled
							draggable
							isDragging={isThisItemDragging}
							onDragStart={(e) => {
								e.dataTransfer.setData("text/plain", name);
								onDragItemStart(name, {
									kind: "hero_slot",
									heroId: hero.id,
									slotType,
								});
							}}
							onDragEnd={onDragEnd}
							onMouseEnter={(e) =>
								onShowTooltip({
									name,
									kind: "item",
									x: e.clientX,
									y: e.clientY,
									heroId: hero.id,
								})
							}
							onMouseMove={(e) =>
								onShowTooltip({
									name,
									kind: "item",
									x: e.clientX,
									y: e.clientY,
									heroId: hero.id,
								})
							}
							onMouseLeave={onHideTooltip}
						/>
					) : (
						<Slot key={slotType} label={SLOT_LABELS[slotType]} />
					);
				})}
			</div>

			{/* Arte do herói */}
			<div className="inventory-hero-card__image">
				{imageUrl ? (
					<img src={imageUrl} alt={heroName} />
				) : (
					<span>{heroName.slice(0, 1)}</span>
				)}
			</div>

			<div className="inventory-hero-stats">
				<span>
					<strong>Vida</strong>
					{hero.currentLife}/{hero.maxLife}
				</span>
				<span>
					<strong>Acerto</strong>+{hero.hitBonus}
					{effectiveStats.hitBonus
						? ` (${signed(effectiveStats.hitBonus)} item)`
						: ""}
				</span>
				<span>
					<strong>Dados</strong>
					{hero.dice}d
				</span>
				<span>
					<strong>Dano</strong>
					{effectiveStats.damage}
					{effectiveStats.damageBonus
						? ` (${signed(effectiveStats.damageBonus)} item)`
						: ""}
				</span>
				<span>
					<strong>Proteção</strong>
					{effectiveStats.protection}
				</span>
			</div>

			{/* Mochila em stack — zona de drop inteira */}
			<div
				{...areaDropHandlers(mochilaZone, canMochila)}
				className="inventory-backpack-wrap"
				data-item="true"
				onMouseEnter={() => setBackpackOpen(true)}
				onMouseLeave={() => {
					if (!dragging) setBackpackOpen(false);
					onHideTooltip();
				}}
				style={
					{
						"--inventory-stack-border": isDragging
							? canMochila
								? hoverZone === mochilaZone
									? "#0044AA"
									: "#3B82F6"
								: "transparent"
							: UI.border,
						"--inventory-stack-bg":
							canMochila && hoverZone === mochilaZone
								? "#BFDBFE"
								: "rgba(3, 11, 23, 0.42)",
					} as CSSProperties
				}
			>
				<button
					type="button"
					className="inventory-backpack-stack"
					onClick={() => setBackpackOpen((v) => !v)}
					aria-expanded={backpackOpen}
					aria-label={`Mochila de ${heroName}, ${hero.backpack.length} de ${MAX_BACKPACK} itens`}
				>
					<span className="inventory-backpack-stack__cards" aria-hidden="true">
						<span />
						<span />
						<span />
					</span>
					<span className="inventory-backpack-stack__body">
						<strong>Mochila</strong>
						<small>
							{hero.backpack.length}/{MAX_BACKPACK} itens
						</small>
					</span>
				</button>

				{backpackOpen && (
					<div className="inventory-backpack-popover">
						{hero.backpack.length === 0 ? (
							<span className="inventory-backpack-empty">vazia</span>
						) : (
							hero.backpack.map((name, i) => {
								const col = itemColor(name);
								const itemName = getCardName(name);
								const isThisItemDragging =
									dragging?.from.kind === "hero_backpack" &&
									dragging.from.heroId === hero.id &&
									dragging.from.index === i;

								return (
									<div
										key={`${name}-${i}`}
										className="inventory-backpack-item"
										data-item="true"
										draggable
										onDragStart={(e) => {
											e.dataTransfer.setData("text/plain", name);
											onDragItemStart(name, {
												kind: "hero_backpack",
												heroId: hero.id,
												index: i,
											});
										}}
										onDragEnd={onDragEnd}
										onMouseEnter={(e) =>
											onShowTooltip({
												name,
												kind: "item",
												x: e.clientX,
												y: e.clientY,
												heroId: hero.id,
											})
										}
										onMouseMove={(e) =>
											onShowTooltip({
												name,
												kind: "item",
												x: e.clientX,
												y: e.clientY,
												heroId: hero.id,
											})
										}
										onMouseLeave={onHideTooltip}
										style={{
											"--inventory-item-bg": col?.bg ?? "#F1EFE8",
											"--inventory-item-border": col?.border ?? UI.border,
											"--inventory-item-text": col?.text ?? UI.textPrimary,
											opacity: isThisItemDragging ? 0.35 : 1,
										} as CSSProperties}
									>
										<span aria-hidden="true" />
										<strong title={itemName}>{itemName}</strong>
									</div>
								);
							})
						)}
					</div>
				)}
			</div>

			{/* Nome */}
			<p
				style={{
					textAlign: "center",
					fontSize: 11,
					color: UI.textSecondary,
					margin: 0,
					marginTop: 2,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
				title={getCardName(hero.cardId)}
			>
				{heroName.split(" ")[0]}
			</p>
		</div>
	);
}

// ── Componente principal ──────────────────────────────────────────────────────

export function InventarioGrupo() {
	const { view, state, dispatch } = useGameStore();
	const cardImageUrls = useCardImages();
	const uiAssets = useUiAssets();

	const mesaItens = view.pendingRewards.filter((r) => r.type === "item");
	const mesaArtefatos = view.pendingRewards.filter(
		(r) => r.type === "artifact",
	);
	const heroes = view.heroes.filter((h) => h.status === "active");
	const grupoArtefatos = view.groupArtifacts;

	const [dragging, setDragging] = useState<DragItem | null>(null);
	const [hoverZone, setHoverZone] = useState<string | null>(null);
	const [tooltip, setTooltip] = useState<TooltipTarget | null>(null);
	const [detailCard, setDetailCard] = useState<DetailCardTarget | null>(null);
	const [focusedHero, setFocusedHero] = useState<HeroState | null>(null);

	const backgroundUrl = getUiAssetUrl(uiAssets, "background-card");
	const stoneUrl = getUiAssetUrl(uiAssets, "stonebackground");
	const logoUrl =
		getUiAssetUrl(uiAssets, "logo-completa") ??
		getUiAssetUrl(uiAssets, "newlogo");
	const inventoryStyle = {
		"--inventory-bg": backgroundUrl ? `url("${backgroundUrl}")` : undefined,
		"--inventory-stone": stoneUrl ? `url("${stoneUrl}")` : undefined,
	} as CSSProperties;

	// Scroll horizontal com mouse
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollDown = useRef({ active: false, startX: 0, scrollLeft: 0 });
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Ao montar: se não há rewards pendentes, chamar GRANT_REWARDS
	// biome-ignore lint/correctness/useExhaustiveDependencies: só no mount
	useEffect(() => {
		if (view.pendingRewards.length === 0) {
			dispatch({ type: "GRANT_REWARDS" });
		}
	}, []);

	const pendingArtifactIds = mesaArtefatos.map((r) => r.cardId).join("|");
	// Compatibilidade com partidas já abertas antes da mudança de UX.
	// biome-ignore lint/correctness/useExhaustiveDependencies: depende da assinatura dos IDs pendentes
	useEffect(() => {
		if (!pendingArtifactIds) return;
		mesaArtefatos.forEach((reward, index) => {
			dispatch({
				type: "INV_ASSIGN_ARTIFACT",
				payload: {
					artifactId: reward.cardId,
					vagaIndex: grupoArtefatos.length + index,
					heroId: null,
				},
			});
		});
	}, [pendingArtifactIds, dispatch]);

	// ── Validação de zona ────────────────────────────────────────────────────

	function isValidZone(zone: string): boolean {
		if (!dragging) return false;

		// Itens
		if (dragging.kind === "item") {
			// Mesa: aceita itens que vêm de heróis
			if (zone === "mesa") {
				return dragging.from.kind !== "mesa";
			}
			// Equip: aceita qualquer item não-consumível
			if (zone.startsWith("hero_equip_")) {
				const card = getCardById(dragging.name);
				return card?.type === "item" && card.itemClass !== "consumable";
			}
			// Mochila: aceita se tiver espaço
			if (zone.startsWith("hero_mochila_")) {
				const heroId = zone.replace("hero_mochila_", "");
				const hero = heroes.find((h) => h.id === heroId);
				if (!hero) return false;
				const isFromSameBackpack =
					dragging.from.kind === "hero_backpack" &&
					dragging.from.heroId === heroId;
				const effective = isFromSameBackpack
					? hero.backpack.length - 1
					: hero.backpack.length;
				return effective < MAX_BACKPACK;
			}
		}
		return false;
	}

	// ── Tooltip ───────────────────────────────────────────────────────────────

	function showTooltip(t: TooltipTarget) {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
		if (!dragging) setTooltip(t);
	}

	function hideTooltip() {
		hideTimeoutRef.current = setTimeout(() => setTooltip(null), 150);
	}

	function cancelHideTooltip() {
		if (hideTimeoutRef.current) {
			clearTimeout(hideTimeoutRef.current);
			hideTimeoutRef.current = null;
		}
	}

	function handleUseItemFromTooltip(itemId: string, heroId: string) {
		dispatch({ type: "USE_ITEM", payload: { itemId, heroId } });
		setTooltip(null);
	}

	// ── Drag handlers ─────────────────────────────────────────────────────────

	function handleItemDragStart(name: string, from: InvFromZone) {
		setTooltip(null);
		setDragging({ name, kind: "item", from });
	}

	function handleDragEnd() {
		setDragging(null);
		setHoverZone(null);
	}

	// ── Drop ─────────────────────────────────────────────────────────────────

	function handleZoneDrop(zone: string) {
		if (!dragging || !isValidZone(zone)) return;

		if (dragging.kind === "item") {
			let to: InvToZone;
			if (zone === "mesa") {
				to = { kind: "mesa" };
			} else if (zone.startsWith("hero_equip_")) {
				to = { kind: "hero_equip", heroId: zone.replace("hero_equip_", "") };
			} else if (zone.startsWith("hero_mochila_")) {
				to = {
					kind: "hero_backpack",
					heroId: zone.replace("hero_mochila_", ""),
				};
			} else {
				return;
			}
			dispatch({
				type: "INV_MOVE",
				payload: { itemId: dragging.name, from: dragging.from, to },
			});
		}

		setDragging(null);
		setHoverZone(null);
	}

	function dropHandlers(zone: string) {
		const valid = isValidZone(zone);
		return {
			onDragOver: (e: React.DragEvent) => {
				if (valid) {
					e.preventDefault();
					setHoverZone(zone);
				}
			},
			onDragLeave: () => setHoverZone(null),
			onDrop: (e: React.DragEvent) => {
				e.preventDefault();
				setHoverZone(null);
				if (valid) handleZoneDrop(zone);
			},
		};
	}

	// ── Scroll mãozinha ───────────────────────────────────────────────────────

	function onScrollMouseDown(e: React.MouseEvent<HTMLDivElement>) {
		if ((e.target as HTMLElement).closest("[data-item]")) return;
		const el = scrollRef.current;
		if (!el) return;
		scrollDown.current = {
			active: true,
			startX: e.pageX - el.offsetLeft,
			scrollLeft: el.scrollLeft,
		};
	}

	function onScrollMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const s = scrollDown.current;
		if (!s.active || !scrollRef.current) return;
		e.preventDefault();
		const x = e.pageX - scrollRef.current.offsetLeft;
		scrollRef.current.scrollLeft = s.scrollLeft - (x - s.startX) * 1.5;
	}

	function onScrollMouseUp() {
		scrollDown.current.active = false;
	}

	// ── Saída ─────────────────────────────────────────────────────────────────

	function handleSair() {
		dispatch({ type: "INV_DISCARD_MESA" });
	}

	// ── Mesa — zona de drop (itens voltando de heróis) ────────────────────────

	const mesaDropValid = isValidZone("mesa");
	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<>
			<div className="inventory-overlay" style={inventoryStyle}>
				<div
					role="dialog"
					aria-modal="true"
					aria-label="Inventário do grupo"
					className="inventory-dialog"
				>
					<div className="inventory-header">
						<div className="inventory-title">
							{logoUrl ? <img src={logoUrl} alt="" /> : null}
							<div>
								<h1>Inventário do grupo</h1>
								<p>Arrume recompensas antes da próxima fase</p>
							</div>
						</div>
					</div>

					<section className="inventory-section">
						<div className="inventory-table-row">
							<div
								{...dropHandlers("mesa")}
								className="inventory-drop-panel inventory-drop-panel--items inventory-drop-panel--discard"
								style={
									{
										"--inventory-drop-border": `${
											mesaDropValid
												? hoverZone === "mesa"
													? "#0044AA"
													: "#3B82F6"
												: UI.border
										}`,
										background:
											mesaDropValid && hoverZone === "mesa"
												? "rgba(59, 130, 246, 0.18)"
												: undefined,
									} as CSSProperties
								}
							>
								<p className="inventory-drop-panel__label">Itens não guardados</p>
								<div className="inventory-card-grid">
									{mesaItens.map((r) => {
										const col = itemColor(r.cardId);
										const isMe =
											dragging?.from.kind === "mesa" &&
											dragging.name === r.cardId;
										return (
											<InventoryRewardCard
												key={r.cardId}
												cardId={r.cardId}
												cardType="item"
												imageUrl={getCardImageUrl(cardImageUrls, r.cardId)}
												color={col}
												isDragging={isMe}
												onDragStart={(e) => {
													e.dataTransfer.setData("text/plain", r.cardId);
													handleItemDragStart(r.cardId, { kind: "mesa" });
												}}
												onDragEnd={handleDragEnd}
												onInfo={() =>
													setDetailCard({ cardId: r.cardId, cardType: "item" })
												}
												onMouseEnter={(e) =>
													showTooltip({
														name: r.cardId,
														kind: "item",
														x: e.clientX,
														y: e.clientY,
													})
												}
												onMouseMove={(e) =>
													showTooltip({
														name: r.cardId,
														kind: "item",
														x: e.clientX,
														y: e.clientY,
													})
												}
												onMouseLeave={hideTooltip}
											/>
										);
									})}
									{mesaItens.length === 0 && (
										<span className="inventory-empty-state">
											sem itens para descartar
										</span>
									)}
								</div>
							</div>
						</div>
					</section>

					<section className="inventory-section">
						<p className="inventory-strip-label">
							Artefatos ativos · {grupoArtefatos.length}
						</p>
						<div className="inventory-artifact-grid inventory-artifact-grid--open">
							{grupoArtefatos.map((art, vagaIndex) => {
								const requiresBearer = artifactRequiresBearer(art.cardId);
								const artName = getCardName(art.cardId);
								return (
									<div key={vagaIndex} className="inventory-active-artifact">
										<div className="inventory-active-artifact__image">
											{getCardImageUrl(cardImageUrls, art.cardId) ? (
												<img
													src={getCardImageUrl(cardImageUrls, art.cardId)}
													alt=""
												/>
											) : (
												<span>{artName.slice(0, 1)}</span>
											)}
										</div>
										<div className="inventory-active-artifact__body">
											<p title={artName}>{artName}</p>
											{requiresBearer ? (
												<div
													style={{
														display: "flex",
														alignItems: "center",
														gap: 6,
														marginTop: 4,
														fontSize: 11,
													}}
												>
													<span>Portador:</span>
													<select
														value={art.carriedBy ?? ""}
														onChange={(e) =>
															dispatch({
																type: "INV_SET_BEARER",
																payload: {
																	vagaIndex,
																	heroId: e.target.value || null,
																},
															})
														}
														style={{
															flex: 1,
															fontSize: 11,
															padding: "2px 4px",
															border: `1px solid ${AMBER.border}`,
															borderRadius: 4,
															background: "#fff",
															color: AMBER.ink,
														}}
													>
														<option value="">— sem portador —</option>
														{heroes.map((h) => (
															<option key={h.id} value={h.id}>
																{getCardName(h.cardId).split(" ")[0]}
															</option>
														))}
													</select>
												</div>
											) : (
												<p
													style={{
														fontSize: 11,
														margin: "4px 0 0 0",
														opacity: 0.7,
													}}
												>
													Artefato passivo do grupo
												</p>
											)}
										</div>
										<button
											type="button"
											className="inventory-info-button"
											aria-label={`Informações de ${artName}`}
											title={`Informações de ${artName}`}
											onClick={() =>
												setDetailCard({
													cardId: art.cardId,
													cardType: "artifact",
												})
											}
										>
											i
										</button>
									</div>
								);
							})}
							{grupoArtefatos.length === 0 && (
								<div className="inventory-active-artifact inventory-active-artifact--empty">
									sem artefatos ativos
								</div>
							)}
						</div>
					</section>

					<section className="inventory-section">
						<p className="inventory-strip-label">
							{heroes.length} herói{heroes.length !== 1 ? "s" : ""} ativo
							{heroes.length !== 1 ? "s" : ""}
						</p>

						<section
							ref={scrollRef}
							aria-label="Lista de heróis do inventário"
							onMouseDown={onScrollMouseDown}
							onMouseMove={onScrollMouseMove}
							onMouseUp={onScrollMouseUp}
							onMouseLeave={onScrollMouseUp}
							style={{
								overflowX: "auto",
								paddingBottom: 8,
								cursor: scrollDown.current.active ? "grabbing" : "grab",
							}}
						>
							<div style={{ display: "flex", gap: 12, width: "max-content" }}>
								{heroes.map((hero) => (
									<HeroColumn
										key={hero.id}
										hero={hero}
										imageUrl={getCardImageUrl(cardImageUrls, hero.cardId)}
										dragging={dragging}
										hoverZone={hoverZone}
										onDrop={handleZoneDrop}
										onSetHover={setHoverZone}
										onDragItemStart={handleItemDragStart}
										onDragEnd={handleDragEnd}
										onShowTooltip={showTooltip}
										onHideTooltip={hideTooltip}
										onUseItem={handleUseItemFromTooltip}
										onHeroDetail={setFocusedHero}
										gameState={state}
									/>
								))}
								{heroes.length === 0 && (
									<p style={{ fontSize: 13, color: UI.textTertiary }}>
										Nenhum herói ativo.
									</p>
								)}
							</div>
						</section>
					</section>

					<div
						className="inventory-footer"
						style={{
							borderTop: `1px solid ${UI.border}`,
						}}
					>
						<button
							type="button"
							onClick={handleSair}
							style={{
								padding: "8px 20px",
								border: `1px solid ${UI.border}`,
								borderRadius: 6,
								background: UI.panelBg,
								fontSize: 13,
								cursor: "pointer",
								color: UI.textPrimary,
								transition: "opacity 0.15s",
							}}
						>
							Finalizar arrumação
						</button>
					</div>
				</div>
			</div>

			{focusedHero && (
				<HeroInventoryModal
					hero={focusedHero}
					gameState={state}
					cardImageUrls={cardImageUrls}
					onClose={() => setFocusedHero(null)}
					onItemDetail={(itemId) => {
						setFocusedHero(null);
						setDetailCard({
							cardId: itemId,
							cardType: "item",
							heroId: focusedHero.id,
						});
					}}
				/>
			)}

			{/* ── TOOLTIP ──────────────────────────────────────────────── */}
			{tooltip && (
				<ItemTooltipPanel
					target={tooltip}
					onUseItem={handleUseItemFromTooltip}
					onMouseEnter={cancelHideTooltip}
					onMouseLeave={hideTooltip}
				/>
			)}

			{detailCard && (
				<CardDetailModal
					cardId={detailCard.cardId}
					cardType={detailCard.cardType}
					imageUrl={getCardImageUrl(cardImageUrls, detailCard.cardId)}
					onClose={() => setDetailCard(null)}
					onUseItem={
						detailCard.cardType === "item" && detailCard.heroId
							? () => {
									if (!detailCard.heroId) return;
									handleUseItemFromTooltip(
										detailCard.cardId,
										detailCard.heroId,
									);
									setDetailCard(null);
								}
							: undefined
					}
				/>
			)}
		</>
	);
}

function HeroInventoryModal({
	hero,
	gameState,
	cardImageUrls,
	onClose,
	onItemDetail,
}: {
	hero: HeroState;
	gameState: GameState;
	cardImageUrls: CardImageUrls;
	onClose: () => void;
	onItemDetail: (itemId: string) => void;
}) {
	const heroName = getCardName(hero.cardId);
	const heroImage = getCardImageUrl(cardImageUrls, hero.cardId);
	const passive = getPrimarySkillText(hero.cardId);
	const effectiveStats = heroItemStats(hero, gameState);
	const blockText =
		effectiveStats.protectionText ||
		(hero.conditions.length > 0
			? hero.conditions.join(", ")
			: hero.healBlocked
				? "Cura bloqueada"
				: "Sem bloqueios");

	return (
		<div
			className="inventory-hero-modal-overlay"
			role="dialog"
			aria-modal="true"
			aria-label={`Detalhes de ${heroName}`}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="inventory-hero-modal">
				<button
					type="button"
					className="inventory-hero-modal__close"
					aria-label="Fechar detalhes"
					onClick={onClose}
				>
					×
				</button>

				<div className="inventory-hero-modal__stage">
					{SLOT_TYPES.map((slotType) => (
						<HeroEquipmentCard
							key={slotType}
							slotType={slotType}
							itemId={hero.activeItems[slotType]}
							cardImageUrls={cardImageUrls}
							onItemDetail={onItemDetail}
						/>
					))}

					<section className="inventory-hero-modal__hero">
						<div className="inventory-hero-modal__portrait">
							{heroImage ? (
								<img src={heroImage} alt="" />
							) : (
								<span>{heroName.slice(0, 1)}</span>
							)}
						</div>
						<div className="inventory-hero-modal__copy">
							<h2>{heroName}</h2>
							<div className="inventory-hero-modal__stats">
								<span>
									<strong>Vida</strong>
									{hero.currentLife}/{hero.maxLife}
								</span>
								<span>
									<strong>Acerto</strong>+{hero.hitBonus}
									{effectiveStats.hitBonus
										? ` (${signed(effectiveStats.hitBonus)} item)`
										: ""}
								</span>
								<span>
									<strong>Dados</strong>
									{hero.dice}d
								</span>
								<span>
									<strong>Dano efetivo</strong>
									{effectiveStats.damage}
									{effectiveStats.damageBonus
										? ` (${signed(effectiveStats.damageBonus)} item)`
										: ""}
								</span>
								<span>
									<strong>Proteção</strong>
									{blockText}
								</span>
								<span>
									<strong>Ímpeto</strong>
									{hero.impeto}
								</span>
							</div>
							<div className="inventory-hero-modal__passive">
								<strong>Passiva</strong>
								<p>{passive || "Sem habilidade passiva listada."}</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}

function HeroEquipmentCard({
	slotType,
	itemId,
	cardImageUrls,
	onItemDetail,
}: {
	slotType: ItemSlotType;
	itemId?: string;
	cardImageUrls: CardImageUrls;
	onItemDetail: (itemId: string) => void;
}) {
	const slotName = SLOT_TITLES[slotType];
	const itemName = itemId ? getCardName(itemId) : "";
	const imageUrl = itemId ? getCardImageUrl(cardImageUrls, itemId) : undefined;
	const effect = itemId ? getPrimarySkillText(itemId) : "";

	if (!itemId) {
		return (
			<div
				className={`inventory-hero-modal__equipment inventory-hero-modal__equipment--${slotType} inventory-hero-modal__equipment--empty`}
			>
				<span>{slotName}</span>
				<p>vazio</p>
			</div>
		);
	}

	return (
		<button
			type="button"
			className={`inventory-hero-modal__equipment inventory-hero-modal__equipment--${slotType}`}
			onClick={() => onItemDetail(itemId)}
		>
			<span className="inventory-hero-modal__slot-label">{slotName}</span>
			<div className="inventory-hero-modal__item-image">
				{imageUrl ? (
					<img src={imageUrl} alt="" />
				) : (
					<span>{itemName.slice(0, 1)}</span>
				)}
			</div>
			<strong title={itemName}>{itemName}</strong>
			<p>{effect}</p>
		</button>
	);
}

function getPrimarySkillText(cardId: string): string {
	const entry = cardSkills(cardId)[0];
	return entry ? renderSkillLabel(entry.ref) : "";
}

function InventoryRewardCard({
	cardId,
	cardType,
	imageUrl,
	color,
	amber,
	isDragging,
	onDragStart,
	onDragEnd,
	onInfo,
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
}: {
	cardId: string;
	cardType: "item" | "artifact";
	imageUrl?: string;
	color?: { bg: string; border: string; text: string } | null;
	amber?: boolean;
	isDragging?: boolean;
	onDragStart: (e: React.DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
	onInfo: () => void;
	onMouseEnter: (e: React.MouseEvent) => void;
	onMouseMove: (e: React.MouseEvent) => void;
	onMouseLeave: () => void;
}) {
	const name = getCardName(cardId);
	const accent = amber ? AMBER.border : (color?.border ?? "#d8a93f");

	return (
		<article
			className={`inventory-card-tile${isDragging ? " inventory-card-tile--dragging" : ""}`}
			data-item="true"
			draggable
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onMouseEnter={onMouseEnter}
			onMouseMove={onMouseMove}
			onMouseLeave={onMouseLeave}
			style={{ "--inventory-card-accent": accent } as CSSProperties}
		>
			<span className="setup-card-thumb">
				{imageUrl ? (
					<img src={imageUrl} alt="" />
				) : (
					<span className="setup-card-fallback">{name.slice(0, 1)}</span>
				)}
			</span>
			<span>{name}</span>
			<button
				type="button"
				className="inventory-info-button"
				aria-label={`Informações de ${name}`}
				title={`Informações de ${name}`}
				draggable={false}
				onMouseDown={(e) => e.stopPropagation()}
				onClick={(e) => {
					e.stopPropagation();
					onInfo();
				}}
			>
				i
			</button>
			<span className="inventory-card-tile__type">
				{cardType === "artifact" ? "Artefato" : "Item"}
			</span>
		</article>
	);
}

// ── Painel de tooltip ─────────────────────────────────────────────────────────

function ItemTooltipPanel({
	target,
	onUseItem,
	onMouseEnter,
	onMouseLeave,
}: {
	target: TooltipTarget;
	onUseItem: (itemId: string, heroId: string) => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}) {
	const card = getCardById(target.name);
	if (!card || (card.type !== "item" && card.type !== "artifact")) return null;

	// Posição: acima e à direita do cursor; ajusta se sair da viewport
	const TOOLTIP_W = 240;
	const left = Math.min(target.x + 14, window.innerWidth - TOOLTIP_W - 8);
	const top = target.y - 12;

	const isItem = card.type === "item";
	const tagLine = isItem
		? (getCardLocale(card.id)?.tags ?? []).join(" · ")
		: "Artefato de grupo";
	const effectEntry = cardSkills(card.id)[0];
	const effect = effectEntry ? renderSkillLabel(effectEntry.ref) : "";

	const accentColor = isItem ? (ITEM_COLORS[card.itemClass] ?? null) : AMBER;
	const canUseItem =
		isItem &&
		!!target.heroId &&
		(card.itemClass === "consumable" ||
			effectEntry?.ref.skillId === "item_skill_mystic_draw");

	return (
		<div
			role="tooltip"
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{
				position: "fixed",
				left,
				top,
				transform: "translateY(-100%)",
				zIndex: 300,
				width: TOOLTIP_W,
				background: "#1C1C1A",
				color: "#F5F4F0",
				borderRadius: 8,
				padding: "10px 12px",
				boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
				pointerEvents: "auto",
				fontSize: 11,
				lineHeight: 1.45,
			}}
		>
			{/* Nome */}
			<p
				style={{
					fontWeight: 600,
					fontSize: 12,
					margin: "0 0 2px 0",
					color: "#FFFFFF",
				}}
			>
				{getCardName(card.id)}
			</p>
			{/* Tag / tipo */}
			<p
				style={{
					margin: "0 0 6px 0",
					fontSize: 10,
					fontWeight: 500,
					color: accentColor ? accentColor.border : "#BA7517",
					textTransform: "uppercase",
					letterSpacing: "0.04em",
				}}
			>
				{tagLine}
			</p>
			{/* Divisor */}
			<div
				style={{
					borderTop: "1px solid rgba(255,255,255,0.12)",
					marginBottom: 6,
				}}
			/>
			{/* Efeito */}
			<p style={{ margin: "0 0 0 0", color: "#CCCAC4" }}>{effect}</p>
			{/* Botão Usar — consumíveis e itens ativos especiais */}
			{canUseItem && (
				<button
					type="button"
					onClick={() => {
						if (target.heroId) onUseItem(target.name, target.heroId);
					}}
					style={{
						marginTop: 8,
						width: "100%",
						padding: "5px 0",
						background: "#3B6D11",
						color: "#E8F5DE",
						border: "none",
						borderRadius: 4,
						fontSize: 11,
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					Usar
				</button>
			)}
		</div>
	);
}
