import type { GameHandler } from "../gameEngine";
import { bossHandler } from "./boss";
import { combatHandler, physicalRollHandler } from "./combat";
import { explorationHandler } from "./exploration";
import { progressionHandler } from "./progression";
import { responseHandler } from "./responses";
import { rewardHandler } from "./reward";
import { setupHandler } from "./setup";
import { artifactHandler } from "./artifact";

export const ascensaoHandlers: readonly GameHandler[] = [
	artifactHandler,
	responseHandler,
	setupHandler,
	physicalRollHandler,
	explorationHandler,
	combatHandler,
	rewardHandler,
	progressionHandler,
	bossHandler,
];
