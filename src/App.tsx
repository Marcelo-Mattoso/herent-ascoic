import { type ReactNode, useEffect, useState } from "react";
import { Defeat } from "@/ui/screens/Defeat";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Replay } from "@/ui/screens/Replay";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { useGameStore } from "@/ui/store/gameStore";

type UiScreen = "menu" | "setup";

function App() {
	const status = useGameStore((s) => s.view.status);
	const [uiScreen, setUiScreen] = useState<UiScreen>("menu");
	// Passo 13: Replay Viewer atrás de atalho de teclado (Ctrl+Shift+R)
	const [showReplay, setShowReplay] = useState(false);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.ctrlKey && e.shiftKey && e.key === "R") {
				e.preventDefault();
				setShowReplay((v) => !v);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	let screen: ReactNode;

	if (showReplay) {
		screen = <Replay onClose={() => setShowReplay(false)} />;
	} else if (status === "VICTORY") {
		screen = <Victory />;
	} else if (status === "DEFEAT") {
		screen = <Defeat />;
	} else if (status !== "MAIN_MENU") {
		screen = <Exploration />;
	} else if (uiScreen === "setup") {
		screen = <Setup onBack={() => setUiScreen("menu")} />;
	} else {
		screen = <MainMenu onNewGame={() => setUiScreen("setup")} />;
	}

	return (
		<>
			{screen}
			<OrientationGate />
		</>
	);
}

function OrientationGate() {
	return (
		<section
			className="orientation-gate"
			aria-label="O jogo requer orientação horizontal"
			aria-live="polite"
		>
			<div className="orientation-gate__card">
				<span className="orientation-gate__icon" aria-hidden="true">
					↻
				</span>
				<h1>Gire o dispositivo para jogar</h1>
				<p>Ascensão Heróica funciona apenas no modo horizontal.</p>
			</div>
		</section>
	);
}

export default App;
