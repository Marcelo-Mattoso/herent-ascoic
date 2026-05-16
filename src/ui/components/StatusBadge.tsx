import { UI } from "@/ui/theme";

type BadgeVariant = "success" | "info" | "danger" | "neutral";

interface StatusBadgeProps {
	label: string;
	variant?: BadgeVariant;
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string }> = {
	success: UI.success,
	info: UI.info,
	danger: UI.danger,
	neutral: { bg: UI.subpanelBg, text: UI.textSecondary },
};

export function StatusBadge({ label, variant = "neutral" }: StatusBadgeProps) {
	const style = VARIANT_STYLES[variant];
	return (
		<span
			className="inline-block px-2 py-0.5 rounded-full text-xs"
			style={{ background: style.bg, color: style.text }}
		>
			{label}
		</span>
	);
}
