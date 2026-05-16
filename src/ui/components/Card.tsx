import { UI } from "@/ui/theme";
import { PlaceholderArt } from "./PlaceholderArt";

export type CardType = "hero" | "enemy" | "room" | "item" | "artifact" | "boss";

interface CardProps {
	cardType: CardType;
	name: string;
	selected?: boolean;
	onClick?: () => void;
	artSize?: "sm" | "md" | "lg";
	children?: React.ReactNode;
	compact?: boolean;
}

export function Card({
	cardType,
	name,
	selected,
	onClick,
	artSize = "md",
	children,
	compact,
}: CardProps) {
	return (
		<button
			type="button"
			className={`rounded-lg overflow-hidden transition-all text-left ${compact ? "p-2" : "p-3"} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
			style={{
				background: UI.panelBg,
				border: `1.5px solid ${selected ? "#185FA5" : UI.border}`,
				boxShadow: selected ? "0 0 0 2px #E6F1FB" : undefined,
				width: "100%",
			}}
			onClick={onClick}
		>
			{!compact && <PlaceholderArt cardType={cardType} size={artSize} />}
			<div className={compact ? "" : "mt-2"}>
				<p
					className="text-xs font-medium truncate"
					style={{ color: UI.textSecondary }}
				>
					{name}
				</p>
				{children && <div className="mt-1 space-y-0.5">{children}</div>}
			</div>
		</button>
	);
}
