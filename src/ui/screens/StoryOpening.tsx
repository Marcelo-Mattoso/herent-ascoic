import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { translate } from "@/i18n";
import { getMusicPlayer } from "@/ui/globalMenu/musicPlayer";
import type { StoryOpeningData } from "@/ui/openings/registry";
import "./StoryOpening.css";

interface StoryOpeningProps {
	readonly opening: StoryOpeningData;
	readonly onComplete: () => void;
}

export function StoryOpening({ opening, onComplete }: StoryOpeningProps) {
	useTranslation();
	const [player] = useState(getMusicPlayer);
	const music = useSyncExternalStore(player.subscribe, player.getSnapshot);
	const [index, setIndex] = useState(0);
	const [imageState, setImageState] = useState<{ url: string; status: "loading" | "ready" | "error" }>({ url: "", status: "loading" });
	const completed = useRef(false);
	const scene = opening.scenes[index]!;
	const last = index === opening.scenes.length - 1;
	const imageStatus = imageState.url === scene.imageUrl ? imageState.status : "loading";
	const musicPlaying = music.opening === opening.musicFileName && (music.status === "loading" || music.status === "playing");


	useEffect(() => {
		let active = true;
		const image = new Image();
		image.onload = () => {
			if (!active) return;
			setImageState({ url: scene.imageUrl, status: "ready" });
			const following = opening.scenes[index + 1];
			if (following) {
				const preload = new Image();
				preload.src = following.imageUrl;
			}
		};
		image.onerror = () => { if (active) setImageState({ url: scene.imageUrl, status: "error" }); };
		setImageState({ url: scene.imageUrl, status: "loading" });
		image.src = scene.imageUrl;
		return () => { active = false; };
	}, [index, opening, scene.imageUrl]);

	function finish() {
		if (completed.current) return;
		completed.current = true;
		onComplete();
	}

	return (
		<main className="story-opening" data-scene-id={scene.id}>
			<div className="story-opening__shell">
				<header className="story-opening__header">
					<h1>{translate(opening.titleKey)}</h1>
					<span className="story-opening__progress">
						{index + 1} / {opening.scenes.length}
					</span>
				</header>
				{opening.musicFileName && <div className="story-opening__audio" role="group" aria-label={translate("game:opening.audio.title")}>
					<span className="story-opening__audio-title">{translate("game:opening.audio.title")}</span>
					<button type="button" disabled={!music.openingAvailable} onClick={() => musicPlaying ? player.pauseOpening() : void player.playOpening()}>
						{translate(musicPlaying ? "game:opening.audio.pause" : "game:opening.audio.play")}
					</button>
					<label className="story-opening__volume">{translate("game:opening.audio.volume")} {music.volume}%
						<input type="range" min="0" max="100" value={music.volume} aria-label={translate("game:opening.audio.volume")} onChange={(event) => player.setVolume(Number(event.target.value))}/>
					</label>
					{music.opening === opening.musicFileName && music.status === "blocked" && <span role="status">{translate("game:opening.audio.blocked")}</span>}
					{!music.openingAvailable && <span role="status">{translate("game:opening.audio.unavailable")}</span>}
				</div>}
				<div className="story-opening__stage" style={{ "--opening-transition": `${scene.transitionMs}ms` } as CSSProperties}>
					{imageStatus === "ready" ? (
						<img key={scene.id} className={`story-opening__image story-opening__image--${scene.effect}`} src={scene.imageUrl} alt="" />
					) : (
						<p className="story-opening__placeholder" role="status">
							{translate(imageStatus === "error" ? "game:opening.imageUnavailable" : "game:opening.loading")}
						</p>
					)}
				</div>
				<p className="story-opening__narration" aria-live="polite">{translate(scene.textKey)}</p>
				<nav className="story-opening__controls" aria-label={translate(opening.titleKey)}>
					{!last && <button type="button" className="story-opening__skip" onClick={finish}>{translate("game:opening.controls.skip")}</button>}
					<div className="story-opening__steps">
						{index > 0 && <button type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))}>{translate("game:opening.controls.previous")}</button>}
						{last
							? <button type="button" className="story-opening__primary" onClick={finish}>{translate("game:opening.controls.start")}</button>
							: <button type="button" className="story-opening__primary" onClick={() => setIndex((current) => Math.min(opening.scenes.length - 1, current + 1))}>{translate("game:opening.controls.next")}</button>}
					</div>
				</nav>
			</div>
		</main>
	);
}
