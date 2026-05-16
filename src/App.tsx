import { useState } from "react";
import { Defeat } from "@/ui/screens/Defeat";
import { Exploration } from "@/ui/screens/Exploration";
import { MainMenu } from "@/ui/screens/MainMenu";
import { Setup } from "@/ui/screens/Setup";
import { Victory } from "@/ui/screens/Victory";
import { useGameStore } from "@/ui/store/gameStore";

type UiScreen = "menu" | "setup";

function App() {
	const status = useGameStore((s) => s.state.status);
	const [uiScreen, setUiScreen] = useState<UiScreen>("menu");

	if (status === "VICTORY") return <Victory />;
	if (status === "DEFEAT") return <Defeat />;
	if (status !== "MAIN_MENU") return <Exploration />;

	if (uiScreen === "setup") return <Setup onBack={() => setUiScreen("menu")} />;

	return <MainMenu onNewGame={() => setUiScreen("setup")} />;
}

export default App;
