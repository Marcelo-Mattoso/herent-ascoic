/**
 * Caçador de Bugs: joga SOZINHO com escolha adversarial de ações para maximizar
 * diversidade de estados e contratos exercitados, não taxa de vitória.
 * Reporta invariantes reproduzíveis e suspeitas (sem falsos bloqueios).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Action } from "@/core/actions/types";
import type { GameState } from "@/core/state/gameState";
import { cardAbilityGrants } from "@/core/data/abilities";
import { getBoss, getHeroes } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";
import { heroesOf } from "@/core/state/access";
import { gameOf } from "@/engine/state";
import type { Difficulty } from "@/core/state/gameState";
import { scoreMoves } from "../brain";
import { actionIdentity } from "../exploration";
export { adversarialOrder } from "../exploration";
import { checkNoProgress, checkState, countCards, isTerminal } from "../invariants";
import { assertLocalReportExecution, LEVELING_RUNS_ROOT } from "../localLevelingReports";
import { createHeadlessPort } from "../port";
import { setupForRun } from "../profiles";
import { catalogFingerprint } from "./fingerprint";

type FindingKind = "invariant" | "legal_action_rejected" | "suspected_hp_cost" |
  "no_legal_action" | "replay_diverged" | "inconclusive";
type Context = { hero: string; boss: string; expansion: string; difficulty: Difficulty };
export interface BugFinding {
  readonly kind: FindingKind;
  readonly severity: "blocker" | "investigate";
  readonly summary: string;
  readonly room: number;
  readonly round: number;
  readonly action: Action;
  readonly abilityId?: string;
  readonly grantId?: string;
}
export interface BugHuntResult {
  readonly context: Context;
  readonly seed: number;
  readonly actionsAttempted: number;
  readonly finalStatus: string;
  readonly exhausted: boolean;
  /** Interrupção diagnóstica; não presume defeito no motor. */
  readonly exhaustionReason?: "cycle" | "max_steps" | "stagnant_combat";
  readonly findings: readonly BugFinding[];
  readonly exercisedGrants: readonly string[];
  readonly rejectedCandidates: number;
  readonly replay?: { readonly setup: ReturnType<typeof setupForRun>; readonly actions: readonly Action[] };
}
interface Options {
  readonly seed: number;
  readonly runs: number;
  readonly maxSteps: number;
  readonly maxHeroes: number;
  readonly maxScenarios: number;
  readonly difficulty: Difficulty | "all";
  readonly hero?: string;
  readonly output: string;
  readonly dryRun: boolean;
  readonly resetCorpus: boolean;
}
interface BugCorpus {
  readonly version: 1;
  readonly catalogFingerprint: string;
  readonly actionUsage: Readonly<Record<string, number>>;
  readonly grantUsage: Readonly<Record<string, number>>;
  readonly regressionCases: readonly { context: Context; seed: number;
    kind: FindingKind; actions?: readonly Action[] }[];
}
const CORPUS_FILE = join(LEVELING_RUNS_ROOT, "bug-hunter-corpus.json");
async function loadCorpus(fingerprint: string, reset: boolean): Promise<BugCorpus> {
  const fresh: BugCorpus = { version: 1, catalogFingerprint: fingerprint,
    actionUsage: {}, grantUsage: {}, regressionCases: [] };
  if (reset) return fresh;
  try {
    const candidate = JSON.parse(await readFile(CORPUS_FILE, "utf8")) as BugCorpus;
    return candidate.version === 1 && candidate.catalogFingerprint === fingerprint
      ? candidate : fresh;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fresh;
    throw error;
  }
}
const allDifficulties: readonly Difficulty[] = ["very_easy", "easy", "normal", "hard", "nightmare"];
function parse(args: readonly string[]): Options {
  const flags = args.filter(x => x !== "--");
  const values = new Map<string, string>();
  let dryRun = false, resetCorpus = false;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (flag === "--dry-run") { dryRun = true; continue; }
    if (flag === "--reset-corpus") { resetCorpus = true; continue; }
    if (!["--seed", "--runs", "--max-steps", "--max-heroes",
      "--max-scenarios", "--difficulty", "--hero", "--output"].includes(flag))
      throw new Error("Flag desconhecida: " + flag);
    if (!flags[i + 1]) throw new Error("Falta valor para " + flag);
    values.set(flag, flags[++i]!);
  }
  const positive = (key: string, defaultValue: number) => {
    const value = values.has(key) ? Number(values.get(key)) : defaultValue;
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(key + " exige inteiro positivo");
    return value;
  };
  const difficulty = values.get("--difficulty") ?? "all";
  if (!["all", ...allDifficulties].includes(difficulty))
    throw new Error("--difficulty exige all, very_easy, easy, normal, hard ou nightmare");
  const output = resolve(values.get("--output") ??
    join(LEVELING_RUNS_ROOT, "bug-hunt-" + new Date().toISOString().replace(/[:.]/g, "-")));
  if (!output.startsWith(LEVELING_RUNS_ROOT + sep)) throw new Error("Output fora de tools/bot/runs");
  return { seed: positive("--seed", 1), runs: positive("--runs", 2),
    maxSteps: positive("--max-steps", 750), maxHeroes: positive("--max-heroes", 4),
    maxScenarios: positive("--max-scenarios", 24), hero: values.get("--hero"),
    difficulty: difficulty as Options["difficulty"], output, dryRun, resetCorpus };
}
function scenarios(options: Options): Context[] {
  const heroes = getHeroes().map(h => h.id).sort();
  if (options.hero && !heroes.includes(options.hero))
    throw new Error("Herói desconhecido: " + options.hero);
  const shift = (options.seed - 1) % heroes.length;
  const selected = options.hero ? [options.hero] :
    [...heroes.slice(shift), ...heroes.slice(0, shift)].slice(0, options.maxHeroes);
  const bosses = getEnabledExpansions().map(exp => ({ expansion: exp.id,
    boss: getBoss(exp.id)?.id })).filter((b): b is { expansion: string; boss: string } => !!b.boss);
  const difficulties = options.difficulty === "all" ? allDifficulties : [options.difficulty];
  const full = selected.flatMap(hero => bosses.flatMap(exp =>
    difficulties.map(difficulty => ({ hero, ...exp, difficulty }))));
  const chosen: Context[] = [], remaining = [...full], covered = new Set<string>();
  while (chosen.length < options.maxScenarios && remaining.length) {
    let best = 0, bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const context = remaining[i]!;
      const score = [context.hero, context.expansion, context.difficulty]
        .filter(value => !covered.has(value)).length;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    const context = remaining.splice(best, 1)[0]!;
    chosen.push(context);
    covered.add(context.hero); covered.add(context.expansion); covered.add(context.difficulty);
  }
  return chosen;
}
function possibleCostAnomalies(before: GameState,
  after: GameState, action: Action): BugFinding[] {
  const previousSequence = gameOf(before).abilityTrace?.at(-1)?.sequence ?? 0;
  const emitted = (gameOf(after).abilityTrace ?? []).filter(e => e.sequence > previousSequence &&
    e.outcome === "executed" && (e.trigger === "manual" || e.trigger === "USE_SKILL"));
  const oldHeroes = new Map(heroesOf(before).map(h => [h.id, h]));
  const newHeroes = new Map(heroesOf(after).map(h => [h.id, h]));
  const findings: BugFinding[] = [];
  for (const effect of emitted) {
    const grant = cardAbilityGrants(effect.sourceCardId).find(g => g.id === effect.grantId);
    const cost = grant?.activation.cost?.hp ?? 0;
    const old = effect.sourceEntityId ? oldHeroes.get(effect.sourceEntityId) : undefined;
    const next = effect.sourceEntityId ? newHeroes.get(effect.sourceEntityId) : undefined;
    if (cost <= 0 || !old || !next) continue;
    if (effect.declaredKinds.some(kind => kind === "i_heal" || kind === "i_full_heal")) continue;
    if (old.currentLife - next.currentLife < cost) {
      findings.push({
        kind: "suspected_hp_cost", severity: "investigate",
        summary: "Possível custo de " + cost + " PV não refletido integralmente na janela; pode haver cura/efeito concorrente",
        room: gameOf(before).roomsCleared, round: gameOf(before).combat?.round ?? 0,
        action, abilityId: effect.abilityId, grantId: effect.grantId,
      });
    }
  }
  return findings;
}
function runOne(context: Context, seed: number, maxSteps: number,
  usage: Map<string, number>): BugHuntResult {
  const setup = { ...setupForRun(seed, [context.hero], context.difficulty), bossCardId: context.boss };
  const port = createHeadlessPort(setup, undefined, true);
  const baseline = countCards(port.inspect());
  const findings: BugFinding[] = [], grants = new Set<string>();
  let rejectedCandidates = 0, exhausted = false;
  let exhaustionReason: BugHuntResult["exhaustionReason"];
  let stagnantRounds = 0;
  let previousCombat: { room: number; round: number;
    enemyLife: Readonly<Record<string, number>> } | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < maxSteps && !isTerminal(port.inspect()); i++) {
    const current = port.observe();
    const view = current.view;
    const enemies = view.enemies.filter(enemy => enemy.status === "active");
    if (view.combat && enemies.length) {
      const enemyLife = Object.fromEntries(enemies.map(enemy => [enemy.id, enemy.currentLife]));
      const previous = previousCombat;
      const sameEncounter = previous && previous.room === view.roomsCleared &&
        Object.keys(enemyLife).length === Object.keys(previous.enemyLife).length &&
        Object.keys(enemyLife).every(id => id in previous.enemyLife);
      if (!sameEncounter) stagnantRounds = 0;
      else if (Object.entries(enemyLife).some(([id, hp]) => hp < (previous.enemyLife[id] ?? hp)))
        stagnantRounds = 0;
      else if (view.combat.round > previous!.round)
        stagnantRounds += view.combat.round - previous!.round;
      previousCombat = { room: view.roomsCleared, round: view.combat.round, enemyLife };
      if (stagnantRounds >= 35) {
        exhausted = true; exhaustionReason = "stagnant_combat"; break;
      }
    } else { previousCombat = null; stagnantRounds = 0; }
    // O Explorer usa exatamente o mesmo ranking adversarial em tela,
    // headless e caça aprofundada. O corpus adiciona memória entre partidas.
    const options = scoreMoves(current, "explorer", seed, port.history.length,
      { stagnantRounds, explorationUsage: usage }, [], false, null, false);
    const candidates = options.map(option => option.action);
    const legal = new Set(current.actions.map(action => JSON.stringify(action)));
    let advanced = false;
    for (const action of candidates.slice(0, 35)) {
      const id = actionIdentity(action);
      const before = port.inspect();
      const result = port.act(action);
      usage.set(id, (usage.get(id) ?? 0) + 1);
      if (result.kind === "rejected") {
        rejectedCandidates++;
        if (legal.has(JSON.stringify(action)))
          findings.push({ kind: "legal_action_rejected", severity: "blocker",
            summary: "Reducer rejeitou ação oferecida pela API legalActions: " + result.error,
            room: view.roomsCleared, round: view.combat?.round ?? 0, action });
        continue;
      }
      if (result.kind === "no_effect") continue;
      const after = port.inspect();
      for (const entry of (gameOf(after).abilityTrace ?? []).filter(e =>
        e.sequence > (gameOf(before).abilityTrace?.at(-1)?.sequence ?? 0)))
        grants.add(entry.sourceCardId + "::" + entry.grantId);
      findings.push(...possibleCostAnomalies(before, after, action));
      const invariant = checkState(after, baseline) ?? checkNoProgress(port.history, after);
      if (invariant) findings.push({ kind: "invariant", severity: "blocker",
        summary: invariant.invariant + ": " + invariant.message,
        room: gameOf(after).roomsCleared, round: gameOf(after).combat?.round ?? 0, action });
      advanced = true;
      break;
    }
    if (!advanced) {
      const state = port.inspect();
      findings.push({ kind: "no_legal_action", severity: "investigate",
        summary: "Nenhum candidato modificou estado; diagnosticar janela/recursos, sem comprovação de defeito",
        room: gameOf(state).roomsCleared, round: gameOf(state).combat?.round ?? 0,
        action: candidates[0] ?? { type: "CHECK_COMBAT_END" } });
      break;
    }
    if (findings.some(f => f.severity === "blocker")) break;
    const state = port.inspect();
    const signature = gameOf(state).status + ":" + gameOf(state).roomsCleared +
      ":" + (gameOf(state).combat?.round ?? 0) + ":" + port.history.slice(-8).map(actionIdentity).join(",");
    if (seen.has(signature) && i > 50) { exhausted = true; exhaustionReason = "cycle"; break; }
    seen.add(signature);
  }
  if (!isTerminal(port.inspect()) && port.history.length >= maxSteps) {
    exhausted = true; exhaustionReason = "max_steps";
  }
  if (exhausted) {
    const current = port.observe().view;
    findings.push({ kind: "inconclusive", severity: "investigate",
      summary: "Partida inconclusiva (" + exhaustionReason + ") em " +
        gameOf(port.inspect()).status + " após " + port.history.length +
        " ações; investigar repetição, cura e progresso de combate",
      room: current.roomsCleared, round: current.combat?.round ?? 0,
      action: port.history.at(-1) ?? { type: "CHECK_COMBAT_END" } });
  }
  return { context, seed, actionsAttempted: port.history.length,
    finalStatus: gameOf(port.inspect()).status, exhausted,
    ...(exhaustionReason ? { exhaustionReason } : {}), findings,
    exercisedGrants: [...grants].sort(), rejectedCandidates,
    ...(findings.some(f => f.kind !== "inconclusive")
      ? { replay: { setup, actions: [...port.history] } } : {}) };
}
/**
 * Replay exato do histórico, preservando escolhas improváveis de habilidade
 * e alvos. Somente divergências no reducer deixam a reprodução inconclusiva.
 */
