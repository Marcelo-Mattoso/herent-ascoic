// Tela de gerenciamento de inventário do grupo — Patch 4.
// Substitui o modal de recompensa por uma tela completa de organização.
// Drag & drop livre entre todas as zonas: mesa ↔ herói-slot ↔ herói-mochila.

import { useEffect, useRef, useState } from "react";
import { getCardByName } from "@/core/data/cards";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { InvFromZone, InvToZone } from "@/core/actions/types";
import type { HeroState, ItemSlotType } from "@/core/state/heroState";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

// ── Constantes de cor ─────────────────────────────────────────────────────────

const AMBER = { bg: "#FAEEDA", border: "#BA7517", ink: "#633806" } as const;

// Mesma paleta do ItemTile (board): weapon=ouro, armor=azul, utility=verde, special=rosa
const SLOT_COLORS_INV: Record<string, { bg: string; border: string; text: string }> = {
	weapon:  { bg: "#FAC775", border: "#BA7517", text: "#5C3A00" },
	armor:   { bg: "#B5D4F4", border: "#185FA5", text: "#0D3A6E" },
	utility: { bg: "#C0DD97", border: "#3B6D11", text: "#1B4500" },
	special: { bg: "#ED93B1", border: "#8B1A4A", text: "#5A0022" },
};

// itemClass → cor mais próxima da paleta de slots
const ITEM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
	equipment: { bg: "#FAC775", border: "#BA7517", text: "#5C3A00" }, // ouro (weapon)
	consumable: { bg: "#C0DD97", border: "#3B6D11", text: "#1B4500" }, // verde (utility)
	utility:   { bg: "#B5D4F4", border: "#185FA5", text: "#0D3A6E" }, // azul (armor)
	special:   { bg: "#ED93B1", border: "#8B1A4A", text: "#5A0022" }, // rosa (special)
};

function itemColor(itemName: string) {
	const card = getCardByName(itemName);
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
const MAX_BACKPACK = 8;

function shortLabel(name: string): string {
	const word = name.split(" ")[0] ?? name;
	return word.length <= 6 ? word : `${word.slice(0, 5)}…`;
}

function artifactRequiresBearer(cardName: string): boolean {
	const card = getCardByName(cardName);
	if (card?.type !== "artifact") return false;
	const main = cardSkills(card.id)[0];
	if (!main) return false;
	return renderSkillLabel(main.ref).toLowerCase().includes("portador");
}

// ── Tipo do item em voo ───────────────────────────────────────────────────────

type DragItem = {
	name: string;
	kind: "item" | "artefato";
	from: InvFromZone;
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
		<div
			draggable={draggable}
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
		</div>
	);
}

// ── Componente de herói ───────────────────────────────────────────────────────

type TooltipTarget = { name: string; kind: "item" | "artifact"; x: number; y: number; heroId?: string };

interface HeroColumnProps {
	hero: HeroState;
	dragging: DragItem | null;
	hoverZone: string | null;
	groupArtifacts: ReadonlyArray<{ cardName: string; carriedBy: string | null }>;
	onDrop: (zone: string) => void;
	onSetHover: (zone: string | null) => void;
	onDragItemStart: (name: string, from: InvFromZone) => void;
	onDragEnd: () => void;
	onShowTooltip: (t: TooltipTarget) => void;
	onHideTooltip: () => void;
	onUseItem: (itemName: string, heroId: string) => void;
}

