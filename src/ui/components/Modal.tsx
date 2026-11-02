import { useEffect, useRef } from "react";
import { UI } from "@/ui/theme";
import { translate } from "@/i18n";

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
	const dialogRef = useRef<HTMLDivElement>(null);
	const layerRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		dialogRef.current?.focus({ preventScroll: true });
		return () => {
			if (previous?.isConnected) previous.focus({ preventScroll: true });
		};
	}, []);
	useEffect(() => {
		if (!onClose) return;
		const onEscape = (event: KeyboardEvent) => {
			const layers = document.querySelectorAll(".modal-layer");
			if (event.key !== "Escape" || layers.item(layers.length - 1) !== layerRef.current) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			onClose();
		};
		document.addEventListener("keydown", onEscape, true);
		return () => document.removeEventListener("keydown", onEscape, true);
	}, [onClose]);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay backdrop for modal dismiss
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled by document-level listener
		<div
			ref={layerRef}
			className="modal-layer fixed inset-0 z-50 flex items-center justify-center"
			style={{ background: "rgba(0,0,0,0.45)" }}
			onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
		>
			<div
				ref={dialogRef}
				tabIndex={-1}
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
			>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-medium" style={{ color: UI.textPrimary }}>
						{title}
					</h2>
					{onClose && (
						<div className="modal-close-controls">
							<small className="modal-escape-hint">{translate("game:components.modal.escapeHint")}</small>
							<button
								type="button"
								onClick={onClose}
								className="modal-close w-7 h-7 flex items-center justify-center rounded hover:opacity-70 text-sm"
							style={{ color: UI.textSecondary }}
						>
								✕
							</button>
						</div>
					)}
				</div>
				{children}
			</div>
		</div>
	);
}
