// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@/ui/components/Modal";

afterEach(cleanup);

describe("Modal", () => {
	it("mantém interações internas abertas e fecha pelo botão, Escape ou fundo", () => {
		const onClose = vi.fn();
		render(
			<Modal title="Detalhes" onClose={onClose}>
				<button type="button">Ação interna</button>
			</Modal>,
		);

		const dialog = screen.getByRole("dialog", { name: "Detalhes" });
		fireEvent.click(screen.getByRole("button", { name: "Ação interna" }));
		expect(onClose).not.toHaveBeenCalled();

		fireEvent.keyDown(dialog, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "✕" }));
		expect(onClose).toHaveBeenCalledTimes(2);

		fireEvent.click(dialog.parentElement as HTMLElement);
		expect(onClose).toHaveBeenCalledTimes(3);
	});
});
