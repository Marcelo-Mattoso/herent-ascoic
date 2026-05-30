import { ActionButton } from "@/ui/components/ActionButton";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

export function Defeat() {
	const { view, reset } = useGameStore();
	const hero = view.heroes[0];

	const deathReason =
		hero && hero.currentLife <= 0
			? "Herói eliminado em combate"
			: view.decks.dungeonDeck.available === 0
				? "Deck de dungeon esgotado"
				: "Derrota pelo boss";

	return (
		<div
			className="min-h-screen flex flex-col items-center justify-center py-12 px-4"
			style={{ background: UI.pageBg }}
		>
			<div style={{ width: "100%", maxWidth: 560 }}>
				<h1
					className="text-4xl font-medium mb-2"
					style={{ color: UI.textPrimary }}
				>
					Derrota
				</h1>
				<p className="text-sm mb-6" style={{ color: UI.textSecondary }}>
					A masmorra consumiu os heróis.
				</p>

				<div
					className="rounded-xl p-5 mb-6 space-y-2"
					style={{ background: UI.subpanelBg }}
				>
					{[
						["Motivo", deathReason],
						["Salas exploradas", view.roomsCleared],
						["Criaturas derrotadas", view.creaturesDefeated],
						["Chefe escolhido", view.bossCardName],
						["XP obtido", view.groupXp],
						["Artefatos encontrados", view.groupArtifacts.length],
					].map(([label, value]) => (
						<div key={String(label)} className="flex justify-between text-sm">
							<span style={{ color: UI.textSecondary }}>{label}</span>
							<span className="font-medium" style={{ color: UI.textPrimary }}>
								{value}
							</span>
						</div>
					))}
				</div>

				<div className="flex gap-3">
					<ActionButton
						label="Tentar novamente"
						variant="primary"
						onClick={reset}
					/>
					<ActionButton
						label="Voltar ao menu"
						variant="secondary"
						onClick={reset}
					/>
				</div>
			</div>
		</div>
	);
}
