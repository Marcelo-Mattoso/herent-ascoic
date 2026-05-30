import type { BuffView } from "@/core/projection/playerView";
import { UI } from "@/ui/theme";

interface BuffBarProps {
	buffs: readonly BuffView[];
	// Quando true, esconde o estado vazio "sem efeitos ativos".
	// Útil pra barra de grupo, que pode ficar invisível quando não há efeitos.
	hideWhenEmpty?: boolean;
	// Rótulo opcional à esquerda da lista (ex: "Grupo").
	leadingLabel?: string;
}

// Paleta por polaridade. Buff = âmbar/dourado; debuff = vermelho/roxo; neutro = cinza.
const PALETTE: Record<
	BuffView["kind"],
	{ bg: string; fg: string; border: string }
> = {
	buff: { bg: "#FEF3C7", fg: "#92400E", border: "#F59E0B" },
	debuff: { bg: "#FCE4EC", fg: "#7A1F3D", border: "#C2185B" },
	neutral: { bg: "#E5E7EB", fg: "#374151", border: "#9CA3AF" },
};

export function BuffBar({ buffs, hideWhenEmpty, leadingLabel }: BuffBarProps) {
	if (buffs.length === 0) {
		if (hideWhenEmpty) return null;
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "3px 0",
					minHeight: 22,
				}}
			>
				{leadingLabel && (
					<span style={{ fontSize: 9, color: UI.textTertiary, fontWeight: 500 }}>
						{leadingLabel}
					</span>
				)}
				<span style={{ fontSize: 9, color: UI.textTertiary }}>
					sem efeitos ativos
				</span>
			</div>
		);
	}

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 4,
				flexWrap: "wrap",
				padding: "3px 0",
				minHeight: 22,
			}}
		>
			{leadingLabel && (
				<span style={{ fontSize: 9, color: UI.textTertiary, fontWeight: 500 }}>
					{leadingLabel}
				</span>
			)}
			{buffs.map((b) => {
				const c = PALETTE[b.kind];
				const tooltip = `${b.source} · ${b.detail}`;
				return (
					<span
						key={b.id}
						title={tooltip}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 3,
							fontSize: 10,
							lineHeight: 1.2,
							padding: "2px 6px",
							borderRadius: 10,
							background: c.bg,
							color: c.fg,
							border: `1px solid ${c.border}`,
							whiteSpace: "nowrap",
						}}
					>
						<span style={{ fontSize: 11 }}>{b.icon}</span>
						<strong style={{ fontWeight: 600 }}>{b.label}</strong>
						<span style={{ opacity: 0.75 }}>· {b.source}</span>
					</span>
				);
			})}
		</div>
	);
}
