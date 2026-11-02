import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import type { Action } from "@/core/actions/types";
import { type ActionOutput, screenOutput, storeOutput } from "./outputs";

interface Snapshot {
	status: string;
	actions: number;
	heroes: string[];
	enemies: string[];
	waiting: boolean;
	turnKey: string;
	activeHeroes: string[];
	choices: string[];
	targets: string[];
	fingerprint: string;
	moves: { action: Action; score: number }[];
	log: string[];
}

const flag = (key: string, fallback: string) => {
	const index = process.argv.indexOf(`--${key}`);
	return index >= 0 ? (process.argv[index + 1] as string) : fallback;
};
const URL_BASE = flag("url", "http://localhost:5173");
const GAMES = Number(flag("games", "1"));
const PAUSE = Number(flag("pause", "500"));
const STUCK_MS = Number(flag("stuck", "25000"));
const OUTPUT = flag("output", "screen");
const HEADLESS = process.argv.includes("--headless");
const runDir = path.resolve("tools/bot/runs", `screen-${Date.now()}`);

const say = (text: string) => console.log(`${new Date().toLocaleTimeString()} ${text}`);

/** Lê só o que um jogador vê; quem age é o mouse. */
function read(page: Page): Promise<Snapshot> {
	// Texto, não função: o vite-node reescreveria o import() e ele não existiria no navegador.
	return page.evaluate(`(async () => {
		const { getElfGameState } = await import("/src/ui/store/elfStore.ts");
		const { uiEngine } = await import("/src/ui/engine.ts");
		const { observe } = await import("/tools/bot/observe.ts");
		const { scoreMoves } = await import("/tools/bot/brain.ts");
		const state = getElfGameState();
		const obs = observe(uiEngine, state);
		const active = (list) => list.filter((unit) => unit.status === "active").map((unit) => unit.id);
		const decision = obs.actions.some((a) => ["APPLY_TRIGGER_INTERRUPT", "SKILL_CHOICE", "SELECT_SKILL_TARGET"].includes(a.type));
		const automatic = ["REVEAL_ROOM", "ROOM_EFFECT", "SPAWN_ENEMIES", "COMBAT_START", "ROLL_DICE", "CHECK_COMBAT_END", "DIRECT_DAMAGE"].includes(state.game.status);
		return {
			status: state.game.status,
			actions: state.game.actionLog.length,
			heroes: obs.view.heroes.map((hero) => hero.id),
			activeHeroes: active(obs.view.heroes),
			turnKey: [obs.view.combat?.round, obs.view.combat?.heroesActed.length, state.game.roomsCleared].join(":"),
			choices: (obs.view.pendingSkillChoice?.options ?? []).map((option) => option.id),
			targets: (obs.view.pendingSkillTarget?.candidates ?? []).map((candidate) => candidate.id),
			enemies: active(obs.view.enemies),
			fingerprint: JSON.stringify({ ...state.game, actionLog: 0, eventLog: 0, alphaLog: 0, rng: 0 }) + JSON.stringify(state.engine.pending),
			// Dados físicos e fases automáticas pertencem à interface.
			waiting: !decision && (automatic || Boolean(state.game.combat?.pendingPhysicalRoll)),
			moves: scoreMoves(obs).filter((move) => move.score >= 0),
			log: state.game.eventLog,
		};
	})()`);
}

async function capture(page: Page, name: string, reason: string, errors: string[]) {
	fs.mkdirSync(runDir, { recursive: true });
	const base = path.join(runDir, name);
	await page.screenshot({ path: `${base}.png` });
	fs.writeFileSync(`${base}.txt`, `${reason}\n\nConsole:\n${errors.join("\n")}\n`);
	say(`QUEBROU: ${reason}\n  screenshot: ${base}.png`);
}

