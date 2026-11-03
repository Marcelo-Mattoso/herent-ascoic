import { useState } from "react";
import { displayCardName as getCardName } from "@/i18n/catalogs";
import { skillsOf } from "@/core/gameEngine";
import type { PlayerView } from "@/core/projection/playerView";
import type { CardType } from "@/ui/components/Card";
import { renderSkillLabel } from "@/core/skills/renderLabel";
import { uiEngine } from "@/ui/engine";

/**
 * Indicador consultável de artefatos compartilhados. Não altera seus efeitos:
 * cada habilidade continua obedecendo às condições e janelas do motor.
 */
export function GroupArtifactPanel({
	view,
	onArtifactClick,
}: {
	view: PlayerView;
	onArtifactClick: (id: string, type: CardType) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	return (
		<section
			className="game-group-artifacts"
			style={{
				flex: "0 0 auto",
				border: "1px solid rgba(208, 164, 91, 0.75)",
				borderRadius: 8,
				background: "linear-gradient(145deg, rgba(29, 20, 14, 0.97), rgba(65, 42, 24, 0.96))",
				color: "#f2ddaf",
				overflow: "hidden",
				boxShadow: "0 10px 18px rgba(0, 0, 0, 0.3)",
			}}
		>
			<button
				type="button"
				className="game-group-artifacts__toggle"
				aria-expanded={expanded}
				onClick={() => setExpanded((current) => !current)}
				style={{
					display: "flex", alignItems: "center", justifyContent: "space-between",
					width: "100%", padding: "9px 11px", cursor: "pointer",
					color: "inherit", background: "transparent", border: 0,
					fontFamily: "Georgia, serif", fontSize: 14,
				}}
			>
				<span>◆ Artefatos do grupo</span>
				<span aria-label={String(view.groupArtifacts.length) + " artefatos"}>
					{view.groupArtifacts.length} <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
				</span>
			</button>
			{expanded && (
				<div
					className="game-group-artifacts__details"
					style={{
						maxHeight: "min(34vh, 280px)", overflowY: "auto", padding: "2px 11px 11px",
						fontSize: 12, lineHeight: 1.45,
					}}
				>
					{view.groupArtifacts.length === 0 && (
						<p>Nenhum artefato encontrado. Os artefatos coletados aparecerão aqui com suas habilidades.</p>
					)}
					{view.groupArtifacts.map((artifact) => {
						const bearer = artifact.carriedBy
							? view.heroes.find((hero) => hero.id === artifact.carriedBy)
							: null;
						const abilities = skillsOf(uiEngine, artifact.cardId);
						return (
							<article
								key={artifact.cardId}
								style={{ padding: "8px 0", borderTop: "1px solid rgba(208, 164, 91, 0.33)" }}
							>
								<button
									type="button"
									onClick={() => onArtifactClick(artifact.cardId, "artifact")}
									style={{
										color: "#ffe5a7", textDecoration: "underline",
										background: "none", border: 0, padding: 0, cursor: "pointer",
										textAlign: "left", fontWeight: 700, fontSize: 12,
									}}
								>
									{getCardName(artifact.cardId)}
								</button>
								<p style={{ opacity: 0.8, margin: "3px 0" }}>
									{bearer ? "Portador: " + getCardName(bearer.cardId) : "Compartilhado pelo grupo"}
								</p>
								{abilities.map(({ ref }) => (
									<p key={ref.skillId} style={{ margin: "3px 0" }}>
										{renderSkillLabel(uiEngine, ref)}
									</p>
								))}
							</article>
						);
					})}
					{view.groupArtifacts.length > 0 && (
						<small style={{ display: "block", opacity: 0.75, paddingTop: 4 }}>
							Os efeitos respeitam suas condições e momentos de ativação; não ocupam os equipamentos normais.
						</small>
					)}
				</div>
			)}
		</section>
	);
}
