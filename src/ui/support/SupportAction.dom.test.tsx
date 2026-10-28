// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportAction } from "./SupportAction";
import { supportConfig } from "./supportConfig";

afterEach(cleanup);

describe("SupportAction", () => {
	it("abre o modal e exibe o recebedor sem expor telefone", () => {
		render(<SupportAction />);
		fireEvent.click(screen.getByRole("button", { name: /apoie-nos/i }));
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByText(supportConfig.recipientName)).toBeTruthy();
		expect(screen.queryByText(/telefone|celular|phone number/i)).toBeNull();
		expect(screen.getByText(/O QR Code Pix estará disponível em breve/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "✕" }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("permite copiar o nome do recebedor", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
		render(<SupportAction />);
		fireEvent.click(screen.getByRole("button", { name: /apoie-nos/i }));
		fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(supportConfig.recipientName));
		expect(screen.getByRole("status").textContent).toContain("Copiado");
	});
});
