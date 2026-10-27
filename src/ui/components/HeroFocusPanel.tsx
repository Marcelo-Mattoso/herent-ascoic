import { translate } from "@/i18n";
// Painel inferior do herói em foco (Patch 3).
// Mostra stats, habilidade, poder, mochila e botões de ação.
// Também cobre ações de não-combate (revelar sala, iniciar combate, etc.).

import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardById } from "@/core/data/cards";
import type { PlayerView } from "@/core/projection/playerView";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { HeroState, ItemSlotType } from "@/core/state/heroState";
import type { CardType } from "@/ui/components/Card";
import type { HeroCombatActions } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";
import { ActionButton } from "./ActionButton";
import { ColorBar } from "./ColorBar";
import { HpBar } from "./HpBar";
import { ItemChip } from "./ItemChip";

interface HeroFocusPanelProps {
	hero: HeroState | null;
	view: PlayerView;
	heroActions: HeroCombatActions;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onPower: () => void;
	onFlee: () => void;
	onUseSkill?: (skillId: string, sourceId: string) => void;
	onUseItem?: () => void;
	onCardDetail: (name: string, type: CardType) => void;
	onItemDetail: (itemName: string, heroId: string) => void;
}

export function HeroFocusPanel({
	hero,
	view,
	heroActions,
	onAttack,
	onPass,
	onCancelSelection,
	onPower,
	onFlee,
	onUseSkill,
	onUseItem,
	onCardDetail,
	onItemDetail,
}: HeroFocusPanelProps) {
	const { status } = view;
	const phase = view.combat?.phase ?? null;

	const heroCard = hero ? getCardById(hero.cardId) : null;
	const powerUsed = heroActions.power?.alreadyUsed ?? false;

	const isInCombat = status === "HERO_ACTION" || status === "BOSS_COMBAT";
	const isSelectingHero = isInCombat && phase === "selecting_hero";
	const isFocusedHeroSelected =
		!!hero && view.combat?.selectedHeroId === hero.id;

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
								{getCardName(hero.cardId).split(",")[0]?.split(" ")[0]}
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
									{translate("game:components.heroFocusPanel.text001")}{" "}
									<span style={{ color: UI.info.text }}>
										{translate("game:components.heroFocusPanel.text002")}{" "}</span>
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
									{translate("game:components.heroFocusPanel.text003")}{" "}
									<strong>
										{hero.currentLife}/{hero.maxLife}
									</strong>{" "}
									{translate("game:components.heroFocusPanel.text004")}{" "}<strong>+{hero.hitBonus}</strong> {translate("game:components.heroFocusPanel.text005")}{" "}
									<strong>D{hero.damage}</strong> {translate("game:components.heroFocusPanel.text006")}{" "}
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
					{heroCard?.type === "hero" &&
						(() => {
							const heroSkills = cardSkills(heroCard.id);
							const habilidade = heroSkills.find(
								({ def }) => def.category === "hero_skill",
							);
							const poder = heroSkills.find(
								({ def }) => def.category === "hero_power",
							);
							const skillStatus = view.abilityActionsByHero[hero.id]?.find(
								(action) => action.abilityId === habilidade?.def.id,
							)?.status;
							const powerStatus = view.abilityActionsByHero[hero.id]?.find(
								(action) => action.abilityId === poder?.def.id,
							)?.status;
							return (
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: 6,
									}}
								>
									{/* Habilidade */}
									{habilidade && (
										<div
											data-tutorial-anchor="hero.skill-card"
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
												{translate("game:components.heroFocusPanel.text007")}{" "}
												<span
													style={{
														background: "#EAF3DE",
														color: "#3B6D11",
														borderRadius: 3,
														padding: "0 4px",
														fontSize: 9,
													}}
												>
													{skillStatus === "prepared" ? "preparada" :
														skillStatus === "active" ? "ativa" :
														skillStatus === "available" ? translate("game:components.heroFocusPanel.dynamic001") :
														skillStatus === "exhausted" ? "usada" : translate("game:components.heroFocusPanel.dynamic002")}
												</span>
											</p>
											<p
												style={{
													color: UI.textPrimary,
													fontSize: 10,
													lineHeight: 1.4,
												}}
											>
												{renderSkillLabel(habilidade.ref)}
											</p>
											<button type="button" onClick={() => onCardDetail(hero.cardId, "hero")}>{translate("game:components.heroFocusPanel.text008")}</button>
										</div>
									)}

									{/* Poder */}
									{poder && (
										<div
											data-tutorial-anchor="hero.power-card"
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
												{translate("game:components.heroFocusPanel.text009")}{" "}
												<span
													style={{
														background: powerUsed ? UI.subpanelBg : UI.panelBg,
														color: powerUsed
															? UI.textTertiary
															: UI.textSecondary,
														border: `1px solid ${UI.border}`,
														borderRadius: 3,
														padding: "0 4px",
														fontSize: 9,
													}}
												>
													{powerStatus === "prepared" ? "preparado" :
														powerStatus === "active" ? "ativo" :
														powerStatus === "available" ? translate("game:components.heroFocusPanel.dynamic003") :
														powerStatus === "exhausted" || powerUsed ? "usado" : translate("game:components.heroFocusPanel.dynamic004")}
												</span>
											</p>
											<p
												style={{
													color: UI.textPrimary,
													fontSize: 10,
													lineHeight: 1.4,
												}}
											>
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
							{translate("game:components.heroFocusPanel.text010")}{" "}{getCardName(hero.cardId).split(" ")[0]} ·{" "}
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
								{translate("game:components.heroFocusPanel.text011")}{" "}</p>
							<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
								{(
									["clothing1", "clothing2", "hand1", "hand2", "amulet"] as ItemSlotType[]
								).map((slot) => {
									const item = hero.activeItems[slot];
									if (!item) return null;
									const slotCard = getCardById(item);
									const isConsumable =
										slotCard?.type === "item" &&
										slotCard.itemClass === "consumable";
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
						heroActions={heroActions}
						hero={hero}
						isInCombat={isInCombat}
						isSelectingHero={isSelectingHero}
						isFocusedHeroSelected={isFocusedHeroSelected}
						onAttack={onAttack}
						onPass={onPass}
						onCancelSelection={onCancelSelection}
						onPower={onPower}
						onFlee={onFlee}
						onUseSkill={onUseSkill}
						onUseItem={onUseItem}
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
						{translate("game:components.heroFocusPanel.text012")}{" "}</span>
				</div>
			)}
		</div>
	);
}

// ─── Botões de ação (combate e não-combate) ────────────────────────────────────

function ActionSection({
	heroActions,
	hero,
	isInCombat,
	isSelectingHero,
	isFocusedHeroSelected,
	onAttack,
	onPass,
	onCancelSelection,
	onPower,
	onFlee,
	onUseSkill,
	onUseItem,
}: {
	heroActions: HeroCombatActions;
	hero: HeroState;
	isInCombat: boolean;
	isSelectingHero: boolean;
	isFocusedHeroSelected: boolean;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onPower: () => void;
	onFlee: () => void;
	onUseSkill?: (skillId: string, sourceId: string) => void;
	onUseItem?: () => void;
}) {
	const {
		canAttack,
		canPass,
		canCancel,
		canUsePower,
		canUseSkill,
		canFlee,
		fleeAlreadyDeclared,
		skill,
		power,
	} = heroActions;

	if (!isInCombat) {
		if (
			!skill &&
			!power &&
			!heroActions.usableItems?.length
		)
			return null;
		return (
			<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
				<ActionButton
					label="Usar item"
					icon="🎒"
					variant="secondary"
					disabled={!heroActions.usableItems?.length}
					onClick={onUseItem}
				/>
				{skill && (
					<ActionButton
						tutorialAnchor="hero.skill-action"
						label={skill.prepared ? "Cancelar preparação" : skill.preparable ? "Preparar habilidade" : "Habilidade"}
						title={skill.reason}
						icon="✨"
						variant={skill.prepared ? "primary" : "secondary"}
						disabled={!canUseSkill}
						onClick={() => onUseSkill?.(skill.skillId, hero.id)}
					/>
				)}
				{power && (
					<ActionButton
						tutorialAnchor="hero.power-action"
						label={power.prepared ? "Cancelar preparação" : power.preparable ? "Preparar poder" : "Poder"}
						title={power.reason}
						icon="⚡"
						variant={power.prepared ? "primary" : "secondary"}
						disabled={!canUsePower}
						onClick={onPower}
					/>
				)}
			</div>
		);
	}

	if (isSelectingHero) {
		const heroesActedHint = isFocusedHeroSelected
			? translate("game:components.heroFocusPanel.actedHint")
			: translate("game:components.heroFocusPanel.attackHint");
		return (
			<div>
				<p style={{ color: UI.textTertiary, fontSize: 11, marginBottom: 6 }}>
					{heroesActedHint}
				</p>
				<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
					<ActionButton
					label="Atacar (arraste ou clique)"
						icon="⚔"
						variant="primary"
						disabled
						onClick={onAttack}
					/>
					<ActionButton
						label="Usar item"
						icon="🎒"
						variant="secondary"
						disabled={!heroActions.usableItems?.length}
						onClick={onUseItem}
					/>
					{skill && (
						<ActionButton
							tutorialAnchor="hero.skill-action"
							label={skill.prepared ? "Cancelar preparação" : skill.preparable ? "Preparar habilidade" : "Habilidade"}
							title={skill.reason}
							icon="✨"
							variant={skill.prepared ? "primary" : "secondary"}
							disabled={!canUseSkill}
							onClick={() => onUseSkill?.(skill.skillId, hero.id)}
						/>
					)}
					{power && (
					<ActionButton
							tutorialAnchor="hero.power-action"
							label={power.prepared ? "Cancelar preparação" : power.preparable ? "Preparar poder" : "Poder"}
							title={power.reason}
						icon="⚡"
							variant={power.prepared ? "primary" : "secondary"}
						disabled={!canUsePower}
						onClick={onPower}
					/>
					)}
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
				label="Atacar (arraste ou clique)"
				icon="⚔"
				variant="primary"
				disabled={!canAttack}
				onClick={onAttack}
			/>
			<ActionButton
				label="Usar item"
				icon="🎒"
				variant="secondary"
				disabled={!heroActions.usableItems?.length}
				onClick={onUseItem}
			/>
			{skill && (
				<ActionButton
				tutorialAnchor="hero.skill-action"
				label={skill.prepared ? "Cancelar preparação" : skill.preparable ? "Preparar habilidade" : "Habilidade"}
				title={skill.reason}
					icon="✨"
					variant={skill.prepared ? "primary" : "secondary"}
				disabled={!canUseSkill}
					onClick={() => onUseSkill?.(skill.skillId, hero.id)}
				/>
			)}
			{power && (
				<ActionButton
				tutorialAnchor="hero.power-action"
				label={power.prepared ? "Cancelar preparação" : power.preparable ? "Preparar poder" : "Poder"}
				title={power.reason}
					icon="⚡"
					variant={power.prepared ? "primary" : "secondary"}
					disabled={!canUsePower}
					onClick={onPower}
				/>
			)}
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
