import { ActionButton } from "@/ui/components/ActionButton";
import { UI } from "@/ui/theme";

interface MainMenuProps {
	onNewGame: () => void;
}

export function MainMenu({ onNewGame }: MainMenuProps) {
	return (
		<div
			className="min-h-screen flex flex-col items-center justify-center"
			style={{ background: UI.pageBg }}
		>
			<div className="flex flex-col items-center gap-8" style={{ width: 320 }}>
				<div className="text-center">
					<h1
						className="text-4xl font-medium mb-2"
						style={{ color: UI.textPrimary }}
					>
						Ascensão Heróica
					</h1>
					<p className="text-sm" style={{ color: UI.textTertiary }}>
						Exploração solo de masmorra
					</p>
				</div>

				<div className="flex flex-col gap-3 w-full">
					<ActionButton
						label="Nova partida"
						variant="primary"
						onClick={onNewGame}
						fullWidth
					/>
					<ActionButton
						label="Biblioteca de cartas (em breve)"
						variant="secondary"
						disabled
						fullWidth
					/>
					<ActionButton
						label="Configurações (em breve)"
						variant="secondary"
						disabled
						fullWidth
					/>
				</div>
			</div>

			<p
				className="absolute bottom-6 text-xs"
				style={{ color: UI.textTertiary }}
			>
				MVP 1 · v0.9.120
			</p>
		</div>
	);
}
