import type { DragEvent } from "react";
import { getCardName } from "@/core/data/cardLocale";
import { getCardById } from "@/core/data/cards";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { HeroState } from "@/core/state/heroState";
import { getCardImageUrl, type CardImageUrls } from "@/ui/cardImages";
import type { CardType } from "@/ui/components/Card";
import { ColorBar } from "./ColorBar";
import { HeroCard } from "./HeroCard";
import { HpBar } from "./HpBar";

interface HeroTrayProps {
	hero: HeroState;
	isFocused: boolean;
	hasActed: boolean;
	isSelected: boolean;
	canAct: boolean;
	cardImageUrls?: CardImageUrls;
	onDragStart?: (heroId: string, event: DragEvent<HTMLButtonElement>) => void;
	onDragEnd?: () => void;
	onHeroClick: () => void;
	onCardDetail: (cardId: string, type: CardType) => void;
}

type TraySlotName = "clothing1" | "clothing2" | "amulet" | "hand1" | "hand2";

const SLOT_LABELS: Readonly<Record<TraySlotName, string>> = {
	clothing1: "Vestimenta 1",
	clothing2: "Vestimenta 2",
	amulet: "Amuleto",
	hand1: "Mão 1",
	hand2: "Mão 2",
};

function TrayItem({
	itemId,
	label,
	inBackpack = false,
	cardImageUrls,
	onCardDetail,
}: {
	itemId?: string;
	label: string;
	inBackpack?: boolean;
	cardImageUrls?: CardImageUrls;
	onCardDetail: (cardId: string, type: CardType) => void;
}) {
	const name = itemId ? getCardName(itemId) : "Vazio";
	return (
		<button
			type="button"
			className={`hero-tray__slot${itemId ? " hero-tray__slot--filled" : ""}${inBackpack ? " hero-tray__slot--backpack" : ""}`}
			onClick={() => itemId && onCardDetail(itemId, "item")}
			disabled={!itemId}
			title={itemId ? `${label}: ${name}` : `${label}: vazio`}
		>
			<span className="hero-tray__slot-label">{label}</span>
			{itemId ? (
				<span className="hero-tray__item-copy">
					{getCardImageUrl(cardImageUrls, itemId) ? (
						<img src={getCardImageUrl(cardImageUrls, itemId)} alt="" />
					) : null}
					<strong>{name}</strong>
					{inBackpack ? <small>Guardado</small> : null}
				</span>
			) : (
				<span className="hero-tray__empty">vazio</span>
			)}
		</button>
	);
}

function EquippedSlot({
	hero,
	slot,
	cardImageUrls,
	onCardDetail,
}: {
	hero: HeroState;
	slot: TraySlotName;
	cardImageUrls?: CardImageUrls;
	onCardDetail: (cardId: string, type: CardType) => void;
}) {
	const itemId = hero.activeItems[slot];
	const exhausted = itemId && hero.itemReadiness?.[itemId] === "exhausted";
	return (
		<div className={exhausted ? "hero-tray__exhausted" : undefined}>
			<TrayItem
				itemId={itemId}
				label={SLOT_LABELS[slot]}
				cardImageUrls={cardImageUrls}
				onCardDetail={onCardDetail}
			/>
			{exhausted ? (
				<span className="hero-tray__exhausted-label">Exaurido</span>
			) : null}
		</div>
	);
}

export function HeroTray({
	hero,
	isFocused,
	hasActed,
	isSelected,
	canAct,
	cardImageUrls,
	onDragStart,
	onDragEnd,
	onHeroClick,
	onCardDetail,
}: HeroTrayProps) {
	const heroCard = getCardById(hero.cardId);
	const heroSkills = heroCard?.type === "hero" ? cardSkills(hero.cardId) : [];
	const skills = heroSkills.filter(({ def }) => def.category === "hero_skill");
	const powers = heroSkills.filter(({ def }) => def.category === "hero_power");
	const isTwoHanded =
		hero.activeItems.hand1 && hero.activeItems.hand1 === hero.activeItems.hand2;
	const handItemId = hero.activeItems.hand1;
	const handExhausted =
		handItemId && hero.itemReadiness?.[handItemId] === "exhausted";

	return (
		<section
			className={`hero-tray${isFocused || isSelected ? " hero-tray--selected" : ""}`}
			aria-label={`Hero Tray: ${getCardName(hero.cardId)}`}
		>
			<div className="hero-tray__equipment hero-tray__equipment--left">
				<EquippedSlot
					hero={hero}
					slot="clothing1"
					cardImageUrls={cardImageUrls}
					onCardDetail={onCardDetail}
				/>
				<EquippedSlot
					hero={hero}
					slot="clothing2"
					cardImageUrls={cardImageUrls}
					onCardDetail={onCardDetail}
				/>
				<EquippedSlot
					hero={hero}
					slot="amulet"
					cardImageUrls={cardImageUrls}
					onCardDetail={onCardDetail}
				/>
			</div>

			<div className="hero-tray__hero">
				<HeroCard
					hero={hero}
					isFocused={isFocused}
					hasActed={hasActed}
					isSelected={isSelected}
					canAct={canAct}
					size="board"
					showEquipment={false}
					imageUrl={getCardImageUrl(cardImageUrls, hero.cardId)}
					onDragStart={onDragStart}
					onDragEnd={onDragEnd}
					onClick={onHeroClick}
				/>
				<div className="hero-tray__conditions">
					{hero.conditions.length > 0
						? hero.conditions.join(" · ")
						: "Sem condições"}
				</div>
			</div>

			<div className="hero-tray__equipment hero-tray__equipment--right">
				{isTwoHanded ? (
					<div className={handExhausted ? "hero-tray__exhausted" : undefined}>
						<TrayItem
							itemId={handItemId}
							label="Mãos 1 + 2 · 2 mãos"
							cardImageUrls={cardImageUrls}
							onCardDetail={onCardDetail}
						/>
						{handExhausted ? (
							<span className="hero-tray__exhausted-label">Exaurido</span>
						) : null}
					</div>
				) : (
					<>
						<EquippedSlot
							hero={hero}
							slot="hand1"
							cardImageUrls={cardImageUrls}
							onCardDetail={onCardDetail}
						/>
						<EquippedSlot
							hero={hero}
							slot="hand2"
							cardImageUrls={cardImageUrls}
							onCardDetail={onCardDetail}
						/>
					</>
				)}
			</div>

			<div className="hero-tray__abilities">
				<div>
					<span>Habilidades</span>
					{skills.map(({ def, ref }) => (
						<small key={def.id}>{renderSkillLabel(ref)}</small>
					))}
				</div>
				<div>
					<span>Poderes</span>
					{powers.map(({ def, ref }) => (
						<small key={def.id}>{renderSkillLabel(ref)}</small>
					))}
				</div>
			</div>

			<div className="hero-tray__stats">
				<div>
					<span>Vida</span>
					<HpBar current={hero.currentLife} max={hero.maxLife} height={6} />
				</div>
				<strong>
					{hero.currentLife}/{hero.maxLife}
				</strong>
				<span>Acerto +{hero.hitBonus}</span>
				<span>Dano {hero.damage}</span>
				<span>{hero.dice}d6</span>
				<ColorBar current={hero.impeto} label="Ascensão" />
			</div>

			<div className="hero-tray__backpack">
				<span>Mochila</span>
				<div>
					{Array.from({ length: 3 }, (_, index) => (
						<TrayItem
							key={index}
							itemId={hero.backpack[index]}
							label={`Mochila ${index + 1}`}
							inBackpack
							cardImageUrls={cardImageUrls}
							onCardDetail={onCardDetail}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