function replayCase(record: BugCorpus["regressionCases"][number]): BugHuntResult {
  const { context, seed, actions } = record;
  const setup = { ...setupForRun(seed, [context.hero], context.difficulty),
    bossCardId: context.boss };
  const port = createHeadlessPort(setup, undefined, true);
  const baseline = countCards(port.inspect());
  const findings: BugFinding[] = [], grants = new Set<string>();
  let rejectedCandidates = 0;
  for (const action of (actions ?? []).slice(1)) {
    const before = port.inspect();
    const result = port.act(action);
    if (result.kind !== "applied") {
      rejectedCandidates++;
      const offered = port.observe().actions.some(candidate =>
        JSON.stringify(candidate) === JSON.stringify(action));
      const definite = result.kind === "rejected" && offered;
      findings.push({ kind: definite ? "legal_action_rejected" : "replay_diverged",
        severity: definite ? "blocker" : "investigate",
        summary: "Replay interrompido: " + result.kind +
          (result.kind === "rejected" ? ": " + result.error : ""),
        room: gameOf(before).roomsCleared,
        round: gameOf(before).combat?.round ?? 0, action });
      break;
    }
    const after = port.inspect();
    for (const entry of (gameOf(after).abilityTrace ?? []).filter(e =>
      e.sequence > (gameOf(before).abilityTrace?.at(-1)?.sequence ?? 0)))
      grants.add(entry.sourceCardId + "::" + entry.grantId);
    findings.push(...possibleCostAnomalies(before, after, action));
    const invariant = checkState(after, baseline) ?? checkNoProgress(port.history, after);
    if (invariant) {
      findings.push({ kind: "invariant", severity: "blocker",
        summary: invariant.invariant + ": " + invariant.message,
        room: gameOf(after).roomsCleared,
        round: gameOf(after).combat?.round ?? 0, action });
      break;
    }
  }
  return { context, seed, actionsAttempted: port.history.length,
    finalStatus: gameOf(port.inspect()).status, exhausted: false,
    findings, exercisedGrants: [...grants].sort(), rejectedCandidates,
    ...(findings.length ? { replay: { setup, actions: [...port.history] } } : {}) };
}
async function main(): Promise<void> {
  assertLocalReportExecution();
  const options = parse(process.argv.slice(2));
  const chosen = scenarios(options);
  const fingerprint = catalogFingerprint();
  const corpus = await loadCorpus(fingerprint, options.resetCorpus);
  if (options.dryRun) {
    console.info(JSON.stringify({ mode: "bug-hunter-plan", soloOnly: true,
      scenarios: chosen.length, games: chosen.length * options.runs,
      maxStepsPerGame: options.maxSteps, difficulties: options.difficulty,
      nonBlockingSuspicions: true,
      priorActionTypes: Object.keys(corpus.actionUsage).length,
      priorGrantsExercised: Object.keys(corpus.grantUsage).length,
      regressionCases: corpus.regressionCases.length }, null, 2));
    return;
  }
  const games: BugHuntResult[] = [];
  const usage = new Map(Object.entries(corpus.actionUsage));
  // Repetir seeds que já denunciaram falhas: uma mudança de bot não deve
  // fazer perder o histórico de bugs que ainda precisam ser investigados.
  const enabledHeroes = new Set(getHeroes().map(hero => hero.id));
  const enabledBosses = new Set(getEnabledExpansions().map(exp => getBoss(exp.id)?.id));
  const cases = corpus.regressionCases.filter(record =>
    enabledHeroes.has(record.context.hero) && enabledBosses.has(record.context.boss)).slice(-8);
  for (const regression of cases) {
    games.push(regression.actions?.length
      ? replayCase(regression)
      : runOne(regression.context, regression.seed, options.maxSteps, usage));
  }
  for (const [index, scenario] of chosen.entries()) {
    for (let i = 0; i < options.runs; i++) {
      const result = runOne(scenario, options.seed + i, options.maxSteps, usage);
      games.push(result);
      if (result.findings.some(f => f.severity === "blocker"))
        console.warn("CAÇADOR: possível falha reproduzível em", scenario.hero,
          scenario.expansion, "seed", result.seed);
    }
    if ((index + 1) % 10 === 0) console.info("Caçador de Bugs", index + 1, "/", chosen.length);
  }
  const grantUsage = { ...corpus.grantUsage };
  for (const game of games) for (const key of game.exercisedGrants)
    grantUsage[key] = (grantUsage[key] ?? 0) + 1;
  const past = new Map(corpus.regressionCases.map(record =>
    [record.context.hero + "|" + record.context.boss + "|" +
      record.context.difficulty + "|" + record.seed + "|" + record.kind, record]));
  for (const game of games) for (const finding of game.findings.filter(f => f.severity === "blocker")) {
    const priorActions = game.replay?.actions ?? [];
    const regression = { context: game.context, seed: game.seed, kind: finding.kind,
      actions: finding.kind === "legal_action_rejected"
        ? [...priorActions, finding.action] : [...priorActions] };
    const key = game.context.hero + "|" + game.context.boss + "|" +
      game.context.difficulty + "|" + game.seed + "|" + finding.kind;
    past.set(key, regression);
  }
  const saved: BugCorpus = { version: 1, catalogFingerprint: fingerprint,
    actionUsage: Object.fromEntries(usage), grantUsage,
    regressionCases: [...past.values()].slice(-80) };
  await mkdir(LEVELING_RUNS_ROOT, { recursive: true });
  await writeFile(CORPUS_FILE, JSON.stringify(saved, null, 2) + "\n");
  const findings = games.flatMap(game => game.findings.map(finding => ({
    ...finding, seed: game.seed, ...game.context, replay: game.replay,
  })));
  const report = {
    version: 1, agent: "explorer", mode: "deep-investigation",
    generatedAt: new Date().toISOString(),
    catalogFingerprint: fingerprint, options, corpusPath: CORPUS_FILE,
    resumedRegressionCases: cases.length,
    cumulativeGrantCoverage: Object.keys(grantUsage).length,
    scenarios: chosen.length, games: games.length,
    inconclusiveGames: games.filter(game => game.exhausted).length,
    exhaustionByReason: Object.fromEntries(
      ["cycle", "max_steps", "stagnant_combat"].map(reason =>
        [reason, games.filter(game => game.exhaustionReason === reason).length])),
    exercisedGrants: [...new Set(games.flatMap(game => game.exercisedGrants))].sort(),
    blockingFindings: findings.filter(f => f.severity === "blocker").length,
    suspectedFindings: findings.filter(f => f.severity === "investigate").length,
    rejectedCandidates: games.reduce((sum, game) => sum + game.rejectedCandidates, 0),
    findings, gameSummaries: games.map(({ replay: _replay, ...game }) => game),
    note: "Resultados são triagem reproduzível. Inconclusivas não são vitórias nem bugs confirmados; analisar exhaustionReason e suspeitas.",
  };
  await mkdir(options.output, { recursive: true });
  await writeFile(join(options.output, "bug-hunt-report.json"), JSON.stringify(report, null, 2));
  console.info("Caçador de Bugs:", games.length, "partidas;",
    report.blockingFindings, "falhas de invariantes;",
    report.suspectedFindings, "suspeitas.");
  console.info("Relatório:", join(options.output, "bug-hunt-report.json"));
  if (report.blockingFindings) process.exitCode = 1;
}
if (process.env.VITEST === undefined) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
