// Painel de log de eventos da partida.
// Mostra as entradas do state.eventLog com color-coding por tipo.
// Toggleável — renderizado apenas quando showLog=true.

import { useEffect, useRef } from "react";
import { UI } from "@/ui/theme";

interface EventLogPanelProps {
	entries: readonly string[];
	onClose: () => void;
}

type EntryKind = "damage" | "heal" | "skill" | "warning" | "error" | "info";

function classifyEntry(msg: string): EntryKind {
	const m = msg.toLowerCase();
	if (m.includes("[erro]")) return "error";
	if (m.includes("[aviso]") || m.includes("[todo]")) return "warning";
	if (
		m.includes("sofreu") ||
		m.includes("dano") ||
		m.includes("derrota") ||
		m.includes("eliminado")
	)
		return "damage";
	if (
		m.includes("recuperou") ||
		m.includes("cura") ||
		m.includes("sobreviveu") ||
		m.includes("últ")
	)
		return "heal";
	if (
		m.includes("habilidade") ||
		m.includes("poder") ||
		m.includes("fúria") ||
		m.includes("skill") ||
		m.includes("runa") ||
		m.includes("juramento") ||
		m.includes("última luz") ||
		m.includes("fenda") ||
		m.includes("tiro") ||
		m.includes("bloqueada") ||
		m.includes("armadura")
	)
		return "skill";
	return "info";
}

const KIND_STYLE: Record<EntryKind, { dot: string; text: string }> = {
	damage:  { dot: "#E05252", text: "#501313" },
	heal:    { dot: "#5BA84E", text: "#2E5C1A" },
	skill:   { dot: "#5A7EC7", text: "#1A3A6E" },
	warning: { dot: "#C49A00", text: "#7A5E00" },
	error:   { dot: "#C0392B", text: "#7B1A1A" },
	info:    { dot: UI.textTertiary, text: UI.textSecondary },
};

export function EventLogPanel({ entries, onClose }: EventLogPanelProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	// Scroll para a entrada mais recente sempre que o log crescer
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [entries.length]);

	return (
		<div
			style={{
				background: UI.panelBg,
				border: `1px solid ${UI.border}`,
				borderRadius: 12,
				overflow: "hidden",
			}}
		>
			{/* Cabeçalho */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "7px 12px",
					background: UI.subpanelBg,
					borderBottom: `1px solid ${UI.border}`,
				}}
			>
				<span style={{ fontSize: 11, fontWeight: 600, color: UI.textSecondary }}>
					📋 Log de eventos
					<span
						style={{
							marginLeft: 6,
							fontSize: 10,
							color: UI.textTertiary,
							fontWeight: 400,
						}}
					>
						{entries.length} entrada{entries.length !== 1 ? "s" : ""}
					</span>
				</span>
				<button
					type="button"
					onClick={onClose}
					style={{
						background: "none",
						border: "none",
						cursor: "pointer",
						fontSize: 13,
						color: UI.textTertiary,
						padding: "0 2px",
						lineHeight: 1,
					}}
					title="Fechar log"
				>
					✕
				</button>
			</div>

			{/* Entradas */}
			<div
				style={{
					maxHeight: 160,
					overflowY: "auto",
					padding: "6px 10px",
					display: "flex",
					flexDirection: "column",
					gap: 3,
				}}
			>
				{entries.length === 0 ? (
					<p style={{ fontSize: 11, color: UI.textTertiary, textAlign: "center", padding: "8px 0" }}>
						Nenhum evento ainda.
					</p>
				) : (
					entries.map((msg, i) => {
						const kind = classifyEntry(msg);
						const style = KIND_STYLE[kind];
						return (
							<div
								key={i}
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: 6,
									fontSize: 11,
									lineHeight: 1.4,
								}}
							>
								{/* Indicador colorido */}
								<span
									style={{
										width: 6,
										height: 6,
										borderRadius: "50%",
										background: style.dot,
										flexShrink: 0,
										marginTop: 3,
									}}
								/>
								<span style={{ color: style.text }}>{msg}</span>
							</div>
						);
					})
				)}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