async function startGame(page: Page) {
	await page.goto(URL_BASE);
	await page.getByRole("button", { name: "JOGAR" }).click();
	const heroes = page.locator(".setup-hero-select-button");
	const count = Math.min(3, await heroes.count());
	for (let i = 0; i < count; i++) await heroes.nth(i).click();
	await page.getByRole("button", { name: "Iniciar partida" }).click();
	await page.getByRole("button", { name: "Pular abertura" }).click({ timeout: 10_000 }).catch(() => undefined);
	await page.waitForSelector(".game-board-root", { timeout: 15_000 });
}

/** Entrega a melhor opção ainda não tentada neste estado; quem confirma o efeito é a próxima leitura. */
async function playStep(
	output: ActionOutput,
	snap: Snapshot,
	tried: Set<string>,
	abilitiesThisTurn: Set<string>,
): Promise<boolean> {
	if (snap.waiting) return true;
	for (const { action, score } of snap.moves) {
		const key = JSON.stringify(action);
		if (tried.has(key)) continue;
		// Preparar e cancelar alterna o estado sem progresso: cada habilidade só uma vez por vez de agir.
		const abilityKey = `${snap.turnKey}|${key}`;
		if (action.type.startsWith("USE_")) {
			if (abilitiesThisTurn.has(abilityKey)) continue;
			abilitiesThisTurn.add(abilityKey);
		}
		tried.add(key);
		const result = await output.perform(action, snap).catch((error: Error) => {
			say(`  falhou ${action.type}: ${error.message.split("\n").filter((line) => /^locator|intercepts|outside/.test(line.trim())).slice(0, 3).join(" | ").slice(0, 300)}`);
			return "unsupported" as const;
		});
		if (result === "done") {
			say(`[${output.name}] ${snap.status}: ${action.type} (nota ${score.toFixed(0)})`);
			return true;
		}
	}
	return false;
}

async function playGame(page: Page, index: number) {
	const output = OUTPUT === "store" ? storeOutput(page) : screenOutput(page);
	const errors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") errors.push(message.text());
	});
	page.on("pageerror", (error) => errors.push(error.message));
	await startGame(page);
	let lastChange = Date.now();
	let lastFingerprint = "";
	const tried = new Set<string>();
	const abilitiesThisTurn = new Set<string>();
	let printed = 0;
	let reported = 0;
	for (;;) {
		const snap = await read(page).catch(() => null);
		// Recarga da página (HMR) destrói o contexto: lê de novo na próxima volta.
		if (!snap) {
			await page.waitForTimeout(PAUSE);
			continue;
		}
		for (const line of snap.log.slice(printed)) say(`  · ${line}`);
		printed = snap.log.length;
		if (errors.length > reported && errors.at(-1) !== errors[reported - 1]) {
			await capture(page, `jogo${index}-erro${errors.length}`, `erro no navegador: ${errors.at(-1)}`, errors);
			reported = errors.length;
		}
		if (snap.status === "VICTORY" || snap.status === "DEFEAT") {
			say(`FIM: ${snap.status}`);
			await page.waitForTimeout(1500);
			await page.screenshot({ path: path.join(runDir, `jogo${index}-fim.png`) });
			return;
		}
		if (snap.fingerprint !== lastFingerprint) {
			lastFingerprint = snap.fingerprint;
			lastChange = Date.now();
			tried.clear();
		} else if (Date.now() - lastChange > STUCK_MS) {
			await capture(page, `jogo${index}-travou`, `sem progresso há ${STUCK_MS}ms em ${snap.status}`, errors);
			return;
		}
		try {
			if (!(await playStep(output, snap, tried, abilitiesThisTurn))) {
				// Animações podem atrasar o efeito: só desiste depois de reler algumas vezes.
				if (Date.now() - lastChange > 4000) tried.clear();
			}
		} catch (error) {
			say(`tentativa falhou: ${(error as Error).message.split("\n")[0]}`);
		}
		await page.waitForTimeout(PAUSE);
	}
}

const browser = await chromium.launch({ headless: HEADLESS, args: ["--use-gl=swiftshader"] });
fs.mkdirSync(runDir, { recursive: true });
say(`Saída: ${runDir}`);
for (let index = 1; index <= GAMES; index++) {
	const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: "pt-BR" });
	await playGame(page, index);
	await page.close();
}
await browser.close();
