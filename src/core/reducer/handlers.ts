import type { GameHandler } from "../gameEngine";
import { bossHandler } from "./boss";
import { combatHandler } from "./combat";
import { explorationHandler } from "./exploration";
import { progressionHandler } from "./progression";
import { responseHandler } from "./responses";
import { rewardHandler } from "./reward";
import { setupHandler } from "./setup";

export const ascensaoHandlers: readonly GameHandler[] = [
	responseHandler,
	setupHandler,
	explorationHandler,
	combatHandler,
	rewardHandler,
	progressionHandler,
	bossHandler,
];
