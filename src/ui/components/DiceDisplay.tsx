import { translate } from "@/i18n";
import type { KeyboardEvent } from "react";
import { UI } from "@/ui/theme";

interface DiceDisplayProps {
	results: readonly number[];
	total: number;
	bonuses: readonly { source: string; value: number }[];
	side: "hero" | "enemy";
	label?: string;
	horizontal?: boolean;
	// Seleção interativa — índices clicáveis + callback
	eligibleIndices?: ReadonlySet<number>;
	onDieClick?: (index: number) => void;
}

export function DiceDisplay({
	results,
	total,
	bonuses,
	side,
	label,
	horizontal,
	eligibleIndices,
	onDieClick,
}: DiceDisplayProps) {
	const isHero = side === "hero";
	const dieColor = isHero ? UI.info : UI.danger;
	const bonusStr = bonuses
		.filter((b) => b.value !== 0)
		.map((b) => `${b.source} ${b.value >= 0 ? "+" : ""}${b.value}`)
		.join(" · ");
	if (horizontal) {
		return (
			<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
				{label && (
					<span
						style={{ fontSize: 10, color: UI.textSecondary, fontWeight: 500 }}
					>
						{label}
					</span>
				)}
				<div style={{ display: "flex", gap: 3 }}>
					{results.map((val, i) => {
						const eligible = eligibleIndices?.has(i) ?? false;
						return (
							<DieValue
								key={`die-${i}`}
								value={val}
								index={i}
								eligible={eligible}
								onClick={onDieClick}
								className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold"
								color={dieColor}
							/>
						);
					})}
				</div>
				{bonusStr && (
					<span style={{ fontSize: 10, color: UI.textTertiary }}>
						{bonusStr}
					</span>
				)}
				<span
					style={{
						fontSize: 11,
						fontWeight: 600,
						color: isHero ? UI.info.text : UI.danger.text,
					}}
				>
					{translate("game:components.diceDisplay.text001")}{" "}{total}
				</span>
			</div>
		);
	}

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
				{results.map((val, i) => {
					const eligible = eligibleIndices?.has(i) ?? false;
					return (
						<DieValue
							key={`die-${i}`}
							value={val}
							index={i}
							eligible={eligible}
							onClick={onDieClick}
							className="w-7 h-7 flex items-center justify-center rounded text-sm font-bold"
							color={dieColor}
						/>
					);
				})}
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
				{translate("game:components.diceDisplay.text002")}{" "}{total}
			</p>
		</div>
	);
}

function DieValue({
	value,
	index,
	eligible,
	onClick,
	className,
	color,
}: {
	value: number;
	index: number;
	eligible: boolean;
	onClick?: (index: number) => void;
	className: string;
	color: { bg: string; text: string };
}) {
	const style = {
		background: eligible ? (UI.warning?.bg ?? "#FEF3C7") : color.bg,
		color: eligible ? "#92400E" : color.text,
		border: `2px solid ${eligible ? "#F59E0B" : UI.border}`,
		cursor: eligible ? "pointer" : "default",
	};

	if (!eligible) return <div className={className} style={style}>{value}</div>;

	function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		onClick?.(index);
	}

	return (
		<button
			type="button"
			className={`${className} die-eligible`}
			aria-label={`Selecionar dado ${index + 1}: ${value}`}
			onClick={() => onClick?.(index)}
			onKeyDown={handleKeyDown}
			style={style}
		>
			{value}
		</button>
	);
}
