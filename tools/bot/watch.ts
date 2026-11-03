import fs from "node:fs";
import path from "node:path";
import type { Action } from "@/core/actions/types";
import type { PlayerView } from "@/core/projection/playerView";
import { cardName } from "@/core/gameEngine";
import { engine } from "../golden/lib";
import { type AiStep, playAiGame } from "./ai";
import { parseBotDifficulty, parseBotParty, parseBotProfile, setupForRun } from "./profiles";

const name = (id: string) => cardName(engine, id);

function units(view: PlayerView): string {
	const show = (list: readonly { cardId: string; currentLife: number; maxLife: number; status: string }[]) =>
		list.filter((u) => u.status === "active").map((u) => `${name(u.cardId)} ${u.currentLife}/${u.maxLife}`).join(", ");
	const enemies = show(view.enemies);
	return `[${show(view.heroes)}]${enemies ? ` x [${enemies}]` : ""}`;
}

function describe(action: Action, view: PlayerView): string {
	const payload = (action as { payload?: Record<string, unknown> }).payload ?? {};
	const unit = (id: unknown) => {
		const found = [...view.heroes, ...view.enemies].find((u) => u.id === id);
		return found ? name(found.cardId) : String(id);
	};
	if (action.type === "CHOOSE_TARGET") return `${unit(payload.heroId)} ataca ${unit(payload.enemyId)}`;
	if (action.type === "CONFIRM_DICE_ROLL") return `dados herói ${payload.heroResults} x inimigo ${payload.enemyResults}`;
	return Object.keys(payload).length ? `${action.type} ${JSON.stringify(payload)}` : action.type;
}

function line({ step, before, after, chosen, options, rejected }: AiStep): string {
	const others = options.filter((o) => o !== chosen).slice(0, 2).map((o) => `${o.action.type}=${o.score.toFixed(0)}`).join(" ");
	const status = before.status === after.status ? before.status : `${before.status} → ${after.status}`;
	const out = [`#${String(step).padStart(4)} ${status}: ${describe(chosen.action, before)} (nota ${chosen.score.toFixed(0)}${others ? `; outras ${others}` : ""})${chosen.plan ? ` | plano: ${chosen.plan}` : ""}`, `      ${units(after)}`];
	for (const entry of after.eventLog.slice(before.eventLog.length)) out.push(`      · ${entry}`);
	for (const error of rejected) out.push(`      ! RECUSADA ${error}`);
	return out.join("\n");
}

const flag = (key: string, fallback: number) => {
	const index = process.argv.indexOf(`--${key}`);
	return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const textFlag = (key: string) => {
	const index = process.argv.indexOf(`--${key}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
};
const seed = flag("seed", 1);
const delay = flag("delay", 0);
const profile = parseBotProfile(textFlag("profile") ?? "power-player");
const heroOption = textFlag("heroes");
const difficulty = textFlag("difficulty") ? parseBotDifficulty(textFlag("difficulty")!) : undefined;
const setup = setupForRun(seed, heroOption ? parseBotParty(heroOption) : undefined, difficulty);
const dir = path.resolve("tools/bot/runs");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `watch-seed-${seed}.jsonl`);
fs.writeFileSync(file, "");
console.log(`Perfil ${profile} | seed ${seed} | ${setup.difficulty} | ${setup.heroCardIds.map(name).join(", ")}\nLog: ${file}\n`);

const result = playAiGame(setup, flag("max-steps", 3000), (step) => {
	console.log(line(step));
	fs.appendFileSync(file, `${JSON.stringify({ step: step.step, status: step.after.status, chosen: step.chosen, options: step.options, rejected: step.rejected })}\n`);
	if (delay > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
}, profile);
console.log(`\nFim: ${result.outcome} | ações ${result.steps} | salas ${result.roomsCleared}${result.violation ? ` | VIOLAÇÃO ${result.violation.invariant}: ${result.violation.message}` : ""}`);
