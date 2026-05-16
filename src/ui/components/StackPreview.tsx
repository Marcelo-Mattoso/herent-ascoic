import { UI } from "@/ui/theme";

interface StackPreviewProps {
	name: string;
	count: number;
	discardCount?: number;
	onClick?: () => void;
}

export function StackPreview({
	name,
	count,
	discardCount,
	onClick,
}: StackPreviewProps) {
	return (
		<button
			type="button"
			className="flex items-center gap-3 p-2 rounded-lg w-full text-left hover:opacity-80 transition-opacity"
			style={{ background: UI.subpanelBg }}
			onClick={onClick}
		>
			{/* Pilha visual */}
			<div className="relative w-8 h-10 flex-shrink-0">
				{[2, 1, 0].map((offset) => (
					<div
						key={offset}
						className="absolute rounded"
						style={{
							width: 28,
							height: 36,
							left: offset * 2,
							top: offset * 2,
							background:
								offset === 0 ? "#5F5E5A" : offset === 1 ? "#888780" : "#B4B2A9",
							border: `1px solid ${UI.border}`,
						}}
					/>
				))}
			</div>
			<div>
				<p className="text-xs font-medium" style={{ color: UI.textPrimary }}>
					{name}
				</p>
				<p className="text-xs" style={{ color: UI.textTertiary }}>
					{count} cartas
					{discardCount !== undefined &&
						discardCount > 0 &&
						` · descarte ${discardCount}`}
				</p>
			</div>
		</button>
	);
}
