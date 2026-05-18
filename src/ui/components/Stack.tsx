import { UI } from "@/ui/theme";

interface StackProps {
	name: string;
	count: number;
	discardCount?: number;
}

export function Stack({ name, count, discardCount = 0 }: StackProps) {
	return (
		<div className="flex flex-col items-center gap-1">
			<div className="relative" style={{ width: 29, height: 35 }}>
				<div
					style={{
						position: "absolute",
						top: 4,
						left: 4,
						width: 21,
						height: 27,
						borderRadius: 2,
						background: "#5F5E5A",
					}}
				/>
				<div
					style={{
						position: "absolute",
						top: 2,
						left: 2,
						width: 21,
						height: 27,
						borderRadius: 2,
						background: "#888780",
					}}
				/>
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: 21,
						height: 27,
						borderRadius: 2,
						background: "#B4B2A9",
					}}
				/>
			</div>
			<p
				className="text-center leading-tight"
				style={{ color: UI.textSecondary, fontSize: 9 }}
			>
				{name}
			</p>
			<p style={{ color: UI.textTertiary, fontSize: 9 }}>
				{count}·{discardCount}
			</p>
		</div>
	);
}
