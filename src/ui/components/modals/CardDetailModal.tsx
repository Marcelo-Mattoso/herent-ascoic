import { getCardByName } from "@/core/data/cards";
import { cardSkills, lookupSkillById } from "@/core/skills/lookup";
import { renderSkillLabel } from "@/core/skills/renderLabel";
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

					{card?.type === "hero" && (() => {
						const heroSkills = cardSkills(card.id);
						const habilidade = heroSkills.find(({ def }) => def.category === "habilidade");
						const poder = heroSkills.find(({ def }) => def.category === "poder_heroi");
						return (
							<>
								<Row label="Dano" value={String(card.damage)} />
								{habilidade && (
									<div>
										<p className="text-xs font-medium" style={{ color: UI.textSecondary }}>Habilidade</p>
										<p className="text-xs" style={{ color: UI.textPrimary }}>{renderSkillLabel(habilidade.ref)}</p>
									</div>
								)}
								{poder && (
									<div>
										<p className="text-xs font-medium" style={{ color: UI.textSecondary }}>Poder</p>
										<p className="text-xs" style={{ color: UI.textPrimary }}>{renderSkillLabel(poder.ref)}</p>
									</div>
								)}
								<p className="text-xs italic" style={{ color: UI.textTertiary }}>{card.style}</p>
							</>
						);
					})()}

					{(card?.type === "creature" || card?.type === "subboss") && (() => {
						const creatureSkills = cardSkills(card.id);
						const main = creatureSkills.find(({ ref }) => !ref.requiresAwakening);
						const purple = creatureSkills.find(({ ref }) => ref.requiresAwakening);
						return (
							<>
								<Row label="Dano" value={String(card.damage)} />
								<Row label="XP" value={String(card.xp)} />
								{main && (
									<p className="text-xs italic" style={{ color: UI.textSecondary }}>
										{renderSkillLabel(main.ref)}
									</p>
								)}
								{purple && (
									<p className="text-xs italic" style={{ color: "#3D1A6E" }}>
										Roxo: {renderSkillLabel(purple.ref)}
									</p>
								)}
							</>
						);
					})()}

					{card?.type === "room" && (() => {
						const roomSkills = cardSkills(card.id);
						const main = roomSkills[0];
						return (
							<>
								<Row label="Saídas" value={String(card.exits)} />
								<Row label="XP" value={String(card.xp ?? 0)} />
								{main && (
									<p className="text-xs italic" style={{ color: UI.textSecondary }}>
										{renderSkillLabel(main.ref)}
									</p>
								)}
							</>
						);
					})()}

					{card?.type === "item" && (() => {
						const itemSkills = cardSkills(card.id);
						const main = itemSkills[0];
						return (
							<>
								<Row label="Tipo" value={card.itemClass} />
								{main && (
									<p className="text-xs" style={{ color: UI.textPrimary }}>
										{renderSkillLabel(main.ref)}
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
						);
					})()}

					{card?.type === "artifact" && (() => {
						const artSkills = cardSkills(card.id);
						const main = artSkills[0];
						return main ? (
							<p className="text-xs" style={{ color: UI.textPrimary }}>
								{renderSkillLabel(main.ref)}
							</p>
						) : null;
					})()}

					{card?.type === "boss" && (
						<>
							<Row label="Condição" value={card.condition} />
							{card.skills.map((ref) => {
								const def = lookupSkillById(ref.skillId);
								if (!def) return null;
								return (
									<div key={ref.skillId}>
										<p className="text-xs font-medium" style={{ color: UI.textSecondary }}>
											{def.name}
										</p>
										<p className="text-xs" style={{ color: UI.textPrimary }}>
											{renderSkillLabel(ref)}
										</p>
									</div>
								);
							})}
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
