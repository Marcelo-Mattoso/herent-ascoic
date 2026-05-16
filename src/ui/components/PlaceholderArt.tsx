const TYPE_COLORS: Record<string, string> = {
	hero: "#D3D1C7",
	enemy: "#C7C0C0",
	room: "#C7C9D3",
	item: "#C3CFC3",
	artifact: "#D3C9E0",
	boss: "#C0B8B8",
};

const TYPE_SYMBOL: Record<string, string> = {
	hero: "🧙",
	enemy: "👾",
	room: "🚪",
	item: "🎒",
	artifact: "💎",
	boss: "🐲",
};

interface PlaceholderArtProps {
	cardType: string;
	size?: "sm" | "md" | "lg";
}

const SIZE_CLASS = { sm: "h-16", md: "h-24", lg: "h-40" };

export function PlaceholderArt({ cardType, size = "md" }: PlaceholderArtProps) {
	const bg = TYPE_COLORS[cardType] ?? "#D3D1C7";
	const symbol = TYPE_SYMBOL[cardType] ?? "❓";
	return (
		<div
			className={`flex items-center justify-center w-full rounded ${SIZE_CLASS[size]}`}
			style={{ background: bg, aspectRatio: "3/4" }}
		>
			<span className="text-2xl opacity-60">{symbol}</span>
		</div>
	);
}
