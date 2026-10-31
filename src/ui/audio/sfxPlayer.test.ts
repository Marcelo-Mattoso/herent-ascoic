// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_CONFIG } from "@/config/audio";
import { SfxPlayer } from "./sfxPlayer";

beforeEach(() => localStorage.clear());

describe("efeitos sonoros", () => {
	it("bloqueia todos os efeitos pela configuração, mesmo com preferências antigas ativadas", () => {
		localStorage.setItem("ascensao.heroica.sfx.muted", "false");
		localStorage.setItem("ascensao.heroica.sfx.volume", "100");
		const factory = vi.fn((_url: string) => ({ play: vi.fn() }) as unknown as HTMLAudioElement);
		const player = new SfxPlayer(factory);
		expect(AUDIO_CONFIG.music.enabled).toBe(true);
		expect(AUDIO_CONFIG.sfx.enabled).toBe(false);
		player.setMuted(false);
		player.setVolume(100);
		player.play("dice_launch");
		player.play("attack_impact");
		player.play("room_reveal");
		expect(factory).not.toHaveBeenCalled();
	});

	it("usa volume independente, persiste silêncio e tolera bloqueio de reprodução", async () => {
		const audio = {
			volume: 0, play: vi.fn().mockRejectedValue(new Error("autoplay blocked")),
			addEventListener: vi.fn(), removeEventListener: vi.fn(),
		};
		const factory = vi.fn((_url: string) => audio as unknown as HTMLAudioElement);
		const player = new SfxPlayer(factory, true);
		expect(player.getSnapshot().volume).toBe(60);
		player.setVolume(25);
		player.play("dice_launch");
		expect(audio.volume).toBe(0.25);
		expect(factory.mock.calls[0]?.[0]).toContain("generated/sfx/dice_launch.wav");
		await Promise.resolve();
		player.setMuted(true);
		player.play("attack_impact");
		expect(factory).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem("ascensao.heroica.sfx.volume")).toBe("25");
		expect(localStorage.getItem("ascensao.heroica.sfx.muted")).toBe("true");
		expect(new SfxPlayer(factory, true).getSnapshot()).toEqual({ volume: 25, muted: true });
	});

	it("atualiza o volume de um efeito que ainda está tocando", () => {
		const audio = { volume: 0, play: vi.fn().mockResolvedValue(undefined), addEventListener: vi.fn(), removeEventListener: vi.fn() };
		const player = new SfxPlayer(() => audio as unknown as HTMLAudioElement, true);
		player.play("dice_launch", 0.5);
		expect(audio.volume).toBe(0.3);
		player.setVolume(80);
		expect(audio.volume).toBe(0.4);
		player.setMuted(true);
		expect(audio.volume).toBe(0);
		player.setMuted(false);
		expect(audio.volume).toBe(0.4);
	});
});
