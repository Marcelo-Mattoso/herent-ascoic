import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { useGameStore } from "./ui/store/gameStore";
import { restoreLocale } from "./i18n";

// Expõe o store no window em dev para facilitar testes via console/preview_eval
if (import.meta.env.DEV) {
	(window as unknown as Record<string, unknown>).__store = useGameStore;
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

await restoreLocale();
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
