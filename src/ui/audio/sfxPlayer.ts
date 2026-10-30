import { publicAssetUrl } from "@/ui/publicAssetUrl";

export const SFX_NAMES = [
	"dice_launch", "dice_surface", "dice_collision", "dice_tumble", "dice_settle",
	"attack_whoosh", "attack_impact", "attack_defend", "attack_draw",
	"room_reveal", "enemy_reveal", "reward_gain", "heal_gain",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

const VOLUME_KEY = "ascensao.heroica.sfx.volume";
const MUTED_KEY = "ascensao.heroica.sfx.muted";
const MAX_SIMULTANEOUS = 5;
const MIN_INTERVAL_MS: Partial<Record<SfxName, number>> = {
	dice_surface: 80,
	dice_collision: 90,
	dice_tumble: 110,
};

function stored(key: string) {
	try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
	try { localStorage.setItem(key, value); } catch { /* armazenamento opcional */ }
}

export interface SfxSnapshot {
	readonly volume: number;
	readonly muted: boolean;
}

export class SfxPlayer {
	private snapshot: SfxSnapshot;
	private listeners = new Set<() => void>();
	private active = new Map<HTMLAudioElement, number>();
	private lastPlayed = new Map<SfxName, number>();
	private audioFactory: (url: string) => HTMLAudioElement;

	constructor(audioFactory: (url: string) => HTMLAudioElement = (url) => new Audio(url)) {
		const savedVolume = Number(stored(VOLUME_KEY));
		this.snapshot = {
			volume: stored(VOLUME_KEY) !== null && Number.isFinite(savedVolume)
				? Math.max(0, Math.min(100, savedVolume)) : 60,
			muted: stored(MUTED_KEY) === "true",
		};
		this.audioFactory = audioFactory;
	}

	getSnapshot = () => this.snapshot;
	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	};
	private notify() { for (const listener of this.listeners) listener(); }
	private syncActiveVolume() {
		for (const [audio, intensity] of this.active) {
			audio.volume = this.snapshot.muted ? 0 : Math.min(1, Math.max(0, this.snapshot.volume / 100 * intensity));
		}
	}

	setVolume(value: number) {
		const volume = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 60));
		this.snapshot = { ...this.snapshot, volume };
		this.syncActiveVolume();
		save(VOLUME_KEY, String(volume));
		this.notify();
	}
	setMuted(muted: boolean) {
		this.snapshot = { ...this.snapshot, muted };
		this.syncActiveVolume();
		save(MUTED_KEY, String(muted));
		this.notify();
	}
	play(name: SfxName, intensity = 1) {
		if (this.snapshot.muted || this.snapshot.volume <= 0) return;
		const now = performance.now();
		if (now - (this.lastPlayed.get(name) ?? -Infinity) < (MIN_INTERVAL_MS[name] ?? 0)) return;
		if (this.active.size >= MAX_SIMULTANEOUS) return;
		this.lastPlayed.set(name, now);
		const audio = this.audioFactory(publicAssetUrl(`generated/sfx/${name}.wav`));
		audio.volume = Math.min(1, Math.max(0, this.snapshot.volume / 100 * intensity));
		this.active.set(audio, intensity);
		const release = () => {
			audio.removeEventListener("ended", release);
			audio.removeEventListener("error", release);
			this.active.delete(audio);
		};
		audio.addEventListener("ended", release);
		audio.addEventListener("error", release);
		try {
			const playback = audio.play();
			if (playback && typeof playback.catch === "function") void playback.catch(release);
			else release();
		} catch { release(); }
	}
}

export const sfxPlayer = new SfxPlayer();
