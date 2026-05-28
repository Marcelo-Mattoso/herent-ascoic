import { useState, useEffect } from "react";
import { Defeat } from "@/ui/screens/Defeat";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Replay } from "@/ui/screens/Replay";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { useGameStore } from "@/ui/store/gameStore";

type UiScreen = "menu" | "setup";

function App() {
	const status = useGameStore((s) => s.state.status);
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

	if (showReplay) {
		return <Replay onClose={() => setShowReplay(false)} />;
	}

	if (status === "VICTORY") return <Victory />;
	if (status === "DEFEAT") return <Defeat />;
	if (status !== "MAIN_MENU") return <Exploration />;

	if (uiScreen === "setup") return <Setup onBack={() => setUiScreen("menu")} />;

	return <MainMenu onNewGame={() => setUiScreen("setup")} />;
}

export default App;
