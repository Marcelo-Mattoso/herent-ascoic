import { UI } from "@/ui/theme";

interface ModalProps {
	title: string;
	children: React.ReactNode;
	onClose?: () => void;
	maxWidth?: number;
}

export function Modal({
	title,
	children,
	onClose,
	maxWidth = 520,
}: ModalProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop for modal dismiss
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on inner dialog element
		<div
			className="modal-layer fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.45)" }}
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="modal-dialog relative rounded-xl shadow-xl p-6"
				style={{
					background: UI.panelBg,
					width: "100%",
					maxWidth,
					maxHeight: "90vh",
					overflowY: "auto",
					color: UI.textPrimary,
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.key === "Escape" && onClose?.()}
			>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-medium" style={{ color: UI.textPrimary }}>
						{title}
					</h2>
					{onClose && (
						<button
							type="button"
							onClick={onClose}
							className="modal-close w-7 h-7 flex items-center justify-center rounded hover:opacity-70 text-sm"
							style={{ color: UI.textSecondary }}
						>
							✕
						</button>
					)}
				</div>
				{children}
			</div>
		</div>
	);
}
