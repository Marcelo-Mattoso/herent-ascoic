import { AUDIO_CONFIG } from "@/config/audio";
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
export const MUSIC_AUTOPLAY_KEY = "ascensao.heroica.music.autoplay";
export type EndingTrack = "victory" | "defeat";
const ENDING_FILES: Record<EndingTrack, string> = {
	victory: "victory.mp3",
	defeat: "game-over.mp3",
};

export type MusicStatus = "stopped" | "loading" | "playing" | "blocked" | "error";

export interface MusicSnapshot {
	readonly tracks: readonly MusicTrack[];
	readonly selectedId: string | null;
	readonly volume: number;
	readonly status: MusicStatus;
	readonly message: string;
	readonly ending: EndingTrack | null;
	readonly endingAvailable: boolean;
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
	private autoplayEnabled = storedValue(MUSIC_AUTOPLAY_KEY) !== "off";
	private ending: EndingTrack | null = null;
	private endingTrack: MusicTrack | null = null;
	private endingResume = false;
	private allTracks: readonly MusicTrack[] = [];
	private snapshot: MusicSnapshot;

	constructor(audio: HTMLAudioElement) {
		this.audio = audio;
		const savedVolume = Number(storedValue(MUSIC_VOLUME_KEY));
		const volume = storedValue(MUSIC_VOLUME_KEY) !== null && Number.isFinite(savedVolume)
			? Math.max(0, Math.min(100, savedVolume)) : 50;
		this.audio.volume = volume / 100;
		this.snapshot = { tracks: [], selectedId: null, volume, status: "stopped", message: "", ending: null, endingAvailable: false };
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
		this.allTracks = sorted;
		const playlist = sorted.filter((track) => !Object.values(ENDING_FILES).includes(track.fileName.toLowerCase()));
		const previous = this.snapshot.selectedId;
		const saved = storedValue(MUSIC_TRACK_KEY);
		const selectedId = [previous, saved].find((id) => playlist.some((track) => track.id === id)) ?? playlist[0]?.id ?? null;
		this.endingTrack = this.ending ? this.findEndingTrack(this.ending) : null;
		this.update({ tracks: playlist, selectedId, endingAvailable: !!this.endingTrack, message: playlist.length ? "" : "Nenhuma faixa disponível." });
		if (this.ending && this.endingTrack && this.autoplayEnabled) void this.play();
	}

	private findEndingTrack(ending: EndingTrack) {
		return this.allTracks.find((track) => track.fileName.toLowerCase() === ENDING_FILES[ending]) ?? null;
	}

	enterEnding(ending: EndingTrack) {
		if (this.ending === ending) return;
		this.endingResume = this.wantsPlayback || this.snapshot.status === "blocked";
		this.generation++;
		this.wantsPlayback = false;
		this.audio.pause();
		this.audio.currentTime = 0;
		this.ending = ending;
		this.endingTrack = this.findEndingTrack(ending);
		this.update({ ending, endingAvailable: !!this.endingTrack, status: "stopped", message: "" });
		if (this.endingTrack && this.autoplayEnabled) void this.play();
	}

	leaveEnding(ending: EndingTrack) {
		if (this.ending !== ending) return;
		this.generation++;
		this.wantsPlayback = false;
		this.audio.pause();
		this.ending = null;
		this.endingTrack = null;
		const resume = this.endingResume && this.autoplayEnabled;
		this.endingResume = false;
		this.update({ ending: null, endingAvailable: false, status: "stopped", message: "" });
		if (resume) void this.play();
	}

	setVolume(value: number) {
		const volume = Math.max(0, Math.min(100, Math.round(value)));
		this.audio.volume = volume / 100;
		remember(MUSIC_VOLUME_KEY, String(volume));
		this.update({ volume });
	}

	select(id: string) {
		if (this.ending) return;
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

	async autoplay() {
		if (this.autoplayEnabled && this.snapshot.selectedId && this.snapshot.status === "stopped")
			await this.play();
	}

	async resumeAutoplay() {
		if (this.autoplayEnabled && this.snapshot.status === "blocked")
			await this.play();
	}

	async playFromControls() {
		this.autoplayEnabled = true;
		remember(MUSIC_AUTOPLAY_KEY, "on");
		await this.play();
	}

	stopFromControls() {
		this.autoplayEnabled = false;
		remember(MUSIC_AUTOPLAY_KEY, "off");
		this.stop();
	}

	async play() {
		if (!AUDIO_CONFIG.music.enabled) return;
		if (this.wantsPlayback && (this.snapshot.status === "loading" || this.snapshot.status === "playing")) return;
		if (this.ending && !this.endingTrack) return;
		if (!this.ending && !this.snapshot.selectedId) {
			this.update({ status: "error", message: "Nenhuma faixa disponível." });
			return;
		}
		this.wantsPlayback = true;
		const track = this.endingTrack ?? this.snapshot.tracks.find((item) => item.id === this.snapshot.selectedId);
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
		} catch (error) {
			if (generation !== this.generation) return;
			if (error && typeof error === "object" && "name" in error && error.name === "NotAllowedError") {
				this.update({ status: "blocked", message: "" });
				return;
			}
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
		if (this.ending) return;
		const { tracks, selectedId } = this.snapshot;
		if (tracks.length < 2) return;
		const index = tracks.findIndex((track) => track.id === selectedId);
		this.select(tracks[(index + delta + tracks.length) % tracks.length].id);
	}

	private onEnded = () => {
		if (!this.wantsPlayback) return;
		if (this.ending) {
			this.wantsPlayback = false;
			this.update({ status: "stopped", message: "" });
			return;
		}
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

let sharedMusicPlayer: MusicPlayer | null = null;
export function getMusicPlayer() {
	sharedMusicPlayer ??= new MusicPlayer(document.createElement("audio"));
	return sharedMusicPlayer;
}
