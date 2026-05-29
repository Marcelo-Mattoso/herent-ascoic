// Painel inferior do herói em foco (Patch 3).
// Mostra stats, habilidade, poder, mochila e botões de ação.
// Também cobre ações de não-combate (revelar sala, iniciar combate, etc.).

import type { CombatState } from "@/core/state/combatState";
import type { GameState } from "@/core/state/gameState";
import type { HeroState } from "@/core/state/heroState";
import { getCardByName } from "@/core/data/cards";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";
import { ActionButton } from "./ActionButton";
import { ColorBar } from "./ColorBar";
import { HpBar } from "./HpBar";
import { ItemChip } from "./ItemChip";
import type { ItemSlotType } from "@/core/state/heroState";

interface HeroFocusPanelProps {
	hero: HeroState | null;
	state: GameState;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onPower: () => void;
	onFlee: () => void;
	onUseSkill?: (skillId: string, sourceId: string) => void;
	onCardDetail: (name: string, type: CardType) => void;
	onItemDetail: (itemName: string, heroId: string) => void;
}

export function HeroFocusPanel({
	hero,
	state,
	onAttack,
	onPass,
	onCancelSelection,
	onPower,
	onFlee,
	onUseSkill,
	onCardDetail,
	onItemDetail,
}: HeroFocusPanelProps) {
	const { status } = state;
	const combat: CombatState | null = state.combat;
	const phase = combat?.phase ?? null;

	const heroCard = hero ? getCardByName(hero.cardName) : null;
	const powerUsed = hero ? (combat?.powersUsedThisRoom[hero.id] ?? false) : false;

	const isInCombat = status === "HERO_ACTION" || status === "BOSS_COMBAT";
	const isSelectingHero = isInCombat && phase === "selecting_hero";
	const isSelectingTarget = isInCombat && phase === "selecting_target";
	const isFocusedHeroSelected = !!hero && combat?.selectedHeroId === hero.id;

	const availableEnemies = state.activeEnemies.filter(
		(e) => e.status === "active",
	);

	return (
		<div
			style={{
				background: UI.panelBg,
				border: `1px solid ${UI.border}`,
				borderRadius: 12,
				padding: "10px 12px",
			}}
		>
			{hero ? (
				<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
					{/* Topo: mini-card + stats */}
					<div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
						{/* Mini-card do herói */}
						<div
							style={{
								width: 56,
								flexShrink: 0,
								background: UI.subpanelBg,
								border: `1px solid ${UI.border}`,
								borderRadius: 8,
								padding: "4px 4px 3px",
							}}
						>
							<div
								style={{
									height: 44,
									background: UI.border,
									borderRadius: 4,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									marginBottom: 3,
								}}
							>
								<span style={{ fontSize: 22 }}>🧙</span>
							</div>
							<p
								style={{
									color: UI.textPrimary,
									fontSize: 9,
									fontWeight: 500,
									textAlign: "center",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
								}}
							>
								{hero.cardName.split(",")[0]?.split(" ")[0]}
							</p>
						</div>

						{/* Stats à direita */}
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "baseline",
									marginBottom: 2,
								}}
							>
								<p style={{ color: UI.textTertiary, fontSize: 10 }}>
									Herói em foco ·{" "}
									<span style={{ color: UI.info.text }}>
										clique em outro para trocar
									</span>
								</p>
							</div>

							{/* Linha de stats + Ímpeto */}
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr auto",
									gap: 8,
									alignItems: "center",
									marginBottom: 4,
								}}
							>
								<p style={{ color: UI.textPrimary, fontSize: 11 }}>
									Vida{" "}
									<strong>
										{hero.currentLife}/{hero.maxLife}
									</strong>{" "}
									· Acerto{" "}
									<strong>+{hero.hitBonus}</strong> · Dano{" "}
									<strong>D{hero.damage}</strong> · Dados{" "}
									<strong>{hero.dice}d6</strong>
								</p>
								<div style={{ minWidth: 80 }}>
									<ColorBar current={hero.impeto} label="Ímpeto" />
								</div>
							</div>

							{/* Barra de vida grande */}
							<HpBar current={hero.currentLife} max={hero.maxLife} height={8} />
						</div>
					</div>

					{/* Habilidade + Poder */}
					{heroCard?.type === "hero" && (() => {
						const heroSkills = cardSkills(heroCard.id);
						const habilidade = heroSkills.find(({ def }) => def.category === "habilidade");
						const poder = heroSkills.find(({ def }) => def.category === "poder_heroi");
						return (
							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
								{/* Habilidade */}
								{habilidade && (
									<div
										style={{
											background: UI.subpanelBg,
											borderRadius: 6,
											padding: "6px 8px",
										}}
									>
										<p
											style={{
												fontSize: 10,
												fontWeight: 500,
												color: UI.textSecondary,
												marginBottom: 2,
											}}
										>
											📖 Habilidade ·{" "}
											<span
												style={{
													background: "#EAF3DE",
													color: "#3B6D11",
													borderRadius: 3,
													padding: "0 4px",
													fontSize: 9,
												}}
											>
												ativa
											</span>
										</p>
										<p style={{ color: UI.textPrimary, fontSize: 10, lineHeight: 1.4 }}>
											{renderSkillLabel(habilidade.ref)}
										</p>
									</div>
								)}

								{/* Poder */}
								{poder && (
									<div
										style={{
											background: UI.subpanelBg,
											borderRadius: 6,
											padding: "6px 8px",
										}}
									>
										<p
											style={{
												fontSize: 10,
												fontWeight: 500,
												color: UI.textSecondary,
												marginBottom: 2,
											}}
										>
											⚡ Poder ·{" "}
											<span
												style={{
													background: powerUsed ? UI.subpanelBg : UI.panelBg,
													color: powerUsed ? UI.textTertiary : UI.textSecondary,
													border: `1px solid ${UI.border}`,
													borderRadius: 3,
													padding: "0 4px",
													fontSize: 9,
												}}
											>
												{powerUsed ? "usado" : "disponível"}
											</span>
										</p>
										<p style={{ color: UI.textPrimary, fontSize: 10, lineHeight: 1.4 }}>
											{renderSkillLabel(poder.ref)}
										</p>
									</div>
								)}
							</div>
						);
					})()}

					{/* Mochila */}
					<div>
						<p
							style={{
								fontSize: 10,
								color: UI.textSecondary,
								fontWeight: 500,
								marginBottom: 4,
							}}
						>
							🎒 Mochila do {hero.cardName.split(" ")[0]} ·{" "}
							{hero.backpack.length === 0
								? "vazia"
								: `${hero.backpack.length} ${hero.backpack.length === 1 ? "item" : "itens"}`}
						</p>
						{hero.backpack.length > 0 && (
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
								{hero.backpack.map((item) => (
									<ItemChip
										key={item}
										item={item}
										onClick={() => onItemDetail(item, hero.id)}
									/>
								))}
							</div>
						)}
					</div>

					{/* Equipamentos ativos */}
					{Object.keys(hero.activeItems).length > 0 && (
						<div>
							<p
								style={{
									fontSize: 10,
									color: UI.textSecondary,
									fontWeight: 500,
									marginBottom: 4,
								}}
							>
								Equipamentos
							</p>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
								{(
									["weapon", "armor", "utility", "special"] as ItemSlotType[]
								).map((slot) => {
									const item = hero.activeItems[slot];
									if (!item) return null;
									const slotCard = getCardByName(item);
									const isConsumable = slotCard?.type === "item" && slotCard.itemClass === "consumable";
									return (
										<ItemChip
											key={slot}
											item={item}
											slot={slot}
											onClick={() =>
												isConsumable
													? onItemDetail(item, hero.id)
													: onCardDetail(item, "item")
											}
										/>
									);
								})}
							</div>
						</div>
					)}

					{/* Botões de ação individuais */}
					<ActionSection
						state={state}
						hero={hero}
						isInCombat={isInCombat}
						isSelectingHero={isSelectingHero}
						isSelectingTarget={isSelectingTarget}
						isFocusedHeroSelected={isFocusedHeroSelected}
						availableEnemies={availableEnemies.length}
						powerUsed={powerUsed}
						onAttack={onAttack}
						onPass={onPass}
						onCancelSelection={onCancelSelection}
						onPower={onPower}
						onFlee={onFlee}
						onUseSkill={onUseSkill}
					/>
				</div>
			) : (
				<div
					style={{
						height: 60,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<span style={{ color: UI.textTertiary, fontSize: 12 }}>
						Nenhum herói em foco
					</span>
				</div>
			)}
		</div>
	);
}