function HeroColumn({
	hero,
	dragging,
	hoverZone,
	groupArtifacts,
	onDrop,
	onSetHover,
	onDragItemStart,
	onDragEnd,
	onShowTooltip,
	onHideTooltip,
	onUseItem: _onUseItem,
}: HeroColumnProps) {
	const equipZone = `hero_equip_${hero.id}`;
	const mochilaZone = `hero_mochila_${hero.id}`;

	function canEquipDrag(): boolean {
		if (!dragging || dragging.kind !== "item") return false;
		const card = getCardByName(dragging.name);
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

	const posseArt = groupArtifacts.find((a) => a.carriedBy === hero.id);
	const isDragging = !!dragging;

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
	const canMochila = canMochilaDrag();

	return (
		<div
			style={{
				width: 170,
				flexShrink: 0,
				border: `1px solid ${UI.border}`,
				borderRadius: 8,
				padding: 10,
				background: UI.panelBg,
				display: "flex",
				flexDirection: "column",
			}}
		>
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
					const col = name ? (SLOT_COLORS_INV[slotType] ?? itemColor(name)) : null;
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
							onMouseEnter={(e) => onShowTooltip({ name, kind: "item", x: e.clientX, y: e.clientY, heroId: hero.id })}
							onMouseMove={(e) => onShowTooltip({ name, kind: "item", x: e.clientX, y: e.clientY, heroId: hero.id })}
							onMouseLeave={onHideTooltip}
						/>
					) : (
						<Slot
							key={slotType}
							label={SLOT_LABELS[slotType]}
						/>
					);
				})}
			</div>

			{/* Slot âmbar de posse (artefato carregado) */}
			<div style={{ marginBottom: 8 }}>
				<Slot
					amber
					label={posseArt ? shortLabel(posseArt.cardName) : ""}
					title={posseArt?.cardName ?? "sem artefato em posse"}
					filled={!!posseArt}
				/>
			</div>

			{/* Arte placeholder */}
			<div
				style={{
					border: `1px solid ${UI.border}`,
					borderRadius: 4,
					aspectRatio: "3/2",
					marginBottom: 6,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: UI.subpanelBg,
					fontSize: 22,
				}}
			>
				🧙
			</div>

			{/* Status */}
			<div
				style={{
					border: `1px dashed ${UI.border}`,
					borderRadius: 4,
					padding: "4px 6px",
					marginBottom: 8,
					fontSize: 11,
					color: UI.textSecondary,
					minHeight: 36,
				}}
			>
				<div>❤ {hero.currentLife}/{hero.maxLife}</div>
				<div>⚔ {hero.damage} dmg</div>
			</div>

			{/* Mochila 4×2 — zona de drop inteira */}
			<div
				{...areaDropHandlers(mochilaZone, canMochila)}
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 36px)",
					gap: 4,
					marginBottom: 6,
					borderRadius: 4,
					padding: 2,
					border: isDragging
						? canMochila
							? `1px dashed ${hoverZone === mochilaZone ? "#0044AA" : "#3B82F6"}`
							: "1px dashed transparent"
						: "1px solid transparent",
					background:
						canMochila && hoverZone === mochilaZone ? "#BFDBFE" : "transparent",
					transition: "background 0.1s",
				}}
			>
				{Array.from({ length: MAX_BACKPACK }, (_, i) => {
					const name = hero.backpack[i];
					const col = name ? itemColor(name) : null;
					const isThisItemDragging =
						dragging?.from.kind === "hero_backpack" &&
						dragging.from.heroId === hero.id &&
						dragging.from.index === i;

					return name ? (
						<Slot
							key={i}
							label={shortLabel(name)}
							color={col}
							filled
							draggable
							isDragging={isThisItemDragging}
							onDragStart={(e) => {
								e.dataTransfer.setData("text/plain", name);
								onDragItemStart(name, {
									kind: "hero_backpack",
									heroId: hero.id,
									index: i,
								});
							}}
							onDragEnd={onDragEnd}
							onMouseEnter={(e) => onShowTooltip({ name, kind: "item", x: e.clientX, y: e.clientY, heroId: hero.id })}
							onMouseMove={(e) => onShowTooltip({ name, kind: "item", x: e.clientX, y: e.clientY, heroId: hero.id })}
							onMouseLeave={onHideTooltip}
						/>
					) : (
						<Slot key={i} />
					);
				})}
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
				title={hero.cardName}
			>
				{hero.cardName.split(" ")[0]}
			</p>
		</div>
	);
}

// ── Componente principal ──────────────────────────────────────────────────────

