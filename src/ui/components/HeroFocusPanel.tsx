import { translate } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Painel inferior do herói em foco (Patch 3).
// Mostra stats, habilidade, poder, mochila e botões de ação.
// Também cobre ações de não-combate (revelar sala, iniciar combate, etc.).

import { displayCardClass as getCardClass, displayCardName as getCardName } from "@/i18n/catalogs";
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
	heroImageUrl?: string;
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
	heroImageUrl,
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
	const [artHeroId, setArtHeroId] = useState<string | null>(null);
	const { status } = view;
	const phase = view.combat?.phase ?? null;

	const heroCard = hero ? getCardById(hero.cardId) : null;
	const powerUsed = heroActions.power?.alreadyUsed ?? false;

	const isInCombat = status === "HERO_ACTION" || status === "BOSS_COMBAT";
	const isSelectingHero = isInCombat && phase === "selecting_hero";
	const isFocusedHeroSelected =
		!!hero && view.combat?.selectedHeroId === hero.id;

	return (
		<div className="hero-focus-panel">
			{hero ? (
				<div className="hero-focus-panel__content">
					{/* Retrato da carta e identidade */}
					<div className="hero-focus-overview">
						{heroImageUrl ? (
							<button
								type="button"
								className="hero-focus-portrait"
								onClick={() => setArtHeroId(hero.id)}
								aria-label={`${translate("game:components.heroFocusPanel.viewArt")}: ${getCardName(hero.cardId)}`}
							>
								<img src={heroImageUrl} alt="" />
								<span>{translate("game:components.heroFocusPanel.viewArt")}</span>
							</button>
						) : (
							<div className="hero-focus-portrait hero-focus-portrait--empty" aria-hidden="true">
								<span>{getCardName(hero.cardId).charAt(0)}</span>
							</div>
						)}

						<div className="hero-focus-overview__body">
							<p className="hero-focus-overview__eyebrow">{translate("game:components.heroFocusPanel.focusedHero")}</p>
							<h2 className="hero-focus-overview__name">{getCardName(hero.cardId)}</h2>
							<p className="hero-focus-overview__class">{getCardClass(hero.cardId)}</p>
							<div className="hero-focus-stats">
								<div><span>{translate("game:components.heroFocusPanel.text003")}</span><strong>{hero.currentLife}/{hero.maxLife}</strong></div>
								<div><span>{translate("game:components.heroFocusPanel.hit")}</span><strong>{hero.hitBonus >= 0 ? "+" : ""}{hero.hitBonus}</strong></div>
								<div><span>{translate("game:components.heroFocusPanel.damage")}</span><strong>{hero.damage}</strong></div>
								<div><span>{translate("game:components.heroFocusPanel.dice")}</span><strong>{hero.dice}d6</strong></div>
							</div>
							<div className="hero-focus-overview__meters">
								<div className="hero-focus-overview__life"><HpBar current={hero.currentLife} max={hero.maxLife} height={8} /></div>
							<div className="hero-focus-overview__impeto"><ColorBar current={hero.impeto} label={translate("game:components.heroFocusPanel.impeto")} /></div>
							</div>
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
								<div className="hero-focus-feature-grid">
									{/* Habilidade */}
									{habilidade && (
										<div
											className="hero-focus-feature"
											data-tutorial-anchor="hero.skill-card"
										>
											<p
												style={{
													fontSize: 11,
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
													fontSize: 11,
													lineHeight: 1.4,
												}}
											>
												{renderSkillLabel(habilidade.ref)}
											</p>
										</div>
									)}

									{/* Poder */}
									{poder && (
										<div
											className="hero-focus-feature"
											data-tutorial-anchor="hero.power-card"
										>
											<p
												style={{
													fontSize: 11,
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
													fontSize: 11,
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
					<div className="hero-focus-inventory">
						<p className="hero-focus-section-title">
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
						<div className="hero-focus-inventory">
							<p className="hero-focus-section-title">
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
			{hero && artHeroId === hero.id && heroImageUrl && (
				<HeroArtViewer
					imageUrl={heroImageUrl}
					name={getCardName(hero.cardId)}
					onClose={() => setArtHeroId(null)}
				/>
			)}
		</div>
	);
}

function HeroArtViewer({ imageUrl, name, onClose }: {
	imageUrl: string;
	name: string;
	onClose: () => void;
}) {
	const closeButton = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		closeButton.current?.focus();
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);
	return createPortal(
		<div className="hero-art-viewer" role="dialog" aria-modal="true" aria-label={name}>
			<button className="hero-art-viewer__backdrop" type="button" onClick={onClose} aria-label={translate("game:components.heroFocusPanel.closeArt")} />
			<div className="hero-art-viewer__content">
				<div className="hero-art-viewer__header">
					<strong>{name}</strong>
					<button ref={closeButton} type="button" onClick={onClose} aria-label={translate("game:components.heroFocusPanel.closeArt")}>×</button>
				</div>
				<img src={imageUrl} alt={name} />
			</div>
		</div>, document.body,
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
