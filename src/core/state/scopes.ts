import type { ScopeDef } from "../../engine/scopes";

export const GAME_SCOPE_DEFS: readonly ScopeDef[] = [
	{ id: "game" },
	{ id: "room", within: "game" },
	{ id: "combat", within: "room" },
	{ id: "round", within: "combat" },
];
