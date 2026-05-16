import type { ColorIndex } from "@/core/state/color";
import { COLORS_MAP, UI } from "@/ui/theme";

interface ColorBarProps {
	current: ColorIndex;
	label?: string;
}

export function ColorBar({ current, label }: ColorBarProps) {
	return (
		<div>
			{label && (
				<p className="text-xs mb-1" style={{ color: UI.textTertiary }}>
					{label}
				</p>
			)}
			<div className="flex gap-1">
				{COLORS_MAP.map((c, i) => (
					<div
						key={c.name}
						className="h-1.5 flex-1 rounded-full"
						style={{
							background: i <= current ? c.barFill : UI.subpanelBg,
							border:
								i === current
									? `1px solid ${c.border}`
									: "1px solid transparent",
						}}
					/>
				))}
			</div>
			<p className="text-xs mt-0.5" style={{ color: COLORS_MAP[current].text }}>
				{COLORS_MAP[current].name}
			</p>
		</div>
	);
}
