import { ActionButton } from "@/ui/components/ActionButton";
import { useGameStore } from "@/ui/store/gameStore";
import { COLORS_MAP, UI } from "@/ui/theme";

export function Victory() {
	const { state, reset } = useGameStore();
	const hero = state.heroes[0];
	const isCompetitive = state.mode === "competitive";
	const winner = state.winner;

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
					{isCompetitive && winner ? `Vitória: ${winner}!` : "Vitória"}
				</h1>
				<p className="text-sm mb-6" style={{ color: UI.textSecondary }}>
					{isCompetitive && winner
						? `${winner} derrotou o chefe final e vence a partida.`
						: "Você derrotou o chefe final e sobreviveu à masmorra."}
				</p>

				<div
					className="rounded-xl p-5 mb-6 space-y-2"
					style={{ background: UI.subpanelBg }}
				>
					{[
						["Chefe derrotado", state.bossCardName],
						["Salas exploradas", state.roomsCleared],
						["Criaturas derrotadas", state.creaturesDefeated],
						["Artefatos obtidos", state.groupArtifacts.length],
						isCompetitive ? null : ["XP total", state.groupXp],
						["Nível do herói", hero ? COLORS_MAP[hero.impeto].name : "—"],
						["Despertar final", COLORS_MAP[state.despertar].name],
					]
						.filter((x): x is [string, string | number] => x !== null)
						.map(([label, value]) => (
							<div key={String(label)} className="flex justify-between text-sm">
								<span style={{ color: UI.textSecondary }}>{label}</span>
								<span className="font-medium" style={{ color: UI.textPrimary }}>
									{value}
								</span>
							</div>
						))}
					{isCompetitive &&
						state.heroes.map((h) => (
							<div key={h.id} className="flex justify-between text-sm">
								<span style={{ color: UI.textSecondary }}>
									XP — {h.cardName} (J{h.playerIndex + 1})
								</span>
								<span className="font-medium" style={{ color: UI.textPrimary }}>
									{h.xp}
								</span>
							</div>
						))}
				</div>

				<div className="flex gap-3">
					<ActionButton
						label="Jogar novamente"
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
