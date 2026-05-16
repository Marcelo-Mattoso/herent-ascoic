import { UI } from "@/ui/theme";

interface DiceDisplayProps {
	results: readonly number[];
	total: number;
	bonuses: readonly { source: string; value: number }[];
	side: "hero" | "enemy";
	label?: string;
}

export function DiceDisplay({
	results,
	total,
	bonuses,
	side,
	label,
}: DiceDisplayProps) {
	const isHero = side === "hero";
	const dieColor = isHero ? UI.info : UI.danger;
	const bonusStr = bonuses
		.filter((b) => b.value !== 0)
		.map((b) => `${b.source} ${b.value >= 0 ? "+" : ""}${b.value}`)
		.join(" · ");

	return (
		<div className="flex-1">
			{label && (
				<p
					className="text-xs font-medium mb-1"
					style={{ color: UI.textSecondary }}
				>
					{label}
				</p>
			)}
			<div className="flex gap-1 flex-wrap mb-1">
				{results.map((val, i) => (
					<div
						key={`die-${i}`}
						className="w-7 h-7 flex items-center justify-center rounded text-sm font-bold"
						style={{
							background: dieColor.bg,
							color: dieColor.text,
							border: `1px solid ${UI.border}`,
						}}
					>
						{val}
					</div>
				))}
			</div>
			{bonusStr && (
				<p className="text-xs" style={{ color: UI.textTertiary }}>
					{bonusStr}
				</p>
			)}
			<p
				className="text-sm font-medium mt-0.5"
				style={{ color: isHero ? UI.info.text : UI.danger.text }}
			>
				total {total}
			</p>
		</div>
	);
}
