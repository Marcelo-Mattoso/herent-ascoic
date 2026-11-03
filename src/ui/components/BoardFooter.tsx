import { translate } from "@/i18n";
// Footer do tabuleiro: XP do grupo · Artefatos · Condição do chefe.

import { displayCardName as getCardName } from "@/i18n/catalogs";
import { getCardById } from "@/core/data/cards";
import type { PlayerView } from "@/core/projection/playerView";
import type { CardType } from "@/ui/components/Card";
import { UI } from "@/ui/theme";

interface BoardFooterProps {
	view: PlayerView;
	onArtifactClick: (name: string, type: CardType) => void;
}

export function BoardFooter({ view, onArtifactClick }: BoardFooterProps) {
	const boss = getCardById(view.bossCardId);
	const requiredArtifacts = boss?.type === "boss" && boss.accessCondition?.type === "group_artifacts_gte"
		? boss.accessCondition.value
		: 0;
	const missing = Math.max(0, requiredArtifacts - view.groupArtifacts.length);
	// Fica na mesma linha do título de XP para não aumentar a altura do rodapé
	// nos viewports pequenos. O build publicado remove todo este indicador.
	const devDungeonDeckCounter = import.meta.env.DEV ? (
		<span
			data-testid="dev-dungeon-deck-count"
			title={translate("game:components.boardFooter.devDungeonDeck", { count: view.decks.dungeonDeck.available })}
			style={{ color: UI.textTertiary, fontSize: 10, marginLeft: 5, whiteSpace: "nowrap" }}
		>
			{"🃏"} {view.decks.dungeonDeck.available}
		</span>
	) : null;

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
						<p style={{ color: UI.textSecondary, fontSize: 10, whiteSpace: "nowrap" }}>
							{translate("game:components.boardFooter.text001")} {devDungeonDeckCounter}
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
						<p style={{ color: UI.textSecondary, fontSize: 10, whiteSpace: "nowrap" }}>
							{translate("game:components.boardFooter.text002")} {devDungeonDeckCounter}
						</p>
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
					{translate("game:components.boardFooter.text003")}{" "}{view.groupArtifacts.length}/{requiredArtifacts}
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
							{translate("game:components.boardFooter.text004")}{" "}</span>
					))}
				</div>
			</div>

			{/* Condição */}
			<div style={{ textAlign: "center" }}>
				<p style={{ color: UI.textSecondary, fontSize: 10 }}>
					{translate("game:components.boardFooter.text005")}{" "}</p>
				<p style={{ color: UI.textPrimary, fontSize: 11 }}>
					{translate("game:components.boardFooter.text006", {
						current: view.groupArtifacts.length,
						required: requiredArtifacts,
					})}
				</p>
			</div>
		</div>
	);
}
