import { getCardByName } from "@/core/data/cards";
import type { CardType } from "@/ui/components/Card";
import { Modal } from "@/ui/components/Modal";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { UI } from "@/ui/theme";

interface CardDetailModalProps {
	cardName: string;
	cardType: CardType;
	onClose: () => void;
	onUseItem?: () => void;
}

export function CardDetailModal({
	cardName,
	cardType,
	onClose,
	onUseItem,
}: CardDetailModalProps) {
	const card = getCardByName(cardName);

	return (
		<Modal title={cardName} onClose={onClose} maxWidth={480}>
			<div className="flex gap-4">
				<div style={{ width: 120, flexShrink: 0 }}>
					<PlaceholderArt cardType={cardType} size="lg" />
				</div>
				<div className="flex-1 space-y-2 text-sm">
					<p
						className="text-xs px-2 py-0.5 rounded inline-block"
						style={{ background: UI.subpanelBg, color: UI.textTertiary }}
					>
						{card?.type ?? cardType}
					</p>

					{card?.type === "hero" && (
						<>
							<Row label="Dano" value={String(card.damage)} />
							<div>
								<p
									className="text-xs font-medium"
									style={{ color: UI.textSecondary }}
								>
									Habilidade
								</p>
								<p className="text-xs" style={{ color: UI.textPrimary }}>
									{card.skill.label}
								</p>
							</div>
							<div>
								<p
									className="text-xs font-medium"
									style={{ color: UI.textSecondary }}
								>
									Poder
								</p>
								<p className="text-xs" style={{ color: UI.textPrimary }}>
									{card.power.label}
								</p>
							</div>
							<p className="text-xs italic" style={{ color: UI.textTertiary }}>
								{card.style}
							</p>
						</>
					)}

					{(card?.type === "creature" || card?.type === "subboss") && (
						<>
							<Row label="Dano" value={String(card.damage)} />
							<Row label="XP" value={String(card.xp)} />
							{card.effect.label && (
								<p
									className="text-xs italic"
									style={{ color: UI.textSecondary }}
								>
									{card.effect.label}
								</p>
							)}
							{card.purpleEffect.label && (
								<p className="text-xs italic" style={{ color: "#3D1A6E" }}>
									Roxo: {card.purpleEffect.label}
								</p>
							)}
						</>
					)}

					{card?.type === "room" && (
						<>
							<Row label="Saídas" value={String(card.exits)} />
							<Row label="XP" value={String(card.xp ?? 0)} />
							{card.effect.label && (
								<p
									className="text-xs italic"
									style={{ color: UI.textSecondary }}
								>
									{card.effect.label}
								</p>
							)}
						</>
					)}

					{card?.type === "item" && (
						<>
							<Row label="Tipo" value={card.itemClass} />
							{card.effect.label && (
								<p className="text-xs" style={{ color: UI.textPrimary }}>
									{card.effect.label}
								</p>
							)}
							{onUseItem && card.itemClass === "consumable" && (
								<button
									type="button"
									onClick={onUseItem}
									style={{
										marginTop: 8,
										width: "100%",
										padding: "6px 0",
										background: "#3B6D11",
										color: "#E8F5DE",
										border: "none",
										borderRadius: 6,
										fontSize: 12,
										fontWeight: 600,
										cursor: "pointer",
									}}
								>
									Usar
								</button>
							)}
						</>
					)}

					{card?.type === "artifact" && card.effect.label && (
						<p className="text-xs" style={{ color: UI.textPrimary }}>
							{card.effect.label}
						</p>
					)}

					{card?.type === "boss" && (
						<>
							<Row label="Condição" value={card.condition} />
							{card.abilities.map((a) => (
								<div key={a.name}>
									<p
										className="text-xs font-medium"
										style={{ color: UI.textSecondary }}
									>
										{a.name}
									</p>
									<p className="text-xs" style={{ color: UI.textPrimary }}>
										{a.effect.label}
									</p>
								</div>
							))}
						</>
					)}

					{!card && (
						<p className="text-xs" style={{ color: UI.textTertiary }}>
							Carta não encontrada no catálogo.
						</p>
					)}
				</div>
			</div>
		</Modal>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-xs">
			<span style={{ color: UI.textSecondary }}>{label}</span>
			<span style={{ color: UI.textPrimary }}>{value}</span>
		</div>
	);
}
