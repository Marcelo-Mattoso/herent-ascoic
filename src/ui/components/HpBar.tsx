import { UI } from "@/ui/theme";

interface HpBarProps {
	current: number;
	max: number;
	height?: number;
}

export function HpBar({ current, max, height = 4 }: HpBarProps) {
	const ratio = max > 0 ? current / max : 0;
	const fill =
		ratio > 0.5 ? "#3B6D11" : ratio > 0.25 ? "#BA7517" : "#A32D2D";
	return (
		<div
			style={{
				height,
				background: UI.subpanelBg,
				border: `1px solid ${UI.border}`,
				borderRadius: 2,
				overflow: "hidden",
			}}
		>
			<div
				style={{
					width: `${Math.max(0, Math.min(100, ratio * 100))}%`,
					height: "100%",
					background: fill,
					transition: "width 0.2s",
				}}
			/>
		</div>
	);
}
