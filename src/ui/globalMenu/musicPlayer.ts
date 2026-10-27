import { publicAssetUrl } from "@/ui/publicAssetUrl";

export interface MusicTrack {
	readonly id: string;
	readonly title: string;
	readonly fileName: string;
	readonly url: string;
	readonly format: string;
	readonly mimeType: string;
	readonly sizeBytes: number;
	readonly order: number;
}

export interface MusicManifest {
	readonly version: 1;
	readonly source: "sounds/music";
	readonly tracks: readonly MusicTrack[];
}

export const MUSIC_MANIFEST_URL = publicAssetUrl("generated/music/manifest.json");
export const MUSIC_VOLUME_KEY = "ascensao.heroica.music.volume";
export const MUSIC_TRACK_KEY = "ascensao.heroica.music.track";

export type MusicStatus = "stopped" | "loading" | "playing" | "error";

export interface MusicSnapshot {
	readonly tracks: readonly MusicTrack[];
	readonly selectedId: string | null;
	readonly volume: number;
	readonly status: MusicStatus;
	readonly message: string;
}

function storedValue(key: string): string | null {
	try { return localStorage.getItem(key); } catch { return null; }
}

function remember(key: string, value: string) {
	try { localStorage.setItem(key, value); } catch { /* armazenamento opcional */ }
}

export function isMusicManifest(value: unknown): value is MusicManifest {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<MusicManifest>;
	return candidate.version === 1 && candidate.source === "sounds/music" &&
		Array.isArray(candidate.tracks) && candidate.tracks.every((track) =>
			typeof track.id === "string" && typeof track.title === "string" &&
			typeof track.url === "string" && track.url.startsWith("/generated/music/assets/") &&
			typeof track.mimeType === "string" && typeof track.order === "number");
}

export class MusicPlayer {
	private readonly audio: HTMLAudioElement;
	private readonly listeners = new Set<() => void>();
	private generation = 0;
	private wantsPlayback = false;
	private snapshot: MusicSnapshot;

	constructor(audio: HTMLAudioElement) {
		this.audio = audio;
		const savedVolume = Number(storedValue(MUSIC_VOLUME_KEY));
		const volume = storedValue(MUSIC_VOLUME_KEY) !== null && Number.isFinite(savedVolume)
			? Math.max(0, Math.min(100, savedVolume)) : 50;
		this.audio.volume = volume / 100;
		this.snapshot = { tracks: [], selectedId: null, volume, status: "stopped", message: "" };
	}

	activate() {
		this.audio.addEventListener("ended", this.onEnded);
		this.audio.addEventListener("error", this.onError);
	}

	getSnapshot = () => this.snapshot;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	};
	private update(changes: Partial<MusicSnapshot>) {
		this.snapshot = { ...this.snapshot, ...changes };
		for (const listener of this.listeners) listener();
	}

	setTracks(tracks: readonly MusicTrack[]) {
		const sorted = [...tracks].sort((a, b) => a.order - b.order);
		const previous = this.snapshot.selectedId;
		const saved = storedValue(MUSIC_TRACK_KEY);
		const selectedId = [previous, saved].find((id) => sorted.some((track) => track.id === id)) ?? sorted[0]?.id ?? null;
		this.update({ tracks: sorted, selectedId, message: sorted.length ? "" : "Nenhuma faixa disponível." });
	}

	setVolume(value: number) {
		const volume = Math.max(0, Math.min(100, Math.round(value)));
		this.audio.volume = volume / 100;
		remember(MUSIC_VOLUME_KEY, String(volume));
		this.update({ volume });
	}

	select(id: string) {
		const track = this.snapshot.tracks.find((item) => item.id === id);
		if (!track) return;
		const wasPlaying = this.wantsPlayback;
		this.generation++;
		this.audio.pause();
		this.audio.src = publicAssetUrl(track.url);
		this.audio.load();
		remember(MUSIC_TRACK_KEY, id);
		this.update({ selectedId: id, status: wasPlaying ? "loading" : "stopped", message: "" });
		if (wasPlaying) void this.startPlayback();
	}

	async play() {
		if (!this.snapshot.selectedId) {
			this.update({ status: "error", message: "Nenhuma faixa disponível." });
			return;
		}
		this.wantsPlayback = true;
		const track = this.snapshot.tracks.find((item) => item.id === this.snapshot.selectedId);
		if (!track) return;
		const expectedSrc = publicAssetUrl(track.url);
		if (!this.audio.src || !this.audio.src.endsWith(expectedSrc)) {
			this.audio.src = expectedSrc;
			this.audio.load();
		}
		await this.startPlayback();
	}

	private async startPlayback() {
		const generation = ++this.generation;
		this.update({ status: "loading", message: "Carregando música…" });
		try {
			await this.audio.play();
			if (generation === this.generation && this.wantsPlayback)
				this.update({ status: "playing", message: "" });
		} catch {
			if (generation !== this.generation) return;
			this.wantsPlayback = false;
			this.update({ status: "error", message: "Não foi possível reproduzir esta faixa. Tente novamente." });
		}
	}

	stop() {
		this.generation++;
		this.wantsPlayback = false;
		this.audio.pause();
		this.audio.currentTime = 0;
		this.update({ status: "stopped", message: "" });
	}

	step(delta: number) {
		const { tracks, selectedId } = this.snapshot;
		if (tracks.length < 2) return;
		const index = tracks.findIndex((track) => track.id === selectedId);
		this.select(tracks[(index + delta + tracks.length) % tracks.length].id);
	}

	private onEnded = () => {
		if (!this.wantsPlayback) return;
		if (this.snapshot.tracks.length === 1) {
			this.audio.currentTime = 0;
			void this.startPlayback();
		} else this.step(1);
	};

	private onError = () => {
		if (!this.wantsPlayback) return;
		this.generation++;
		this.wantsPlayback = false;
		this.update({ status: "error", message: "Arquivo de música indisponível ou incompatível." });
	};

	dispose() {
		this.stop();
		this.audio.removeEventListener("ended", this.onEnded);
		this.audio.removeEventListener("error", this.onError);
		this.listeners.clear();
	}
}
