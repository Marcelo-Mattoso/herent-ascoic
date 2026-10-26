import { UI } from "@/ui/theme";

type ButtonVariant = "primary" | "secondary" | "danger";

interface ActionButtonProps {
	label: string;
	icon?: string;
	onClick?: () => void;
	disabled?: boolean;
	variant?: ButtonVariant;
	fullWidth?: boolean;
	attention?: boolean;
	title?: string;
}

const VARIANT_STYLES: Record<
	ButtonVariant,
	{ bg: string; text: string; border: string }
> = {
	primary: { bg: "#1D4ED8", text: "#FFFFFF", border: "#1E40AF" },
	secondary: {
		bg: UI.subpanelBg,
		text: UI.textSecondary,
		border: UI.borderStrong,
	},
	danger: { bg: UI.danger.bg, text: UI.danger.text, border: "#F5C4C4" },
};

export function ActionButton({
	label,
	icon,
	onClick,
	disabled,
	variant = "secondary",
	fullWidth,
	attention,
	title,
}: ActionButtonProps) {
	const style = VARIANT_STYLES[variant];
	const showAttention = !!attention && !disabled;
	return (
		<button
			type="button"
			onClick={(event) => { event.stopPropagation(); onClick?.(); }}
			disabled={disabled}
			className={`action-button flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity ${fullWidth ? "w-full" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-80 cursor-pointer"}${showAttention ? " click-attention" : ""}`}
			title={title}
			style={{
				background: style.bg,
				color: style.text,
				border: `1px solid ${style.border}`,
			}}
		>
			{icon && <span>{icon}</span>}
			{label}
		</button>
	);
}
