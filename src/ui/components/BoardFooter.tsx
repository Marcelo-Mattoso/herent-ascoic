// Footer do tabuleiro: XP do grupo · Artefatos · Condição do chefe.

import { getCardName } from "@/core/data/cardLocale";
import type { PlayerView } from "@/core/projection/playerView";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";

interface BoardFooterProps {
	view: PlayerView;
	onArtifactClick: (name: string, type: CardType) => void;
}

export function BoardFooter({ view, onArtifactClick }: BoardFooterProps) {
	const missing = Math.max(0, 2 - view.groupArtifacts.length);

	return (
		<div
			className="game-board-footer"
			data-tutorial-anchor="board.progression"
			style={{
				display: "var(--game-footer-display, grid)",
				gridTemplateColumns: "1fr 1fr 1fr",
				gap: "var(--game-footer-gap, 16px)",
				padding: "var(--game-footer-padding, 8px 12px)",
				borderTop: `0.5px solid ${UI.border}`,
				alignItems: "center",
			}}
		>
			{/* XP */}
			<div style={{ textAlign: "center" }}>
				{view.mode === "competitive" ? (
					<>
						<p style={{ color: UI.textSecondary, fontSize: 10 }}>
							XP por jogador
						</p>
						<div
							style={{
								display: "flex",
								flexWrap: "wrap",
								justifyContent: "center",
								gap: 4,
							}}
						>
							{view.heroes
								.filter((h) => h.status === "active")
								.map((h) => (
									<span
										key={h.id}
										style={{
											color: UI.textPrimary,
											fontSize: 11,
											fontWeight: 500,
										}}
									>
										J{h.playerIndex + 1}:{h.xp}
									</span>
								))}
						</div>
					</>
				) : (
					<>
						<p style={{ color: UI.textSecondary, fontSize: 10 }}>XP do grupo</p>
						<p
							style={{
								color: UI.textPrimary,
								fontSize: 18,
								fontWeight: 500,
								lineHeight: 1.2,
							}}
						>
							{view.groupXp}
						</p>
					</>
				)}
			</div>

			{/* Artefatos */}
			<div style={{ textAlign: "center" }}>
				<p style={{ color: UI.textSecondary, fontSize: 10, marginBottom: 3 }}>
					Artefatos {view.groupArtifacts.length}/2
				</p>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						gap: 4,
						justifyContent: "center",
					}}
				>
					{view.groupArtifacts.map((a) => (
						<button
							key={a.cardId}
							type="button"
							style={{
								fontSize: 10,
								color: UI.textPrimary,
								background: UI.artifactBg,
								border: `1px solid ${UI.artifactBorder}`,
								borderRadius: 4,
								padding: "1px 5px",
								cursor: "pointer",
							}}
							onClick={() => onArtifactClick(a.cardId, "artifact")}
						>
							{getCardName(a.cardId)}
						</button>
					))}
					{Array.from({ length: missing }).map((_, i) => (
						<span
							key={i}
							style={{
								fontSize: 10,
								color: UI.textTertiary,
								border: `1px dashed ${UI.border}`,
								borderRadius: 4,
								padding: "1px 5px",
							}}
						>
							falta
						</span>
					))}
				</div>
			</div>

			{/* Condição */}
			<div style={{ textAlign: "center" }}>
				<p style={{ color: UI.textSecondary, fontSize: 10 }}>
					Condição do chefe
				</p>
				<p style={{ color: UI.textPrimary, fontSize: 11 }}>
					2 Artefatos ({view.groupArtifacts.length}/2)
				</p>
			</div>
		</div>
	);
}
