import { useState } from "react";
import type { Difficulty } from "@/core/state/gameState";
import { getBoss, getHeroes } from "@/data/cards";
import { ActionButton } from "@/ui/components/ActionButton";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
	{
		value: "very_easy",
		label: "Muito fácil",
		hint: "Ímpeto Laranja, Despertar Branco",
	},
	{ value: "easy", label: "Fácil", hint: "Ímpeto Amarelo, Despertar Branco" },
	{ value: "normal", label: "Padrão", hint: "Ímpeto Branco, Despertar Branco" },
	{ value: "hard", label: "Difícil", hint: "Ímpeto Branco, Despertar Amarelo" },
	{
		value: "nightmare",
		label: "Pesadelo",
		hint: "Ímpeto Amarelo, Despertar Laranja",
	},
];

interface SetupProps {
	onBack: () => void;
}

export function Setup({ onBack }: SetupProps) {
	const dispatch = useGameStore((s) => s.dispatch);
	const [difficulty, setDifficulty] = useState<Difficulty>("normal");
	const [selectedHero, setSelectedHero] = useState<string | null>(null);

	const heroes = getHeroes();
	const boss = getBoss();

	function startGame() {
		if (!selectedHero) return;
		dispatch({
			type: "START_GAME",
			payload: { heroCardName: selectedHero, difficulty },
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
							Modo Solo · 1 herói
						</p>
					</div>
				</div>

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
				</section>

				{/* Heróis */}
				<section className="mb-6">
					<p
						className="text-sm font-medium mb-2"
						style={{ color: UI.textSecondary }}
					>
						Escolha o herói
					</p>
					<div className="grid grid-cols-4 gap-3">
						{heroes.map((h) => (
							<button
								key={h.name}
								type="button"
								onClick={() => setSelectedHero(h.name)}
								className="rounded-lg p-2 text-left transition-all"
								style={{
									background: selectedHero === h.name ? UI.info.bg : UI.panelBg,
									border: `1.5px solid ${selectedHero === h.name ? "#185FA5" : UI.border}`,
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
						))}
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
						disabled={!selectedHero}
					/>
				</div>
			</div>
		</div>
	);
}
