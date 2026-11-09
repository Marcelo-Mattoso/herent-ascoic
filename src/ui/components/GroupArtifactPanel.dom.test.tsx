// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerView } from "@/core/projection/playerView";
import { GroupArtifactPanel } from "./GroupArtifactPanel";

afterEach(cleanup);

const withArtifact = (available: boolean): PlayerView => ({
	groupArtifacts: [{ cardId: "artifact_corrupted_forest_heart", carriedBy: null }],
	artifactActions: [{
		artifactId: "artifact_corrupted_forest_heart",
		abilityId: "witch_artifact_corrupted_heart_burst",
		available,
		...(available ? {} : { reason: "É necessário um inimigo vivo envenenado." }),
		requiresTarget: true,
		targets: available ? [{ id: "e1", kind: "enemy", label: "Goblin" }] : [],
	}],
	heroes: [],
}) as unknown as PlayerView;

describe("barra de artefatos compartilhados", () => {
	it("mantém a carta à vista e ativa somente uma habilidade disponível", () => {
		const onUse = vi.fn();
		const onInspect = vi.fn();
		render(<GroupArtifactPanel view={withArtifact(true)}
			onArtifactClick={onInspect} onArtifactUse={onUse} />);
		expect(screen.getAllByTestId("group-artifact")).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: "Usar" }));
		expect(onUse).toHaveBeenCalledWith("artifact_corrupted_forest_heart",
			"witch_artifact_corrupted_heart_burst");
		expect(onInspect).not.toHaveBeenCalled();
	});

	it("bloqueia o uso até existir um inimigo envenenado", () => {
		render(<GroupArtifactPanel view={withArtifact(false)}
			onArtifactClick={vi.fn()} onArtifactUse={vi.fn()} />);
		const button = screen.getByRole("button", { name: "Usar" });
		expect(button.hasAttribute("disabled")).toBe(true);
		expect(button.getAttribute("title")).toMatch(/envenenado/);
	});

	it("não coloca um botão Usar em artefatos automáticos", () => {
		const view = { ...withArtifact(true), groupArtifacts: [{
			cardId: "artifact_ancient_cauldron_spoon", carriedBy: null,
		}], artifactActions: [] } as unknown as PlayerView;
		render(<GroupArtifactPanel view={view}
			onArtifactClick={vi.fn()} onArtifactUse={vi.fn()} />);
		expect(screen.queryByRole("button", { name: "Usar" })).toBeNull();
		expect(screen.getByText("Passivo / reativo")).toBeTruthy();
	});
});
