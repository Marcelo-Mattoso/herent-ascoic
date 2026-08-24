import { useEffect, useMemo, useState } from "react";
import {
	BOARD_BACKGROUND_MANIFEST_URL,
	BOARD_BACKGROUND_STORAGE_KEY,
	type BoardBackground,
	type BoardBackgroundManifest,
	EMPTY_BOARD_BACKGROUND_MANIFEST,
} from "@/ui/boardBackgrounds";

function readStoredBoardId() {
	try {
		return localStorage.getItem(BOARD_BACKGROUND_STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStoredBoardId(boardId: string | null) {
	try {
		if (boardId) localStorage.setItem(BOARD_BACKGROUND_STORAGE_KEY, boardId);
		else localStorage.removeItem(BOARD_BACKGROUND_STORAGE_KEY);
	} catch {
		// Preferencia visual; se storage falhar, a sessao continua normal.
	}
}

function isBoardManifest(value: unknown): value is BoardBackgroundManifest {
	if (!value || typeof value !== "object") return false;
	const manifest = value as Partial<BoardBackgroundManifest>;
	return (
		manifest.version === 1 &&
		manifest.source === "imagedata/tabuleiros" &&
		Array.isArray(manifest.boards)
	);
}

export function useBoardBackgrounds() {
	const [manifest, setManifest] = useState<BoardBackgroundManifest>(
		EMPTY_BOARD_BACKGROUND_MANIFEST,
	);
	const [selectedBoardId, setSelectedBoardIdState] = useState<string | null>(
		() => readStoredBoardId(),
	);

	useEffect(() => {
		let cancelled = false;

		fetch(BOARD_BACKGROUND_MANIFEST_URL, { cache: "no-cache" })
			.then((response) => {
				if (!response.ok) return EMPTY_BOARD_BACKGROUND_MANIFEST;
				return response.json() as Promise<unknown>;
			})
			.then((value) => {
				if (cancelled) return;
				setManifest(
					isBoardManifest(value) ? value : EMPTY_BOARD_BACKGROUND_MANIFEST,
				);
			})
			.catch(() => {
				if (!cancelled) setManifest(EMPTY_BOARD_BACKGROUND_MANIFEST);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const selectedBoard = useMemo<BoardBackground | null>(() => {
		if (manifest.boards.length === 0) return null;
		return (
			manifest.boards.find((board) => board.id === selectedBoardId) ??
			manifest.boards[0] ??
			null
		);
	}, [manifest.boards, selectedBoardId]);

	function setSelectedBoardId(boardId: string | null) {
		setSelectedBoardIdState(boardId);
		writeStoredBoardId(boardId);
	}

	return {
		boards: manifest.boards,
		selectedBoard,
		selectedBoardId: selectedBoard?.id ?? null,
		setSelectedBoardId,
	};
}
