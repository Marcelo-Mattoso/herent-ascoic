import { useState } from "react";
import { getBoss, getHeroes } from "@/core/data/cards";
import type { Difficulty, GameMode } from "@/core/projection/playerView";
import { ActionButton } from "@/ui/components/ActionButton";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
	{
		value: "very_easy",
		label: "Muito fácil",
		hint: "Herói +2, Masmorra +0 (Ímpeto Laranja)",
	},
	{
		value: "easy",
		label: "Fácil",
		hint: "Herói +1, Masmorra +0 (Ímpeto Amarelo)",
	},
	{
		value: "normal",
		label: "Padrão",
		hint: "Herói +0, Masmorra +0 (ambos Branco)",
	},
	{
		value: "hard",
		label: "Difícil",
		hint: "Herói +0, Masmorra +1 (Despertar Amarelo)",
	},
	{
		value: "nightmare",
		label: "Pesadelo",
		hint: "Herói +0, Masmorra +2 (Despertar Laranja)",
	},
];

interface SetupProps {
	onBack: () => void;
}

export function Setup({ onBack }: SetupProps) {
	const dispatch = useGameStore((s) => s.dispatch);
	const [difficulty, setDifficulty] = useState<Difficulty>("normal");
	const [mode, setMode] = useState<GameMode>("cooperative");
	const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);

	const heroes = getHeroes();
	const boss = getBoss();

	function toggleHero(name: string) {
		setSelectedHeroes((prev) =>
			prev.includes(name) ? prev.filter((h) => h !== name) : [...prev, name],
		);
	}

	function startGame() {
		if (selectedHeroes.length === 0) return;
		if (mode === "competitive" && selectedHeroes.length < 2) return;
		dispatch({
			type: "START_GAME",
			payload: { heroCardNames: selectedHeroes, difficulty, mode },
		});
	}

	return (
		<div className="min-h-screen py-8 px-4" style={{ background: UI.pageBg }}>
			<div className="max-w-2xl mx-auto">
				<div className="flex items-center gap-4 mb-6">
					<button
						type="button"
						onClick={onBack}
						className="text-sm hover:opacity-70"
						style={{ color: UI.textSecondary }}
					>
						← Voltar
					</button>
					<div>
						<h1
							className="text-xl font-medium"
							style={{ color: UI.textPrimary }}
						>
							Configurar exploração
						</h1>
						<p className="text-sm" style={{ color: UI.textSecondary }}>
							{mode === "competitive" ? "Competitivo" : "Cooperativo"} ·{" "}
							{selectedHeroes.length === 0
								? mode === "competitive"
									? "Selecione 2 a 8 heróis"
									: "Selecione 1 a 8 heróis"
								: `${selectedHeroes.length} herói(s) selecionado(s)`}
						</p>
					</div>
				</div>

				{/* Modo */}
				<section className="mb-6">
					<p
						className="text-sm font-medium mb-2"
						style={{ color: UI.textSecondary }}
					>
						Modo de jogo
					</p>
					<div className="flex gap-2">
						{(["cooperative", "competitive"] as GameMode[]).map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setMode(m)}
								className="px-3 py-1.5 rounded-lg text-sm transition-all"
								style={{
									background: mode === m ? UI.info.bg : UI.subpanelBg,
									color: mode === m ? UI.info.text : UI.textSecondary,
									border: `1px solid ${mode === m ? "#B3D4F0" : UI.border}`,
								}}
							>
								{m === "cooperative" ? "Cooperativo" : "Competitivo"}
							</button>
						))}
					</div>
					<p className="text-xs mt-1.5" style={{ color: UI.textTertiary }}>
						{mode === "competitive"
							? "Cada jogador controla 1 herói. Vence quem derrotar o chefe."
							: "Todos os jogadores colaboram para derrotar o chefe."}
					</p>
				</section>

				{/* Dificuldade */}
				<section className="mb-6">
					<p
						className="text-sm font-medium mb-2"
						style={{ color: UI.textSecondary }}
					>
						Dificuldade
					</p>
					<div className="flex flex-wrap gap-2">
						{DIFFICULTIES.map((d) => (
							<button
								key={d.value}
								type="button"
								title={d.hint}
								onClick={() => setDifficulty(d.value)}
								className="px-3 py-1.5 rounded-lg text-sm transition-all"
								style={{
									background:
										difficulty === d.value ? UI.info.bg : UI.subpanelBg,
									color:
										difficulty === d.value ? UI.info.text : UI.textSecondary,
									border: `1px solid ${difficulty === d.value ? "#B3D4F0" : UI.border}`,
								}}
							>
								{d.label}
							</button>
						))}
					</div>
					<p className="text-xs mt-1.5" style={{ color: UI.textTertiary }}>
						{DIFFICULTIES.find((d) => d.value === difficulty)?.hint}
					</p>
				</section>

				{/* Heróis */}
				<section className="mb-6">
					<p
						className="text-sm font-medium mb-2"
						style={{ color: UI.textSecondary }}
					>
						Escolha o(s) herói(s)
					</p>
					<div className="grid grid-cols-4 gap-3">
						{heroes.map((h) => {
							const selected = selectedHeroes.includes(h.name);
							return (
								<button
									key={h.name}
									type="button"
									onClick={() => toggleHero(h.name)}
									className="rounded-lg p-2 text-left transition-all"
									style={{
										background: selected ? UI.info.bg : UI.panelBg,
										border: `1.5px solid ${selected ? "#185FA5" : UI.border}`,
									}}
								>
									<PlaceholderArt cardType="hero" size="sm" />
									<p
										className="text-xs font-medium mt-1 leading-tight"
										style={{ color: UI.textPrimary }}
									>
										{h.name}
									</p>
									<p className="text-xs" style={{ color: UI.textTertiary }}>
										Vida {h.life[0]} · +{h.hitBonus[0]} · Dano {h.damage}
									</p>
									<p
										className="text-xs italic mt-0.5"
										style={{ color: UI.textTertiary }}
									>
										{h.style}
									</p>
								</button>
							);
						})}
					</div>
				</section>

				{/* Boss */}
				{boss && (
					<section className="mb-8">
						<p
							className="text-sm font-medium mb-2"
							style={{ color: UI.textSecondary }}
						>
							Chefe final
						</p>
						<div
							className="flex items-center gap-4 p-3 rounded-lg"
							style={{
								background: UI.subpanelBg,
								border: `1px solid ${UI.border}`,
							}}
						>
							<div className="w-12 flex-shrink-0">
								<PlaceholderArt cardType="boss" size="sm" />
							</div>
							<div>
								<p
									className="text-sm font-medium"
									style={{ color: UI.textPrimary }}
								>
									{boss.name}
								</p>
								<p className="text-xs" style={{ color: UI.textSecondary }}>
									Condição: {boss.condition}
								</p>
							</div>
						</div>
					</section>
				)}

				<div className="flex justify-end">
					<ActionButton
						label="Iniciar partida"
						variant="primary"
						onClick={startGame}
						disabled={
							selectedHeroes.length === 0 ||
							(mode === "competitive" && selectedHeroes.length < 2)
						}
					/>
				</div>
			</div>
		</div>
	);
}
