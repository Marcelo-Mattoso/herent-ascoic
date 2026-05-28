// Replay Viewer — carrega log de actions e permite navegação passo a passo.
// Passo 13: tela dev atrás de atalho (Ctrl+Shift+R em App.tsx).
//
// Funcionalidades:
//   - Importar JSON com { gameId, seed, actionLog }
//   - Navegação: anterior / próximo / ir ao fim / play automático
//   - Exibe GameState atual como JSON pretty-print
//   - Exportar JSON do estado atual (inclui actionLog completo)

import { useState, useCallback, useRef, useEffect } from "react";
import type { ReplayPackage } from "@/core/replay/replayEngine";
import {
	buildReplayStates,
	exportPackageToJson,
	importPackageFromJson,
} from "@/core/replay/replayEngine";
import type { GameState } from "@/core/state/gameState";
import { buildReplayPackage } from "@/core/replay/replayEngine";
import { useGameStore } from "@/ui/store/gameStore";

interface ReplayProps {
	onClose: () => void;
}

export function Replay({ onClose }: ReplayProps) {
	const currentState = useGameStore((s) => s.state);
	const [states, setStates] = useState<readonly GameState[]>([]);
	const [cursor, setCursor] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const loadPackage = useCallback((pkg: ReplayPackage) => {
		const allStates = buildReplayStates(pkg);
		setStates(allStates);
		setCursor(allStates.length - 1);
		setError(null);
		setPlaying(false);
	}, []);

	// Exportar o log da partida em curso
	const handleExportCurrent = useCallback(() => {
		const pkg = buildReplayPackage(currentState);
		const json = exportPackageToJson(pkg);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `replay-${pkg.gameId}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}, [currentState]);

	// Importar JSON externo
	const handleImportJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = ev.target?.result as string;
			const pkg = importPackageFromJson(text);
			if (!pkg) {
				setError("JSON inválido ou formato não reconhecido.");
				return;
			}
			loadPackage(pkg);
		};
		reader.readAsText(file);
	}, [loadPackage]);

	// Replay da partida em curso (sem importar arquivo)
	const handleReplayCurrent = useCallback(() => {
		const pkg = buildReplayPackage(currentState);
		loadPackage(pkg);
	}, [currentState, loadPackage]);

	// Navegação
	const goTo = useCallback((idx: number) => {
		setCursor(Math.max(0, Math.min(idx, states.length - 1)));
	}, [states.length]);

	const handlePlay = useCallback(() => {
		if (playing) {
			setPlaying(false);
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
			return;
		}
		if (cursor >= states.length - 1) return;
		setPlaying(true);
	}, [playing, cursor, states.length]);

	// Avança automaticamente durante play
	useEffect(() => {
		if (!playing) {
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
			return;
		}
		playIntervalRef.current = setInterval(() => {
			setCursor((c) => {
				if (c >= states.length - 1) {
					setPlaying(false);
					return c;
				}
				return c + 1;
			});
		}, 300);
		return () => {
			if (playIntervalRef.current) clearInterval(playIntervalRef.current);
		};
	}, [playing, states.length]);

	const currentDisplayState = states[cursor];
	const hasStates = states.length > 0;

	return (
		<div className="fixed inset-0 bg-black/90 text-white z-50 flex flex-col p-4 overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 mb-4 flex-shrink-0">
				<h1 className="text-xl font-bold">Replay Viewer</h1>
				<span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">DEV</span>
				<button
					onClick={onClose}
					className="ml-auto px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
				>
					Fechar (Ctrl+Shift+R)
				</button>
			</div>

			{/* Controles de carregamento */}
			<div className="flex flex-wrap gap-2 mb-4 flex-shrink-0">
				<button
					onClick={handleReplayCurrent}
					className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded text-sm"
				>
					Replay da partida atual
				</button>
				<label className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded text-sm cursor-pointer">
					Importar JSON
					<input
						ref={fileInputRef}
						type="file"
						accept=".json"
						className="hidden"
						onChange={handleImportJson}
					/>
				</label>
				<button
					onClick={handleExportCurrent}
					className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 rounded text-sm"
				>
					Exportar JSON (partida atual)
				</button>
			</div>

			{error && (
				<div className="mb-3 p-2 bg-red-900 text-red-200 rounded text-sm flex-shrink-0">
					{error}
				</div>
			)}

			{/* Controles de navegação */}
			{hasStates && (
				<div className="flex items-center gap-3 mb-4 flex-shrink-0">
					<button
						onClick={() => goTo(0)}
						disabled={cursor === 0}
						className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-sm"
					>
						|◀ Início
					</button>
					<button
						onClick={() => goTo(cursor - 1)}
						disabled={cursor === 0}
						className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-sm"
					>
						◀ Anterior
					</button>
					<button
						onClick={handlePlay}
						disabled={!hasStates || cursor >= states.length - 1}
						className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 rounded text-sm"
					>
						{playing ? "⏸ Pausar" : "▶ Play"}
					</button>
					<button
						onClick={() => goTo(cursor + 1)}
						disabled={cursor >= states.length - 1}
						className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-sm"
					>
						Próximo ▶
					</button>
					<button
						onClick={() => goTo(states.length - 1)}
						disabled={cursor >= states.length - 1}
						className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded text-sm"
					>
						Fim ▶|
					</button>
					<span className="text-sm text-gray-400 ml-2">
						Passo {cursor} / {states.length - 1}
						{cursor > 0 && (
							<span className="ml-2 text-gray-500">
								{/* Ação que levou a este estado */}
								← {states[cursor]?.actionLog[cursor - 1]?.action.type ?? "?"}
							</span>
						)}
					</span>
				</div>
			)}

			{/* JSON do estado atual */}
			<div className="flex-1 overflow-auto">
				{currentDisplayState ? (
					<pre className="text-xs text-green-300 font-mono whitespace-pre-wrap break-all">
						{JSON.stringify(
							{
								status: currentDisplayState.status,
								step: cursor,
								action: cursor > 0
									? currentDisplayState.actionLog[cursor - 1]?.action
									: "(estado inicial)",
								heroes: currentDisplayState.heroes.map((h) => ({
									id: h.id,
									cardName: h.cardName,
									currentLife: h.currentLife,
									maxLife: h.maxLife,
									status: h.status,
								})),
								activeEnemies: currentDisplayState.activeEnemies.map((e) => ({
									id: e.id,
									cardName: e.cardName,
									currentLife: e.currentLife,
									status: e.status,
								})),
								groupXp: currentDisplayState.groupXp,
								effectStack: {
									pending: currentDisplayState.effectStack.pending.length,
									resolving: currentDisplayState.effectStack.resolving?.id ?? null,
								},
							},
							null,
							2,
						)}
					</pre>
				) : (
					<div className="text-gray-500 text-sm">
						Nenhum replay carregado. Use "Replay da partida atual" ou "Importar JSON".
					</div>
				)}
			</div>
		</div>
	);
}
