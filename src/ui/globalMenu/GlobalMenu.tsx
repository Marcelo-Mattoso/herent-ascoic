import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { changeLocale, i18n, translate } from "@/i18n";
import { publishedLocales } from "@/i18n/registry";
import { AUDIO_CONFIG } from "@/config/audio";
import { publicAssetUrl } from "@/ui/publicAssetUrl";
import { isMusicManifest, MUSIC_MANIFEST_URL, MusicPlayer } from "./musicPlayer";
import { sfxPlayer } from "@/ui/audio/sfxPlayer";

const MANUAL_URL = publicAssetUrl("rules/ascensao-heroica-manual.pdf");
const MUSIC_MESSAGES: Record<string, string> = {
	"Nenhuma faixa disponível.": "common:globalMenu.globalMenu.noTracks",
	"Carregando música…": "common:globalMenu.globalMenu.musicLoading",
	"Não foi possível reproduzir esta faixa. Tente novamente.": "common:globalMenu.globalMenu.musicPlayError",
	"Arquivo de música indisponível ou incompatível.": "common:globalMenu.globalMenu.musicFileError",
};

export function GlobalMenu() {
	useTranslation();
	const [player] = useState(() => new MusicPlayer(document.createElement("audio")));
	const music = useSyncExternalStore(player.subscribe, player.getSnapshot);
	const sfx = useSyncExternalStore(sfxPlayer.subscribe, sfxPlayer.getSnapshot);
	const [open, setOpen] = useState(false);
	const [catalogError, setCatalogError] = useState("");
	const [localeLoading, setLocaleLoading] = useState(false);
	const [localeError, setLocaleError] = useState("");
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLElement>(null);

	useEffect(() => {
		player.activate();
		const controller = new AbortController();
		fetch(MUSIC_MANIFEST_URL, { signal: controller.signal })
			.then((response) => {
				if (!response.ok) throw new Error("Manifesto indisponível");
				return response.json();
			})
			.then((data: unknown) => {
				if (!isMusicManifest(data)) throw new Error("Manifesto inválido");
				player.setTracks(data.tracks);
				void player.autoplay();
			})
			.catch(() => {
				if (!controller.signal.aborted)
					setCatalogError("common:globalMenu.globalMenu.catalogError");
			});
		function resumeOnGesture(event: Event) {
			if (event.target instanceof Element && event.target.closest(".global-menu__music-prompt")) return;
			void player.resumeAutoplay();
		}
		function resumeOnKeyboard(event: KeyboardEvent) {
			if (!event.repeat && (event.key === "Enter" || event.key === " ")) resumeOnGesture(event);
		}
		document.addEventListener("pointerdown", resumeOnGesture, true);
		document.addEventListener("pointerup", resumeOnGesture, true);
		document.addEventListener("keydown", resumeOnKeyboard, true);
		return () => {
			controller.abort();
			document.removeEventListener("pointerdown", resumeOnGesture, true);
			document.removeEventListener("pointerup", resumeOnGesture, true);
			document.removeEventListener("keydown", resumeOnKeyboard, true);
			player.dispose();
		};
	}, [player]);

	useEffect(() => {
		if (!open) return;
		panelRef.current?.querySelector<HTMLElement>("button, a, select, input")?.focus();
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				event.preventDefault();
				setOpen(false);
				buttonRef.current?.focus();
			}
			if (event.key !== "Tab" || !panelRef.current) return;
			const focusables = [buttonRef.current, ...panelRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], select:not(:disabled), input:not(:disabled)")].filter((item): item is HTMLElement => !!item);
			const first = focusables[0];
			const last = focusables.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault(); last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault(); first?.focus();
			}
		}
		function onPointerDown(event: PointerEvent) {
			const target = event.target as Node;
			if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
		}
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("pointerdown", onPointerDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("pointerdown", onPointerDown);
		};
	}, [open]);

	const selected = music.tracks.find((track) => track.id === music.selectedId);
	async function selectLocale(code: string) {
		setLocaleLoading(true);
		setLocaleError("");
		const changed = await changeLocale(code);
		if (!changed) setLocaleError(translate("common:language.loadError"));
		setLocaleLoading(false);
	}
	return createPortal(
		<div className="global-menu" data-global-menu>
			<button ref={buttonRef} type="button" className="global-menu__toggle" aria-label={translate(open ? "common:globalMenu.globalMenu.toggleClose" : "common:globalMenu.globalMenu.toggleOpen")} aria-expanded={open} aria-controls="global-menu-panel" onClick={() => setOpen((value) => !value)}>
				<span aria-hidden="true">{open ? "×" : "☰"}</span>
			</button>
			{music.status === "blocked" && <button type="button" className="global-menu__music-prompt" onClick={() => void player.playFromControls()}>{translate("common:globalMenu.globalMenu.startMusic")}</button>}
			{open && <section ref={panelRef} id="global-menu-panel" className="global-menu__panel" aria-label={translate("common:globalMenu.globalMenu.ariaLabel001")}>
				<div className="global-menu__heading"><span>{translate("common:globalMenu.globalMenu.text002")}</span><button type="button" aria-label={translate("common:globalMenu.globalMenu.ariaLabel003")} onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>×</button></div>
				<div className="global-menu__section">
					<h2>{translate("common:globalMenu.globalMenu.text004")}</h2>
					<p className="global-menu__track" aria-live="polite">{selected ? `${music.tracks.findIndex((track) => track.id === selected.id) + 1} / ${music.tracks.length} · ${selected.title}` : translate("common:globalMenu.globalMenu.noTrack")}</p>
					{music.tracks.length > 0 && <label className="global-menu__field">{translate("common:globalMenu.globalMenu.text005")}{" "}<select value={music.selectedId ?? ""} onChange={(event) => player.select(event.target.value)}>
							{music.tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
						</select>
					</label>}
					<div className="global-menu__controls">
						<button type="button" aria-label={translate("common:globalMenu.globalMenu.ariaLabel006")} disabled={music.tracks.length < 2} onClick={() => player.step(-1)}>◀|</button>
						<button type="button" disabled={!selected || music.status === "loading"} onClick={() => void player.playFromControls()}>{translate("common:globalMenu.globalMenu.text007")}</button>
						<button type="button" disabled={music.status === "stopped"} onClick={() => player.stopFromControls()}>{translate("common:globalMenu.globalMenu.text008")}</button>
						<button type="button" aria-label={translate("common:globalMenu.globalMenu.ariaLabel009")} disabled={music.tracks.length < 2} onClick={() => player.step(1)}>|▶</button>
					</div>
					<label className="global-menu__field" htmlFor="global-music-volume">{translate("common:globalMenu.globalMenu.text010")}{" "}{music.volume}%
						<input id="global-music-volume" type="range" min="0" max="100" value={music.volume} onChange={(event) => player.setVolume(Number(event.target.value))} />
					</label>
					<p className="global-menu__status" role="status">{catalogError ? translate(catalogError) : music.message ? translate(MUSIC_MESSAGES[music.message] ?? "common:globalMenu.globalMenu.musicError") : music.status === "playing" ? translate("common:globalMenu.globalMenu.playing") : music.status === "blocked" ? translate("common:globalMenu.globalMenu.autoplayBlocked") : music.status === "stopped" ? translate("common:globalMenu.globalMenu.stopped") : ""}</p>
				</div>
				<div className="global-menu__section">
					<h2>{translate("common:globalMenu.globalMenu.sfxTitle")}</h2>
					{!AUDIO_CONFIG.sfx.enabled && <p className="global-menu__status" role="status">{translate("common:globalMenu.globalMenu.sfxDisabled")}</p>}
					<label className="global-menu__field" htmlFor="global-sfx-volume">{translate("common:globalMenu.globalMenu.sfxVolume")} {sfx.volume}%
						<input id="global-sfx-volume" type="range" min="0" max="100" disabled={!AUDIO_CONFIG.sfx.enabled} value={sfx.volume} onChange={(event) => sfxPlayer.setVolume(Number(event.target.value))} />
					</label>
					<button type="button" disabled={!AUDIO_CONFIG.sfx.enabled} onClick={() => sfxPlayer.setMuted(!sfx.muted)}>
						{translate(sfx.muted ? "common:globalMenu.globalMenu.sfxUnmute" : "common:globalMenu.globalMenu.sfxMute")}
					</button>
				</div>
				<div className="global-menu__section">
					<h2>{translate("common:globalMenu.globalMenu.text011")}</h2>
					<div className="global-menu__links">
						<a href={MANUAL_URL} target="_blank" rel="noopener noreferrer">{translate("common:globalMenu.globalMenu.text012")}</a>
						<a href={MANUAL_URL} download="ascensao-heroica-manual.pdf">{translate("common:globalMenu.globalMenu.text013")}</a>
					</div>
				</div>
				<div className="global-menu__section">
					<h2>{translate("common:language.title")}</h2>
					<label className="global-menu__field" htmlFor="global-language-select">{translate("common:language.select")}
						<select id="global-language-select" value={i18n.language} disabled={localeLoading} onChange={(event) => void selectLocale(event.target.value)}>
							{publishedLocales().map((locale) => <option key={locale.code} value={locale.code}>{locale.nativeName}</option>)}
						</select>
					</label>
					{localeLoading && <p className="global-menu__status" role="status">{translate("common:language.loading")}</p>}
					{localeError && <p className="global-menu__status" role="alert">{localeError}</p>}
				</div>
			</section>}
		</div>, document.body,
	);
}