export function InventarioGrupo() {
	const { state, dispatch } = useGameStore();

	const mesaItens = state.pendingRewards.filter((r) => r.type === "item");
	const mesaArtefatos = state.pendingRewards.filter(
		(r) => r.type === "artifact",
	);
	const heroes = state.heroes.filter((h) => h.status === "active");
	const grupoArtefatos = state.groupArtifacts;

	const [dragging, setDragging] = useState<DragItem | null>(null);
	const [hoverZone, setHoverZone] = useState<string | null>(null);
	const [confirmDiscard, setConfirmDiscard] = useState(false);
	const [tooltip, setTooltip] = useState<TooltipTarget | null>(null);

	// Scroll horizontal com mouse
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollDown = useRef({ active: false, startX: 0, scrollLeft: 0 });
	const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Ao montar: se não há rewards pendentes, chamar GRANT_REWARDS
	// biome-ignore lint/correctness/useExhaustiveDependencies: só no mount
	useEffect(() => {
		if (state.pendingRewards.length === 0) {
			dispatch({ type: "GRANT_REWARDS" });
		}
	}, []);

	// Resetar checkbox quando mesa muda
	const totalMesa = mesaItens.length + mesaArtefatos.length;
	useEffect(() => {
		setConfirmDiscard(false);
	}, [totalMesa]);

	// ── Validação de zona ────────────────────────────────────────────────────

	function isValidZone(zone: string): boolean {
		if (!dragging) return false;

		// Artefatos só vão para vagas do grupo
		if (dragging.kind === "artefato") {
			if (zone === "grupo_vaga_0") return grupoArtefatos.length === 0;
			if (zone === "grupo_vaga_1") return grupoArtefatos.length === 1;
			return false;
		}

		// Itens
		if (dragging.kind === "item") {
			// Mesa: aceita itens que vêm de heróis
			if (zone === "mesa") {
				return dragging.from.kind !== "mesa";
			}
			// Equip: aceita qualquer item não-consumível
			if (zone.startsWith("hero_equip_")) {
				const card = getCardByName(dragging.name);
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

	function handleUseItemFromTooltip(itemName: string, heroId: string) {
		dispatch({ type: "USE_ITEM", payload: { itemName, heroId } });
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
				payload: { itemName: dragging.name, from: dragging.from, to },
			});
		} else if (dragging.kind === "artefato") {
			const vagaIndex = zone === "grupo_vaga_0" ? 0 : (1 as 0 | 1);
			dispatch({
				type: "INV_ASSIGN_ARTIFACT",
				payload: { artifactName: dragging.name, vagaIndex, heroId: null },
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
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			style={{ background: "rgba(0,0,0,0.45)" }}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Inventário do grupo"
				style={{
					background: UI.panelBg,
					width: "100%",
					maxWidth: 920,
					borderRadius: 12,
					padding: 24,
					boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
					color: UI.textPrimary,
				}}
			>
				{/* Título */}
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "baseline",
						borderBottom: `1px solid ${UI.border}`,
						paddingBottom: 12,
						marginBottom: 20,
					}}
				>
					<h1
						style={{
							fontSize: 18,
							fontWeight: 500,
							margin: 0,
							color: UI.textPrimary,
						}}
					>
						Inventário do grupo
					</h1>
					<span style={{ fontSize: 12, color: UI.textTertiary }}>
						arraste itens entre as zonas
					</span>
				</div>

				{/* ── MESA ──────────────────────────────────────────────────── */}
				<p style={{ fontSize: 12, color: UI.textSecondary, margin: "0 0 8px 0" }}>
					Mesa · o que ficar aqui será descartado
				</p>

				<div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
					{/* Mesa — itens */}
					<div
						{...dropHandlers("mesa")}
						style={{
							flex: 1,
							border: `1px ${mesaDropValid ? "dashed" : "dashed"} ${
								mesaDropValid
									? hoverZone === "mesa"
										? "#0044AA"
										: "#3B82F6"
									: UI.border
							}`,
							borderRadius: 8,
							padding: 10,
							background:
								mesaDropValid && hoverZone === "mesa" ? "#EFF6FF" : "transparent",
							transition: "background 0.1s, border-color 0.1s",
						}}
					>
						<p style={{ fontSize: 11, color: UI.textSecondary, margin: "0 0 6px 0" }}>
							Itens
						</p>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, 36px)",
								gap: 4,
								minHeight: 36,
							}}
						>
							{mesaItens.map((r) => {
								const col = itemColor(r.cardName);
								const isMe =
									dragging?.from.kind === "mesa" &&
									dragging.name === r.cardName;
								return (
									<Slot
										key={r.cardName}
										label={shortLabel(r.cardName)}
										color={col}
										filled
										draggable
										isDragging={isMe}
										onDragStart={(e) => {
											e.dataTransfer.setData("text/plain", r.cardName);
											handleItemDragStart(r.cardName, { kind: "mesa" });
										}}
										onDragEnd={handleDragEnd}
										onMouseEnter={(e) => showTooltip({ name: r.cardName, kind: "item", x: e.clientX, y: e.clientY })}
										onMouseMove={(e) => showTooltip({ name: r.cardName, kind: "item", x: e.clientX, y: e.clientY })}
										onMouseLeave={hideTooltip}
									/>
								);
							})}
							{mesaItens.length === 0 && (
								<span
									style={{ fontSize: 11, color: UI.textTertiary, alignSelf: "center" }}
								>
									vazio
								</span>
							)}
						</div>
					</div>

					{/* Mesa — artefatos */}
					<div
						style={{
							width: 220,
							background: AMBER.bg,
							border: `1px solid ${AMBER.border}`,
							borderRadius: 8,
							padding: 10,
						}}
					>
						<p style={{ fontSize: 11, color: AMBER.ink, margin: "0 0 6px 0" }}>
							Artefatos de grupo
						</p>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fill, 36px)",
								gap: 4,
								minHeight: 36,
							}}
						>
							{mesaArtefatos.map((r) => {
								const isMe =
									dragging?.from.kind === "mesa" && dragging.name === r.cardName;
								return (
									<Slot
										key={r.cardName}
										amber
										label={shortLabel(r.cardName)}
										filled
										draggable
										isDragging={isMe}
										onDragStart={(e) => {
											e.dataTransfer.setData("text/plain", r.cardName);
											setTooltip(null);
											setDragging({
												name: r.cardName,
												kind: "artefato",
												from: { kind: "mesa" },
											});
										}}
										onDragEnd={handleDragEnd}
										onMouseEnter={(e) => showTooltip({ name: r.cardName, kind: "artifact", x: e.clientX, y: e.clientY })}
										onMouseMove={(e) => showTooltip({ name: r.cardName, kind: "artifact", x: e.clientX, y: e.clientY })}
										onMouseLeave={hideTooltip}
									/>
								);
							})}
							{mesaArtefatos.length === 0 && (
								<span
									style={{ fontSize: 11, color: AMBER.ink, opacity: 0.6, alignSelf: "center" }}
								>
									vazio
								</span>
							)}
						</div>
					</div>
				</div>

				<hr style={{ border: "none", borderTop: `1px solid ${UI.border}`, margin: "0 0 16px 0" }} />

				{/* ── ARTEFATOS ATIVOS DO GRUPO ─────────────────────────── */}
				<p style={{ fontSize: 12, color: UI.textSecondary, margin: "0 0 8px 0" }}>
					Grupo · artefatos ativos ({grupoArtefatos.length}/2)
				</p>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 12,
						marginBottom: 16,
					}}
				>
					{[0, 1].map((vagaIndex) => {
						const art = grupoArtefatos[vagaIndex];
						const zone = `grupo_vaga_${vagaIndex}`;
						const valid = isValidZone(zone);
						const isHov = hoverZone === zone;

						if (!art) {
							return (
								<div
									key={vagaIndex}
									{...dropHandlers(zone)}
									style={{
										background: isHov ? "#FFF3CD" : AMBER.bg,
										border: `1px dashed ${isHov ? "#996600" : AMBER.border}`,
										borderRadius: 8,
										padding: 12,
										display: "flex",
										justifyContent: "center",
										alignItems: "center",
										opacity: valid ? 1 : 0.55,
										color: AMBER.ink,
										fontSize: 12,
										minHeight: 68,
										transition: "background 0.1s",
									}}
								>
									vaga {vagaIndex + 1} — vazia
								</div>
							);
						}

						const requiresBearer = artifactRequiresBearer(art.cardName);
						return (
							<div
								key={vagaIndex}
								style={{
									background: AMBER.bg,
									border: `1px solid ${AMBER.border}`,
									borderRadius: 8,
									padding: 12,
									display: "flex",
									gap: 12,
									alignItems: "flex-start",
									color: AMBER.ink,
								}}
							>
								<div
									style={{
										width: 44,
										height: 44,
										border: `1px solid ${AMBER.border}`,
										borderRadius: 4,
										flexShrink: 0,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										fontSize: 22,
									}}
								>
									💎
								</div>
								<div style={{ flex: 1, minWidth: 0 }}>
									<p
										style={{
											fontWeight: 500,
											fontSize: 13,
											margin: 0,
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										}}
										title={art.cardName}
									>
										{art.cardName}
									</p>
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
														payload: { vagaIndex, heroId: e.target.value || null },
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
														{h.cardName.split(" ")[0]}
													</option>
												))}
											</select>
										</div>
									) : (
										<p style={{ fontSize: 11, margin: "4px 0 0 0", opacity: 0.7 }}>
											Artefato passivo do grupo
										</p>
									)}
								</div>
							</div>
						);
					})}
				</div>

				<hr style={{ border: "none", borderTop: `1px solid ${UI.border}`, margin: "0 0 16px 0" }} />

				{/* ── HERÓIS ────────────────────────────────────────────── */}
				<p style={{ fontSize: 12, color: UI.textSecondary, margin: "0 0 8px 0" }}>
					Heróis · {heroes.length} ativo{heroes.length !== 1 ? "s" : ""} · arraste lateral para ver todos
				</p>

				<div
					ref={scrollRef}
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
								dragging={dragging}
								hoverZone={hoverZone}
								groupArtifacts={grupoArtefatos}
								onDrop={handleZoneDrop}
								onSetHover={setHoverZone}
								onDragItemStart={handleItemDragStart}
								onDragEnd={handleDragEnd}
								onShowTooltip={showTooltip}
								onHideTooltip={hideTooltip}
								onUseItem={handleUseItemFromTooltip}
							/>
						))}
						{heroes.length === 0 && (
							<p style={{ fontSize: 13, color: UI.textTertiary }}>
								Nenhum herói ativo.
							</p>
						)}
					</div>
				</div>

				{/* ── RODAPÉ ────────────────────────────────────────────── */}
				<div
					style={{
						borderTop: `1px solid ${UI.border}`,
						marginTop: 20,
						paddingTop: 14,
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						{totalMesa > 0 ? (
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									fontSize: 13,
									color: UI.textPrimary,
									cursor: "pointer",
								}}
							>
								<input
									type="checkbox"
									checked={confirmDiscard}
									onChange={(e) => setConfirmDiscard(e.target.checked)}
									style={{ width: 16, height: 16 }}
								/>
								Confirmo descartar {totalMesa} item
								{totalMesa !== 1 ? "s" : ""} da mesa
							</label>
						) : (
							<span style={{ fontSize: 13, color: UI.textTertiary }}>
								Mesa vazia
							</span>
						)}
					</div>

					<button
						type="button"
						onClick={handleSair}
						disabled={totalMesa > 0 && !confirmDiscard}
						style={{
							padding: "8px 20px",
							border: `1px solid ${UI.border}`,
							borderRadius: 6,
							background:
								totalMesa > 0 && !confirmDiscard ? UI.subpanelBg : UI.panelBg,
							fontSize: 13,
							cursor:
								totalMesa > 0 && !confirmDiscard ? "not-allowed" : "pointer",
							color:
								totalMesa > 0 && !confirmDiscard
									? UI.textTertiary
									: UI.textPrimary,
							opacity: totalMesa > 0 && !confirmDiscard ? 0.45 : 1,
							transition: "opacity 0.15s",
						}}
					>
						{totalMesa > 0 ? "Descartar e sair" : "Sair"}
					</button>
				</div>
			</div>
		</div>

		{/* ── TOOLTIP ──────────────────────────────────────────────── */}
		{tooltip && (
			<ItemTooltipPanel
				target={tooltip}
				onUseItem={handleUseItemFromTooltip}
				onMouseEnter={cancelHideTooltip}
				onMouseLeave={hideTooltip}
			/>
		)}
		</>
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
	onUseItem: (itemName: string, heroId: string) => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
}) {
	const card = getCardByName(target.name);
	if (!card || (card.type !== "item" && card.type !== "artifact")) return null;

	// Posição: acima e à direita do cursor; ajusta se sair da viewport
	const TOOLTIP_W = 240;
	const left = Math.min(target.x + 14, window.innerWidth - TOOLTIP_W - 8);
	const top = target.y - 12;

	const isItem = card.type === "item";
	const tagLine = isItem ? card.tags.join(" · ") : "Artefato de grupo";
	const effectEntry = cardSkills(card.id)[0];
	const effect = effectEntry ? renderSkillLabel(effectEntry.ref) : "";

	const accentColor = isItem ? (ITEM_COLORS[card.itemClass] ?? null) : AMBER;
	const isConsumable = isItem && card.itemClass === "consumable" && !!target.heroId;

	return (
		<div
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
			<p style={{ fontWeight: 600, fontSize: 12, margin: "0 0 2px 0", color: "#FFFFFF" }}>
				{card.name}
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
			<div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", marginBottom: 6 }} />
			{/* Efeito */}
			<p style={{ margin: "0 0 0 0", color: "#CCCAC4" }}>{effect}</p>
			{/* Botão Usar — só consumíveis na mochila de um herói */}
			{isConsumable && (
				<button
					type="button"
					onClick={() => onUseItem(target.name, target.heroId!)}
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
