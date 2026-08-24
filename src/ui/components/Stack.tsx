import { UI } from "@/ui/theme";

interface StackProps {
	name: string;
	count: number;
	discardCount?: number;
	size?: "compact" | "board";
	imageUrl?: string;
}

export function Stack({
	name,
	count,
	discardCount = 0,
	size = "compact",
	imageUrl,
}: StackProps) {
	const card =
		size === "board"
			? {
					shellWidth: 134,
					shellHeight: 188,
					width: 124,
					height: 172,
					offset: 4,
					radius: 10,
					label: 14,
					count: 12,
				}
			: {
					shellWidth: 29,
					shellHeight: 35,
					width: 21,
					height: 27,
					offset: 2,
					radius: 2,
					label: 9,
					count: 9,
				};
	const imageStyle = imageUrl
		? {
				backgroundImage: `url("${imageUrl}")`,
				backgroundPosition: "center",
				backgroundRepeat: "no-repeat",
				backgroundSize: "cover",
			}
		: {};

	return (
		<div className="flex flex-col items-center gap-1" style={{ minWidth: 92 }}>
			<div
				className="relative"
				style={{
					width: card.shellWidth,
					height: card.shellHeight,
					filter:
						size === "board"
							? "drop-shadow(0 8px 8px rgba(0, 0, 0, 0.34)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))"
							: undefined,
				}}
			>
				<div
					style={{
						position: "absolute",
						top: card.offset * 2,
						left: card.offset * 2,
						width: card.width,
						height: card.height,
						borderRadius: card.radius,
						background: "#5F5E5A",
						...imageStyle,
						filter: imageUrl ? "brightness(0.58)" : undefined,
						boxShadow:
							size === "board" ? "0 4px 6px rgba(0, 0, 0, 0.28)" : undefined,
					}}
				/>
				<div
					style={{
						position: "absolute",
						top: card.offset,
						left: card.offset,
						width: card.width,
						height: card.height,
						borderRadius: card.radius,
						background: "#888780",
						...imageStyle,
						filter: imageUrl ? "brightness(0.76)" : undefined,
					}}
				/>
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: card.width,
						height: card.height,
						borderRadius: card.radius,
						background: "#B4B2A9",
						...imageStyle,
						border:
							size === "board" ? `1px solid ${UI.borderStrong}` : undefined,
						boxShadow:
							size === "board"
								? "inset 0 0 0 1px rgba(255,255,255,0.22)"
								: undefined,
					}}
				/>
			</div>
			<p
				className="text-center leading-tight"
				style={{
					color: UI.textSecondary,
					fontSize: card.label,
					fontWeight: size === "board" ? 700 : 400,
					textTransform: size === "board" ? "uppercase" : undefined,
					textShadow:
						size === "board" ? "0 2px 5px rgba(0, 0, 0, 0.45)" : undefined,
				}}
			>
				{name}
			</p>
			<p style={{ color: UI.textTertiary, fontSize: card.count }}>
				{count}·{discardCount}
			</p>
		</div>
	);
}
