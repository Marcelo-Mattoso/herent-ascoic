import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ALPHA_LOG_ENABLED } from "@/core/config/defaults";
import { translate } from "@/i18n";

/** Ctrl+Alt+L abre o histórico interno apenas na versão alpha. */
export function AlphaLogPanel({ entries }: { entries: readonly string[] }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!ALPHA_LOG_ENABLED) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey && event.altKey && event.code === "KeyL") {
				event.preventDefault();
				setOpen((value) => !value);
			} else if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
	const filtered = useMemo(() => query.trim()
		? entries.filter((entry) => entry.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
		: entries, [entries, query]);
	if (!ALPHA_LOG_ENABLED || !open) return null;
	return createPortal(
		<div role="dialog" aria-modal="true" aria-label={translate("game:components.alphaLogPanel.dialogLabel")} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,.82)", color: "#e9edf3", display: "grid", placeItems: "center", padding: 16 }}>
			<section style={{ width: "min(1100px, 100%)", height: "min(780px, 100%)", background: "#101722", border: "1px solid #4b6f8e", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "ui-monospace, Consolas, monospace" }}>
				<header style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, borderBottom: "1px solid #354454" }}>
					<strong style={{ flex: 1 }}>{translate("game:components.alphaLogPanel.title")} <small style={{ color: "#9eabb9" }}>({translate("game:components.alphaLogPanel.entryCount", { count: entries.length })})</small></strong>
					<button type="button" onClick={async () => {
						try { await navigator.clipboard.writeText(entries.join("\n")); setCopied(true); }
						catch { setCopied(false); }
						}}>{translate(copied ? "game:components.alphaLogPanel.copied" : "game:components.alphaLogPanel.copyAll")}</button>
					<button type="button" onClick={() => setOpen(false)} aria-label={translate("game:components.alphaLogPanel.closeLabel")}>{translate("game:components.alphaLogPanel.close")}</button>
				</header>
				<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={translate("game:components.alphaLogPanel.searchPlaceholder")} aria-label={translate("game:components.alphaLogPanel.searchLabel")} style={{ margin: 12, padding: 9, borderRadius: 5, border: "1px solid #4b6f8e", background: "#1d2938", color: "inherit" }} />
				<div style={{ overflowY: "auto", flex: 1, padding: "0 14px 16px" }}>
					{filtered.map((entry, index) => <div key={index} style={{ padding: "5px 0", borderBottom: "1px solid #25313f", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: entry.includes("[ERRO]") ? "#ff9292" : entry.startsWith("#") ? "#8fd1ff" : "#d6dde5" }}>{entry}</div>)}
				</div>
				<footer style={{ padding: "8px 14px", borderTop: "1px solid #354454", color: "#9eabb9", fontSize: 12 }}>{translate("game:components.alphaLogPanel.footer", { count: filtered.length })}</footer>
			</section>
		</div>, document.body,
	);
}
