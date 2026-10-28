import { useState } from "react";
import { createPortal } from "react-dom";
import { translate } from "@/i18n";
import { Modal } from "@/ui/components/Modal";
import { publicAssetUrl } from "@/ui/publicAssetUrl";
import { supportConfig } from "./supportConfig";
import "./SupportAction.css";

function isTrustedPaypalUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" &&
			(url.hostname === "paypal.me" || url.hostname === "www.paypal.me" ||
				url.hostname === "paypal.com" || url.hostname.endsWith(".paypal.com"));
	} catch {
		return false;
	}
}

export function SupportAction() {
	const [open, setOpen] = useState(false);
	const [copyStatus, setCopyStatus] = useState("");
	const paypalReady = isTrustedPaypalUrl(supportConfig.paypalUrl);
	const pixReady = Boolean(supportConfig.pixCopyPaste && supportConfig.pixQrImagePath);

	async function copy(value: string, field: string) {
		try {
			await navigator.clipboard.writeText(value);
			setCopyStatus(field);
		} catch {
			setCopyStatus("error");
		}
	}

	function copyButton(value: string, field: string) {
		return (
			<button type="button" className="support-action__copy" onClick={() => void copy(value, field)}>
				{translate(copyStatus === field ? "common:support.copied" : "common:support.copy")}
			</button>
		);
	}

	return (
		<>
			<button type="button" className="support-action__trigger" onClick={() => { setCopyStatus(""); setOpen(true); }}>
				♥ {translate("common:support.trigger")}
			</button>
			{open && createPortal(
				<div className="support-action__portal">
					<Modal title={translate("common:support.title")} maxWidth={560} onClose={() => setOpen(false)}>
						<div className="support-action__content">
							<p>{translate("common:support.description")}</p>
							<p>{translate("common:support.universe")}</p>
							<div className="support-action__methods">
								<section aria-label={translate("common:support.pixTitle")}>
									<h3>{translate("common:support.pixTitle")}</h3>
									{pixReady ? (
										<div className="support-action__qr">
											<img src={publicAssetUrl(supportConfig.pixQrImagePath)} alt={translate("common:support.qrAlt")} width="180" height="180" />
										</div>
									) : <p className="support-action__pending">{translate("common:support.pixPending")}</p>}
									{supportConfig.pixCopyPaste && (
										<div className="support-action__row">
											<label htmlFor="support-pix-code">{translate("common:support.pixCode")}</label>
											<textarea id="support-pix-code" readOnly rows={2} value={supportConfig.pixCopyPaste} onFocus={(event) => event.currentTarget.select()} />
											{copyButton(supportConfig.pixCopyPaste, "pix")}
										</div>
									)}
									<div className="support-action__row">
										<span>{translate("common:support.recipient")}</span>
										<code>{supportConfig.recipientName}</code>
										{copyButton(supportConfig.recipientName, "recipient")}
									</div>
								</section>
								<section aria-label="PayPal">
									<h3>PayPal</h3>
									{paypalReady ? (
										<a className="support-action__paypal" href={supportConfig.paypalUrl} target="_blank" rel="noopener noreferrer">
											{translate("common:support.paypalLink")}
										</a>
									) : <p className="support-action__pending">{translate("common:support.paypalPending")}</p>}
								</section>
							</div>
							<p className="support-action__status" role="status" aria-live="polite">
								{copyStatus === "error" ? translate("common:support.copyError") : copyStatus ? translate("common:support.copySuccess") : translate("common:support.voluntary")}
							</p>
						</div>
					</Modal>
				</div>,
				document.body,
			)}
		</>
	);
}
