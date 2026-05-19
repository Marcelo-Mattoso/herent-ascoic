// Tela de gerenciamento de inventário do grupo — Patch 4.
// Substitui o modal de recompensa por uma tela completa de organização.
// Layout: Mesa (topo) → Artefatos ativos (meio) → Heróis com scroll (base) → Rodapé.

import { useEffect, useRef, useState } from "react";
import { getCardByName } from "@/data/cards";
import type { HeroState, ItemSlotType } from "@/core/state/heroState";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

// ── Constantes ────────────────────────────────────────────────────────────────

const AMBER = {
	bg: "#FAEEDA",
	border: "#BA7517",
	ink: "#633806",
} as const;

const SLOT_TYPES: ItemSlotType[] = ["weapon", "armor", "utility", "special"];
const SLOT_LABELS: Record<ItemSlotType, string> = {
	weapon: "arm",
	armor: "esc",
	utility: "utl",
	special: "esp",
};
const MAX_BACKPACK = 8;

// ── Tipos internos ────────────────────────────────────────────────────────────

type DragItem = { name: string; kind: "item" | "artefato" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortLabel(name: string): string {
	const word = name.split(" ")[0] ?? name;
	return word.length <= 6 ? word : word.slice(0, 5) + "…";
}

function artifactRequiresBearer(cardName: string): boolean {
	const card = getCardByName(cardName);
	return (
		card?.type === "artifact" &&
		typeof card.effect === "string" &&
		card.effect.toLowerCase().includes("portador")
	);
}

// ── Componente de slot visual ─────────────────────────────────────────────────

interface SlotProps {
	label?: string;
	title?: string;
	amber?: boolean;
	filled?: boolean;
	draggable?: boolean;
	dragValid?: boolean; // zona pode receber o item sendo arrastado
	dragActive?: boolean; // drag está ativo (algum item em voo)
	isHover?: boolean;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: () => void;
	onDragOver?: (e: React.DragEvent) => void;
	onDragLeave?: () => void;
	onDrop?: (e: React.DragEvent) => void;
}

function Slot({
	label,
	title,
	amber,
	filled,
	draggable,
	dragValid,
	dragActive,
	isHover,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDragLeave,
	onDrop,
}: SlotProps) {
	const baseBg = amber ? AMBER.bg : "transparent";
	const baseBorder = amber
		? AMBER.border
		: `rgba(0,0,0,${filled ? 0.25 : 0.15})`;

	let bg = baseBg;
	let border = baseBorder;
	let opacity = 1;
	let borderStyle: "solid" | "dashed" = "solid";

	if (dragActive) {
		if (dragValid) {
			borderStyle = "dashed";
			border = isHover ? "#0066CC" : "#3B82F6";
			bg = isHover ? "#DBEAFE" : "#EFF6FF";
		} else {
			opacity = 0.25;
		}
	}

	return (
		<div
			draggable={draggable}
			title={title}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
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
				color: amber ? AMBER.ink : UI.textTertiary,
				cursor: draggable ? "grab" : "default",
				userSelect: "none",
				flexShrink: 0,
				transition: "background 0.1s, border-color 0.1s, opacity 0.1s",
			}}
		>
			{label}
		</div>
	);
}

// ── Card de herói ─────────────────────────────────────────────────────────────

interface HeroCardProps {
	hero: HeroState;
	dragging: DragItem | null;
	hoverZone: string | null;
	groupArtifacts: ReadonlyArray<{ cardName: string; carriedBy: string | null }>;
	onDrop: (zone: string) => void;
	onSetHover: (zone: string | null) => void;
}

