import type { HeroState } from "@/core/state/heroState";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardImageUrl, type CardImageUrls } from "@/ui/cardImages";

interface EndHeroRosterProps {
	heroes: readonly HeroState[];
	imageUrls: CardImageUrls;
	title: string;
}

export function EndHeroRoster({ heroes, imageUrls, title }: EndHeroRosterProps) {
	return (
		<div className="end-card__roster">
			<p className="end-card__section-title">{title}</p>
			<div className="end-card__heroes">
				{heroes.map((hero) => {
					const name = getCardName(hero.cardId);
					const imageUrl = getCardImageUrl(imageUrls, hero.cardId);
					return (
						<div className="end-card__hero" key={hero.id}>
							<div className="end-card__hero-art">
								{imageUrl ? <img src={imageUrl} alt="" /> : <span aria-hidden="true">{name.charAt(0)}</span>}
							</div>
							<div className="end-card__hero-name">{name}</div>
						</div>
					);
				})}
				</div>
		</div>
	);
}
