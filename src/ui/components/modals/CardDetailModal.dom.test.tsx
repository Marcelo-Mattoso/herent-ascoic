// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CardDetailModal } from "./CardDetailModal";

afterEach(cleanup);

describe("detalhes de equipamento com ação manual", () => {
	it("oferece uso do Arco das Fendas quando a ação foi autorizada pelo motor", () => {
		const onUseItem = vi.fn();
		render(
			<CardDetailModal
				cardId="item_rift_bow"
				cardType="item"
				onClose={vi.fn()}
				onUseItem={onUseItem}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /usar/i }));
		expect(onUseItem).toHaveBeenCalledOnce();
	});
	it("não oferece uso quando o item está indisponível", () => {
		render(<CardDetailModal cardId="item_rift_bow" cardType="item" onClose={vi.fn()} />);
		expect(screen.queryByRole("button", { name: /usar/i })).toBeNull();
	});
	it("oferece Usar no artefato com habilidade manual", () => {
		const onUseArtifact = vi.fn();
		render(<CardDetailModal cardId="artifact_corrupted_forest_heart" cardType="artifact"
			onClose={vi.fn()} onUseArtifact={onUseArtifact} />);
		fireEvent.click(screen.getByRole("button", { name: "Usar" }));
		expect(onUseArtifact).toHaveBeenCalledOnce();
	});

	it("mostra motivo e desabilita o artefato sem alvo válido", () => {
		render(<CardDetailModal cardId="artifact_corrupted_forest_heart" cardType="artifact"
			onClose={vi.fn()} artifactUseReason="É necessário um inimigo vivo envenenado." />);
		expect(screen.getByRole("button", { name: "Usar" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByText(/inimigo vivo envenenado/)).toBeTruthy();
	});

});
