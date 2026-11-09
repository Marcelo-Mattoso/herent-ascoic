import { translate } from "@/i18n";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { skillsOf } from "@/core/gameEngine";
import type { PlayerView } from "@/core/projection/playerView";
import type { CardType } from "@/ui/components/Card";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import type { CardImageUrls } from "@/ui/cardImages";
import { getCardImageUrl } from "@/ui/cardImages";
import { uiEngine } from "@/ui/engine";

/** Compact, permanently visible artifacts; passive effects never get a Use button. */
export function GroupArtifactPanel({
	view,
	onArtifactClick,
	onArtifactUse,
	cardImageUrls,
}: {
	view: PlayerView;
	onArtifactClick: (id: string, type: CardType) => void;
	onArtifactUse: (artifactId: string, abilityId: string) => void;
	cardImageUrls?: CardImageUrls;
}) {
	return (
		<section className="game-group-artifacts" aria-label={translate("game:components.groupArtifactPanel.ariaLabel")} style={{
			flex: "0 0 auto",
			border: "1px solid rgba(208, 164, 91, 0.75)",
			borderRadius: 8,
			background: "linear-gradient(145deg, rgba(29, 20, 14, 0.97), rgba(65, 42, 24, 0.96))",
			color: "#f2ddaf",
			padding: "8px 10px",
			boxShadow: "0 10px 18px rgba(0, 0, 0, 0.3)",
		}}>
			<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 7 }}>
				<strong>◆ {translate("game:components.groupArtifactPanel.title")}</strong>
				<span>{view.groupArtifacts.length}</span>
			</div>
			{view.groupArtifacts.length === 0
				? <p style={{ fontSize: 11, margin: 0, opacity: 0.7 }}>{translate("game:components.groupArtifactPanel.empty")}</p>
				: (
					<div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
						{view.groupArtifacts.map((artifact, index) => {
							const bearer = artifact.carriedBy
								? view.heroes.find((hero) => hero.id === artifact.carriedBy) : null;
							const actions = view.artifactActions.filter((entry) => entry.artifactId === artifact.cardId);
							const image = getCardImageUrl(cardImageUrls, artifact.cardId);
							const abilities = skillsOf(uiEngine, artifact.cardId);
							return (
								<article key={artifact.cardId + "-" + index} data-testid="group-artifact" style={{
									flex: "1 1 94px", minWidth: 0, maxWidth: 180,
									border: "1px solid rgba(208,164,91,.32)",
									borderRadius: 6, padding: 6,
									background: "rgba(18,13,12,.5)",
								}}>
									<button type="button" onClick={() => onArtifactClick(artifact.cardId, "artifact")}
										aria-label={translate("game:components.groupArtifactPanel.inspect", { name: getCardName(artifact.cardId) })}
										style={{ width: "100%", border: 0, background: "none", color: "inherit", padding: 0,
											cursor: "pointer", textAlign: "left", fontSize: 11 }}>
										{image ? <img src={image} alt="" style={{
											display: "block", height: 64, maxWidth: "100%", objectFit: "contain", margin: "0 auto 5px",
										}} /> : <span aria-hidden="true" style={{ display: "block", textAlign: "center", fontSize: 24 }}>◆</span>}
										<strong style={{ display: "block", overflowWrap: "anywhere" }}>{getCardName(artifact.cardId)}</strong>
									</button>
									<div style={{ fontSize: 10, opacity: 0.75, marginTop: 3 }}>
										{bearer
											? translate("game:components.groupArtifactPanel.bearer", { name: getCardName(bearer.cardId) })
											: translate("game:components.groupArtifactPanel.shared")}
									</div>
									{abilities[0] && <div title={renderSkillLabel(uiEngine, abilities[0].ref)}
										style={{ fontSize: 10, opacity: .85, marginTop: 3, overflow: "hidden",
											display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}>
										{renderSkillLabel(uiEngine, abilities[0].ref)}
									</div>}
									{actions.length > 0 ? actions.map((action) => (
										<button key={action.abilityId} type="button"
											disabled={!action.available}
											title={action.reason ?? translate("game:components.groupArtifactPanel.activateTitle")}
											onClick={() => onArtifactUse(artifact.cardId, action.abilityId)}
											style={{ display: "block", marginTop: 6, width: "100%", padding: "5px 4px",
												borderRadius: 5, border: "1px solid #ac8749", fontSize: 11,
												background: action.available ? "#5d4017" : "#35302a",
												color: action.available ? "#ffe4a0" : "#aaa39a",
												cursor: action.available ? "pointer" : "not-allowed" }}>
											{translate("game:components.groupArtifactPanel.use")}
										</button>
									)) : <small style={{ display: "block", opacity: .65, marginTop: 5, fontSize: 10 }}>{translate("game:components.groupArtifactPanel.passiveReactive")}</small>}
								</article>
							);
						})}
					</div>
				)}
		</section>
	);
}