// ─── Botões de ação (combate e não-combate) ────────────────────────────────────

function ActionSection({
	state,
	hero,
	isInCombat,
	isSelectingHero,
	isSelectingTarget,
	isFocusedHeroSelected,
	availableEnemies,
	powerUsed,
	onAttack,
	onPass,
	onCancelSelection,
	onPower,
	onFlee,
	onUseSkill,
}: {
	state: GameState;
	hero: HeroState;
	isInCombat: boolean;
	isSelectingHero: boolean;
	isSelectingTarget: boolean;
	isFocusedHeroSelected: boolean;
	availableEnemies: number;
	powerUsed: boolean;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onPower: () => void;
	onFlee: () => void;
	onUseSkill?: (skillId: string, sourceId: string) => void;
}) {
	// Verificar se a skill do herói tem trigger on_use e pode ser ativada agora
	const heroCardForSkill = getCardByName(hero.cardName);
	const habilidadeEntry = heroCardForSkill
		? cardSkills(heroCardForSkill.id).find(({ def }) => def.category === "habilidade")
		: null;
	const skillDef = habilidadeEntry?.def ?? null;
	const skillIsActivatable =
		skillDef !== null &&
		(skillDef.trigger === "on_use" || skillDef.trigger.startsWith("once_per_"));
	const skillAlreadyUsed =
		skillDef !== null && !!state.combat?.oncePer?.room?.[`${skillDef.id}::${hero.id}`];

	// Só mostra botões individuais durante combate
	if (!isInCombat) return null;

	// Combate: 4 botões canônicos do Patch 3
	if (isInCombat) {
		const canAttack =
			isSelectingTarget && isFocusedHeroSelected && availableEnemies > 0;
		const canPass = isSelectingTarget && isFocusedHeroSelected;
		const canCancel = isSelectingTarget && isFocusedHeroSelected;
		const canPower = isSelectingTarget && isFocusedHeroSelected && !powerUsed;
		const canFlee = isInCombat && hero.currentLife === 1 && !state.flags?.fleeBlocked;
		const fleeAlreadyDeclared = !!(state.combat?.fleeAttemptByHero?.[hero.id]);

		// hint durante selecting_hero
		if (isSelectingHero) {
			const heroesActed = state.combat?.heroesActed ?? [];
			const hasActed = heroesActed.includes(hero.id);
			const hint = hasActed
				? "Este herói já agiu nesta rodada."
				: "Arraste o herói até um inimigo para atacar.";
			return (
				<div>
					<p style={{ color: UI.textTertiary, fontSize: 11, marginBottom: 6 }}>
						{hint}
					</p>
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
						<ActionButton
							label="Atacar (arraste)"
							icon="⚔"
							variant="primary"
							disabled
							onClick={onAttack}
						/>
						<ActionButton
							label="Usar item"
							icon="🎒"
							variant="secondary"
							disabled
							onClick={() => {}}
						/>
						<ActionButton
							label="Usar poder"
							icon="⚡"
							variant="secondary"
							disabled
							onClick={onPower}
						/>
						<ActionButton
							label="Passar rodada"
							icon="⏭"
							variant="secondary"
							disabled
							onClick={onPass}
						/>
						<ActionButton
							label={fleeAlreadyDeclared ? "Fuga declarada" : "Fugir"}
							icon="🏃"
							variant="danger"
							disabled={!canFlee || fleeAlreadyDeclared}
							onClick={onFlee}
						/>
					</div>
				</div>
			);
		}

		return (
			<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
				<ActionButton
					label="Atacar (arraste)"
					icon="⚔"
					variant="primary"
					disabled={!canAttack}
					onClick={onAttack}
				/>
				<ActionButton
					label="Usar item"
					icon="🎒"
					variant="secondary"
					disabled
					onClick={() => {}}
				/>
				{skillIsActivatable && skillDef && (
					<ActionButton
						label="Usar habilidade"
						icon="✨"
						variant="secondary"
						disabled={!isFocusedHeroSelected || skillAlreadyUsed}
						onClick={() => onUseSkill?.(skillDef.id, hero.id)}
					/>
				)}
				<ActionButton
					label="Usar poder"
					icon="⚡"
					variant="secondary"
					disabled={!canPower}
					onClick={onPower}
				/>
				<ActionButton
					label="Passar rodada"
					icon="⏭"
					variant="secondary"
					disabled={!canPass}
					onClick={onPass}
				/>
				<ActionButton
					label={fleeAlreadyDeclared ? "Fuga declarada" : "Fugir"}
					icon="🏃"
					variant="danger"
					disabled={!canFlee || fleeAlreadyDeclared}
					onClick={onFlee}
				/>
				{canCancel && (
					<ActionButton
						label="Cancelar"
						icon="✕"
						variant="danger"
						onClick={onCancelSelection}
					/>
				)}
			</div>
		);
	}

	return null;
}
