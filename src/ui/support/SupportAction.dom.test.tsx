// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportAction } from "./SupportAction";
import { supportConfig } from "./supportConfig";

afterEach(cleanup);

describe("SupportAction", () => {
	it("abre o modal com QR e Pix copia e cola sem expor telefone", () => {
		render(<SupportAction />);
		fireEvent.click(screen.getByRole("button", { name: /apoie-nos/i }));
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByText(supportConfig.recipientName)).toBeTruthy();
		expect(screen.queryByText(/telefone|celular|phone number/i)).toBeNull();
		const qr = screen.getByRole("img", { name: "QR Code de pagamento Pix" });
		expect(qr.getAttribute("src")).toContain("support/pix-c6-ascensao-heroica.svg");
		expect((screen.getByLabelText("Pix copia e cola") as HTMLTextAreaElement).value).toBe(supportConfig.pixCopyPaste);
		fireEvent.click(screen.getByRole("button", { name: "✕" }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("copia o nome e o Pix separadamente", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		render(<SupportAction />);
		fireEvent.click(screen.getByRole("button", { name: /apoie-nos/i }));

		const nameRow = screen.getByText(supportConfig.recipientName).closest(".support-action__row");
		expect(nameRow).not.toBeNull();
		fireEvent.click(within(nameRow as HTMLElement).getByRole("button", { name: "Copiar" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(supportConfig.recipientName));

		const pixRow = screen.getByLabelText("Pix copia e cola").closest(".support-action__row");
		expect(pixRow).not.toBeNull();
		fireEvent.click(within(pixRow as HTMLElement).getByRole("button", { name: "Copiar" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(supportConfig.pixCopyPaste));
		expect(screen.getByRole("status").textContent).toContain("Copiado");
	});
});
