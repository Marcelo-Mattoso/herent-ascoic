import { beforeEach, describe, expect, it, vi } from "vitest";
import { MUSIC_AUTOPLAY_KEY, MUSIC_TRACK_KEY, MUSIC_VOLUME_KEY, MusicPlayer, type MusicTrack } from "./musicPlayer";

const tracks: MusicTrack[] = [
	{ id: "one", title: "Primeira", fileName: "one.mp3", url: "/generated/music/assets/one.mp3", format: "mp3", mimeType: "audio/mpeg", sizeBytes: 12, order: 0 },
	{ id: "two", title: "Segunda", fileName: "two.mp3", url: "/generated/music/assets/two.mp3", format: "mp3", mimeType: "audio/mpeg", sizeBytes: 13, order: 1 },
];

class FakeAudio extends EventTarget {
	src = "";
	volume = 1;
	currentTime = 0;
	play = vi.fn(async () => {});
	pause = vi.fn();
	load = vi.fn();
}

beforeEach(() => {
	const values = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value); },
	});
});

describe("MusicPlayer", () => {
	it("começa parado com 50%, toca apenas após Play e Stop não avança", async () => {
		const audio = new FakeAudio();
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.activate();
		player.setTracks(tracks);
		expect(player.getSnapshot()).toMatchObject({ selectedId: "one", volume: 50, status: "stopped" });
		expect(audio.play).not.toHaveBeenCalled();
		await player.play();
		expect(player.getSnapshot().status).toBe("playing");
		player.stop();
		expect(audio.currentTime).toBe(0);
		audio.dispatchEvent(new Event("ended"));
		expect(player.getSnapshot()).toMatchObject({ selectedId: "one", status: "stopped" });
		player.dispose();
	});

	it("troca faixas em reprodução, avança no fim natural e persiste preferências", async () => {
		const audio = new FakeAudio();
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.activate();
		player.setTracks(tracks);
		player.setVolume(72);
		await player.play();
		player.step(1);
		await Promise.resolve();
		expect(player.getSnapshot()).toMatchObject({ selectedId: "two", volume: 72, status: "playing" });
		expect(localStorage.getItem(MUSIC_VOLUME_KEY)).toBe("72");
		expect(localStorage.getItem(MUSIC_TRACK_KEY)).toBe("two");
		audio.dispatchEvent(new Event("ended"));
		await Promise.resolve();
		expect(player.getSnapshot().selectedId).toBe("one");
		player.dispose();
	});

	it("ignora rejeição atrasada após Stop e informa falha ativa", async () => {
		const audio = new FakeAudio();
		let rejectPlay: (reason?: unknown) => void = () => {};
		audio.play.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }));
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.setTracks(tracks);
		const pending = player.play();
		player.stop();
		rejectPlay(new Error("blocked"));
		await pending;
		expect(player.getSnapshot().status).toBe("stopped");
		await player.play();
		// Play enquanto toca é idempotente; pare antes de testar uma nova falha.
		await player.play();
		expect(audio.play).toHaveBeenCalledTimes(2);
		player.stop();
		audio.play.mockRejectedValueOnce(new Error("blocked"));
		await player.play();
		expect(player.getSnapshot().status).toBe("error");
		player.dispose();
	});

	it("repete uma única faixa no fim natural e mantém a seleção ao parar", async () => {
		const audio = new FakeAudio();
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.activate();
		player.setTracks([tracks[0]]);
		await player.play();
		audio.currentTime = 34;
		audio.dispatchEvent(new Event("ended"));
		await Promise.resolve();
		expect(audio.currentTime).toBe(0);
		expect(audio.play).toHaveBeenCalledTimes(2);
		expect(player.getSnapshot().selectedId).toBe("one");
		player.stop();
		player.dispose();
	});

	it("inicia automaticamente quando permitido e respeita Stop ao recarregar", async () => {
		const audio = new FakeAudio();
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.setTracks(tracks);
		await player.autoplay();
		expect(audio.play).toHaveBeenCalledTimes(1);
		expect(player.getSnapshot().status).toBe("playing");
		player.stopFromControls();
		expect(localStorage.getItem(MUSIC_AUTOPLAY_KEY)).toBe("off");
		const nextAudio = new FakeAudio();
		const next = new MusicPlayer(nextAudio as unknown as HTMLAudioElement);
		next.setTracks(tracks);
		await next.autoplay();
		expect(nextAudio.play).not.toHaveBeenCalled();
		await next.playFromControls();
		expect(localStorage.getItem(MUSIC_AUTOPLAY_KEY)).toBe("on");
		expect(next.getSnapshot().status).toBe("playing");
		player.dispose();
		next.dispose();
	});

	it("aguarda gesto quando autoplay é bloqueado e diferencia falha de áudio", async () => {
		const audio = new FakeAudio();
		audio.play.mockRejectedValueOnce(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.setTracks(tracks);
		await player.autoplay();
		expect(player.getSnapshot().status).toBe("blocked");
		await player.resumeAutoplay();
		expect(player.getSnapshot().status).toBe("playing");
		expect(audio.play).toHaveBeenCalledTimes(2);
		player.dispose();

		const brokenAudio = new FakeAudio();
		brokenAudio.play.mockRejectedValueOnce(new Error("file error"));
		const brokenPlayer = new MusicPlayer(brokenAudio as unknown as HTMLAudioElement);
		brokenPlayer.setTracks(tracks);
		await brokenPlayer.autoplay();
		expect(brokenPlayer.getSnapshot().status).toBe("error");
		await brokenPlayer.resumeAutoplay();
		expect(brokenAudio.play).toHaveBeenCalledTimes(1);
		brokenPlayer.dispose();
	});

	it("lista vazia desativa reprodução sem tocar no elemento de áudio", async () => {
		const audio = new FakeAudio();
		const player = new MusicPlayer(audio as unknown as HTMLAudioElement);
		player.setTracks([]);
		await player.play();
		expect(audio.play).not.toHaveBeenCalled();
		expect(player.getSnapshot()).toMatchObject({ status: "error", message: "Nenhuma faixa disponível." });
		player.dispose();
	});
});
