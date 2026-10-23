import { type ReactNode, useEffect, useState } from "react";
import { Defeat } from "@/ui/screens/Defeat";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Replay } from "@/ui/screens/Replay";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { useGameStore } from "@/ui/store/gameStore";
import { publicAssetUrl } from "@/ui/publicAssetUrl";

type UiScreen = "menu" | "setup";

function App() {
	const status = useGameStore((s) => s.view.status);
	const [uiScreen, setUiScreen] = useState<UiScreen>("menu");
	const [showReplay, setShowReplay] = useState(false);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && e.key === "R") {
				e.preventDefault();
				setShowReplay((v) => !v);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	let screen: ReactNode;

	if (import.meta.env.DEV && showReplay) {
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
			<RulesAccess
				inGame={
					status !== "MAIN_MENU" && status !== "VICTORY" && status !== "DEFEAT"
				}
			/>
		</>
	);
}

function RulesAccess({ inGame }: { inGame: boolean }) {
	const manualUrl = publicAssetUrl("rules/ascensao-heroica-manual.pdf");
	return (
		<nav
			className={`rules-access${inGame ? " rules-access--in-game" : ""}`}
			aria-label="Manual de regras"
		>
			<a href={manualUrl} target="_blank" rel="noopener noreferrer">
				? Regras
			</a>
			<a
				href={manualUrl}
				download="ascensao-heroica-manual.pdf"
				aria-label="Baixar manual em PDF"
			>
				↓ PDF
			</a>
		</nav>
	);
}

export default App;