function HeroColumn({
	hero,
	dragging,
	hoverZone,
	groupArtifacts,
	onDrop,
	onSetHover,
}: HeroCardProps) {
	const equipZone = `hero_equip_${hero.id}`;
	const mochilaZone = `hero_mochila_${hero.id}`;

	const canEquip =
		dragging?.kind === "item" &&
		(() => {
			const card = getCardByName(dragging.name);
			return card?.type === "item" && card.itemClass !== "consumable";
		})();

	const canMochila =
		dragging?.kind === "item" && hero.backpack.length < MAX_BACKPACK;

	const posseArt = groupArtifacts.find((a) => a.carriedBy === hero.id);

	function dropHandlers(zone: string, valid: boolean) {
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
				gap: 0,
			}}
		>
			{/* 4 slots de equipamento */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 36px)",
					gap: 4,
					marginBottom: 6,
					borderRadius: 4,
					padding: 2,
					border: canEquip
						? `1px dashed ${hoverZone === equipZone ? "#0066CC" : "#3B82F6"}`
						: "1px solid transparent",
					background:
						canEquip && hoverZone === equipZone ? "#DBEAFE" : "transparent",
					transition: "background 0.1s, border-color 0.1s",
				}}
				{...dropHandlers(equipZone, !!canEquip)}
			>
				{SLOT_TYPES.map((slotType) => {
					const itemName = hero.activeItems[slotType];
					return (
						<Slot
							key={slotType}
							label={itemName ? shortLabel(itemName) : SLOT_LABELS[slotType]}
							title={itemName ?? slotType}
							filled={!!itemName}
							dragActive={!!dragging}
							dragValid={false}
						/>
					);
				})}
			</div>

			{/* Slot de posse (artefato carregado) */}
			<div style={{ marginBottom: 8 }}>
				<Slot
					amber
					label={posseArt ? shortLabel(posseArt.cardName) : ""}
					title={posseArt ? posseArt.cardName : "sem artefato em posse"}
					filled={!!posseArt}
				/>
			</div>

			{/* Carta placeholder */}
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
					color: UI.textTertiary,
					fontSize: 11,
				}}
			>
				🧙
			</div>

			{/* Status do herói */}
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
				<div>
					❤ {hero.currentLife}/{hero.maxLife}
				</div>
				<div>⚔ {hero.damage} dmg</div>
			</div>

			{/* Mochila 4×2 */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(4, 36px)",
					gap: 4,
					marginBottom: 6,
					borderRadius: 4,
					padding: 2,
					border: canMochila
						? `1px dashed ${hoverZone === mochilaZone ? "#0066CC" : "#3B82F6"}`
						: "1px solid transparent",
					background:
						canMochila && hoverZone === mochilaZone ? "#DBEAFE" : "transparent",
					transition: "background 0.1s, border-color 0.1s",
				}}
				{...dropHandlers(mochilaZone, !!canMochila)}
			>
				{Array.from({ length: MAX_BACKPACK }, (_, i) => {
					const itemName = hero.backpack[i];
					return (
						<Slot
							key={i}
							label={itemName ? shortLabel(itemName) : ""}
							title={itemName}
							filled={!!itemName}
							dragActive={!!dragging}
							dragValid={false}
						/>
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

	// Drag state
	const [dragging, setDragging] = useState<DragItem | null>(null);
	const [hoverZone, setHoverZone] = useState<string | null>(null);

	// Footer
	const [confirmDiscard, setConfirmDiscard] = useState(false);

	// Scroll horizontal com mouse
	const scrollRef = useRef<HTMLDivElement>(null);
	const scrollState = useRef({ isDown: false, startX: 0, scrollLeft: 0 });

	// Ao montar: se não há rewards pendentes, chamar GRANT_REWARDS
	// biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
	useEffect(() => {
		if (state.pendingRewards.length === 0) {
			dispatch({ type: "GRANT_REWARDS" });
		}
	}, []);

	// Resetar confirmação sempre que a mesa mudar
	const totalMesa = mesaItens.length + mesaArtefatos.length;
	useEffect(() => {
		setConfirmDiscard(false);
	}, [totalMesa]);

	// ── Drag handlers ────────────────────────────────────────────────────────

	function isValidZone(zone: string): boolean {
		if (!dragging) return false;

		if (
			dragging.kind === "artefato" &&
			(zone === "grupo_vaga_0" || zone === "grupo_vaga_1")
		) {
			const vagaIndex = zone === "grupo_vaga_0" ? 0 : 1;
			// Só a próxima vaga disponível aceita
			return vagaIndex === grupoArtefatos.length;
		}

		if (dragging.kind === "item") {
			if (zone.startsWith("hero_equip_")) {
				const card = getCardByName(dragging.name);
				return card?.type === "item" && card.itemClass !== "consumable";
			}
			if (zone.startsWith("hero_mochila_")) {
				const heroId = zone.replace("hero_mochila_", "");
				const hero = heroes.find((h) => h.id === heroId);
				return (hero?.backpack.length ?? MAX_BACKPACK) < MAX_BACKPACK;
			}
		}

		return false;
	}

	function handleZoneDrop(zone: string) {
		if (!dragging || !isValidZone(zone)) return;

		if (zone.startsWith("hero_equip_") && dragging.kind === "item") {
			const heroId = zone.replace("hero_equip_", "");
			dispatch({
				type: "INV_ASSIGN_ITEM",
				payload: { itemName: dragging.name, heroId, destination: "equip" },
			});
		} else if (zone.startsWith("hero_mochila_") && dragging.kind === "item") {
			const heroId = zone.replace("hero_mochila_", "");
			dispatch({
				type: "INV_ASSIGN_ITEM",
				payload: { itemName: dragging.name, heroId, destination: "backpack" },
			});
		} else if (
			(zone === "grupo_vaga_0" || zone === "grupo_vaga_1") &&
			dragging.kind === "artefato"
		) {
			const vagaIndex = zone === "grupo_vaga_0" ? 0 : (1 as 0 | 1);
			dispatch({
				type: "INV_ASSIGN_ARTIFACT",
				payload: {
					artifactName: dragging.name,
					vagaIndex,
					heroId: null,
				},
			});
		}

		setDragging(null);
		setHoverZone(null);
	}

	// ── Scroll mãozinha ──────────────────────────────────────────────────────

	function onScrollMouseDown(e: React.MouseEvent<HTMLDivElement>) {
		if ((e.target as HTMLElement).closest("[data-item]")) return;
		const el = scrollRef.current;
		if (!el) return;
		scrollState.current = {
			isDown: true,
			startX: e.pageX - el.offsetLeft,
			scrollLeft: el.scrollLeft,
		};
	}

	function onScrollMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const s = scrollState.current;
		if (!s.isDown || !scrollRef.current) return;
		e.preventDefault();
		const x = e.pageX - scrollRef.current.offsetLeft;
		scrollRef.current.scrollLeft = s.scrollLeft - (x - s.startX) * 1.5;
	}

	function onScrollMouseUp() {
		scrollState.current.isDown = false;
	}

	// ── Ação de saída ────────────────────────────────────────────────────────

	function handleSair() {
		dispatch({ type: "INV_DISCARD_MESA" });
	}

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: UI.pageBg,
				zIndex: 100,
				overflowY: "auto",
			}}
		>
			<div style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
				{/* Barra de título */}
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
						{state.status}
					</span>
				</div>

				{/* ── MESA ─────────────────────────────────────────────────────── */}
				<p
					style={{
						fontSize: 12,
						color: UI.textSecondary,
						margin: "0 0 8px 0",
					}}
				>
					Mesa · o que ficar aqui será descartado
				</p>

				<div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
					{/* Mesa — itens */}
					<div
						style={{
							flex: 1,
							border: `1px dashed ${UI.border}`,
							borderRadius: 8,
							padding: 10,
						}}
					>
						<p
							style={{
								fontSize: 11,
								color: UI.textSecondary,
								margin: "0 0 6px 0",
							}}
						>
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
							{mesaItens.map((r) => (
								<Slot
									key={r.cardName}
									label={shortLabel(r.cardName)}
									title={r.cardName}
									filled
									draggable
									dragActive={!!dragging}
									dragValid={false}
									onDragStart={(e) => {
										e.dataTransfer.setData("text/plain", r.cardName);
										setDragging({ name: r.cardName, kind: "item" });
									}}
									onDragEnd={() => {
										setDragging(null);
										setHoverZone(null);
									}}
								/>
							))}
							{mesaItens.length === 0 && (
								<span
									style={{
										fontSize: 11,
										color: UI.textTertiary,
										alignSelf: "center",
									}}
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
						<p
							style={{
								fontSize: 11,
								color: AMBER.ink,
								margin: "0 0 6px 0",
							}}
						>
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
							{mesaArtefatos.map((r) => (
								<Slot
									key={r.cardName}
									amber
									label={shortLabel(r.cardName)}
									title={r.cardName}
									filled
									draggable
									dragActive={!!dragging}
									dragValid={false}
									onDragStart={(e) => {
										e.dataTransfer.setData("text/plain", r.cardName);
										setDragging({ name: r.cardName, kind: "artefato" });
									}}
									onDragEnd={() => {
										setDragging(null);
										setHoverZone(null);
									}}
								/>
							))}
							{mesaArtefatos.length === 0 && (
								<span
									style={{
										fontSize: 11,
										color: AMBER.ink,
										opacity: 0.6,
										alignSelf: "center",
									}}
								>
									vazio
								</span>
							)}
						</div>
					</div>
				</div>

				<hr
					style={{
						border: "none",
						borderTop: `1px solid ${UI.border}`,
						margin: "0 0 16px 0",
					}}
				/>

				{/* ── ARTEFATOS DO GRUPO ───────────────────────────────────────── */}
				<p
					style={{
						fontSize: 12,
						color: UI.textSecondary,
						margin: "0 0 8px 0",
					}}
				>
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
									onDragOver={(e) => {
										if (valid) {
											e.preventDefault();
											setHoverZone(zone);
										}
									}}
									onDragLeave={() => setHoverZone(null)}
									onDrop={(e) => {
										e.preventDefault();
										handleZoneDrop(zone);
									}}
									style={{
										background: isHov ? "#FFF3CD" : AMBER.bg,
										border: `1px ${valid ? "dashed" : "dashed"} ${valid ? (isHov ? "#996600" : AMBER.border) : AMBER.border}`,
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
										fontSize: 20,
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
									{requiresBearer && (
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
												onChange={(e) => {
													dispatch({
														type: "INV_SET_BEARER",
														payload: {
															vagaIndex,
															heroId: e.target.value || null,
														},
													});
												}}
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
									)}
									{!requiresBearer && (
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
							</div>
						);
					})}
				</div>

				<hr
					style={{
						border: "none",
						borderTop: `1px solid ${UI.border}`,
						margin: "0 0 16px 0",
					}}
				/>

				{/* ── HERÓIS ──────────────────────────────────────────────────── */}
				<p
					style={{
						fontSize: 12,
						color: UI.textSecondary,
						margin: "0 0 8px 0",
					}}
				>
					Heróis · arraste lateral para ver todos ({heroes.length})
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
						cursor: scrollState.current.isDown ? "grabbing" : "grab",
					}}
				>
					<div
						style={{
							display: "flex",
							gap: 12,
							width: "max-content",
						}}
					>
						{heroes.map((hero) => (
							<HeroColumn
								key={hero.id}
								hero={hero}
								dragging={dragging}
								hoverZone={hoverZone}
								groupArtifacts={grupoArtefatos}
								onDrop={handleZoneDrop}
								onSetHover={setHoverZone}
							/>
						))}
						{heroes.length === 0 && (
							<p style={{ fontSize: 13, color: UI.textTertiary }}>
								Nenhum herói ativo.
							</p>
						)}
					</div>
				</div>

				{/* ── RODAPÉ ──────────────────────────────────────────────────── */}
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
								totalMesa > 0 && !confirmDiscard
									? UI.subpanelBg
									: UI.panelBg,
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
	);
}
