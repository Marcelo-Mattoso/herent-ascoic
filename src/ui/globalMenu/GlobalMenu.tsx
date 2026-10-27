import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { publicAssetUrl } from "@/ui/publicAssetUrl";
import { isMusicManifest, MUSIC_MANIFEST_URL, MusicPlayer } from "./musicPlayer";

const MANUAL_URL = publicAssetUrl("rules/ascensao-heroica-manual.pdf");

export function GlobalMenu() {
	const [player] = useState(() => new MusicPlayer(document.createElement("audio")));
	const music = useSyncExternalStore(player.subscribe, player.getSnapshot);
	const [open, setOpen] = useState(false);
	const [catalogError, setCatalogError] = useState("");
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
			})
			.catch(() => {
				if (!controller.signal.aborted)
					setCatalogError("Não foi possível carregar a lista de músicas.");
			});
		return () => { controller.abort(); player.dispose(); };
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
	return createPortal(
		<div className="global-menu" data-global-menu>
			<button ref={buttonRef} type="button" className="global-menu__toggle" aria-label={open ? "Fechar menu global" : "Abrir menu global"} aria-expanded={open} aria-controls="global-menu-panel" onClick={() => setOpen((value) => !value)}>
				<span aria-hidden="true">{open ? "×" : "☰"}</span>
			</button>
			{open && <section ref={panelRef} id="global-menu-panel" className="global-menu__panel" aria-label="Menu global">
				<div className="global-menu__heading"><span>Ascensão Heróica</span><button type="button" aria-label="Fechar menu" onClick={() => { setOpen(false); buttonRef.current?.focus(); }}>×</button></div>
				<div className="global-menu__section">
					<h2>Música</h2>
					<p className="global-menu__track" aria-live="polite">{selected ? `${music.tracks.findIndex((track) => track.id === selected.id) + 1} / ${music.tracks.length} · ${selected.title}` : "Nenhuma faixa selecionada"}</p>
					{music.tracks.length > 1 && <label className="global-menu__field">Faixa
						<select value={music.selectedId ?? ""} onChange={(event) => player.select(event.target.value)}>
							{music.tracks.map((track) => <option key={track.id} value={track.id}>{track.title}</option>)}
						</select>
					</label>}
					<div className="global-menu__controls">
						<button type="button" aria-label="Faixa anterior" disabled={music.tracks.length < 2} onClick={() => player.step(-1)}>◀◀</button>
						<button type="button" disabled={!selected || music.status === "loading"} onClick={() => void player.play()}>Play</button>
						<button type="button" disabled={music.status === "stopped"} onClick={() => player.stop()}>Stop</button>
						<button type="button" aria-label="Próxima faixa" disabled={music.tracks.length < 2} onClick={() => player.step(1)}>▶▶</button>
					</div>
					<label className="global-menu__field" htmlFor="global-music-volume">Volume · {music.volume}%
						<input id="global-music-volume" type="range" min="0" max="100" value={music.volume} onChange={(event) => player.setVolume(Number(event.target.value))} />
					</label>
					<p className="global-menu__status" role="status">{catalogError || music.message || (music.status === "playing" ? "Reproduzindo" : music.status === "stopped" ? "Parado" : "")}</p>
				</div>
				<div className="global-menu__section">
					<h2>Regras</h2>
					<div className="global-menu__links">
						<a href={MANUAL_URL} target="_blank" rel="noopener noreferrer">Ler manual de regras</a>
						<a href={MANUAL_URL} download="ascensao-heroica-manual.pdf">Baixar manual em PDF</a>
					</div>
				</div>
			</section>}
		</div>, document.body,
	);
}
