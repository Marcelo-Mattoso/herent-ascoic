/** O Desbravador: treino de combos solo e validação A/B em seeds reservadas. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getBoss, getHeroes } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";
import type { Difficulty } from "@/core/state/gameState";
import type { BotProfile } from "../profiles";
import { setupForRun } from "../profiles";
import { playAiGame } from "../ai";
import { LEVELING_RUNS_ROOT } from "../localLevelingReports";
import { actionTraits, publishedKnowledge, type StrategyKnowledge, type StrategyRule } from "./knowledge";
import { minePatterns, patternKey, type PatternObservation } from "./miner";

type Context = { hero: string; expansion: string; boss: string; difficulty: Difficulty; profile: BotProfile };
const difficulties: readonly Difficulty[] = ["very_easy", "easy", "normal"];
const profiles: readonly BotProfile[] = ["power-player", "explorer"];
const goals = { very_easy: 1, easy: 0.75, normal: 0.5 } as const;
type Options = { runs: number; validateRuns: number; seed: number; maxSteps: number; output: string; promote: boolean };
function optionsOf(args: readonly string[]): Options {
  const flags = args.filter(a => a !== "--");
  const values = new Map<string, string>();
  let promote = false;
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (flag === "--promote") { promote = true; continue; }
    if (!["--runs", "--validate-runs", "--seed", "--max-steps", "--output"].includes(flag))
      throw new Error("Parâmetro desconhecido: " + flag);
    if (!flags[i + 1]) throw new Error("Falta valor para " + flag);
    values.set(flag, flags[++i]!);
  }
  const number = (flag: string, fallback: number): number => {
    const value = values.get(flag) ? Number(values.get(flag)) : fallback;
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(flag + " precisa ser inteiro positivo");
    return value;
  };
  const output = resolve(values.get("--output") ?? join(LEVELING_RUNS_ROOT,
    "discover-" + new Date().toISOString().replace(/[:.]/g, "-")));
  if (!output.startsWith(LEVELING_RUNS_ROOT + sep)) throw new Error("Output fora de tools/bot/runs/");
  return { runs: number("--runs", 2), validateRuns: number("--validate-runs", 4),
    seed: number("--seed", 1), maxSteps: number("--max-steps", 1000), output, promote };
}
const keyOf = (c: Context): string => [c.hero, c.expansion, c.difficulty, c.profile].join("|");
function contexts(): Context[] {
  return getEnabledExpansions().flatMap(expansion => {
    const boss = getBoss(expansion.id);
    if (!boss) return [];
    return getHeroes().flatMap(hero => difficulties.flatMap(difficulty =>
      profiles.map(profile => ({ hero: hero.id, expansion: expansion.id, boss: boss.id, difficulty, profile }))));
  });
}
function trial(context: Context, seed: number, maxSteps: number, rules: readonly StrategyRule[]) {
  const pairs = new Set<string>();
  let prior: string | null = null;
  let phase = "";
  const result = playAiGame(
    { ...setupForRun(seed, [context.hero], context.difficulty), bossCardId: context.boss },
    maxSteps, step => {
      const current = step.before.roomsCleared + ":" + (step.before.combat?.round ?? 0);
      if (current !== phase) { prior = null; phase = current; }
      const trait = actionTraits(step.chosen.action, step.before)[0];
      if (trait) {
        if (prior && trait !== prior) pairs.add(patternKey([prior, trait]));
        prior = trait;
      }
    }, context.profile, undefined, rules, true,
  );
  return { won: result.outcome === "VICTORY" && !result.violation,
    violation: result.violation?.invariant ?? null, pairs: [...pairs] };
}
type Validation = {
  pattern: readonly string[]; pairedTrials: number; baselineWins: number; improvedWins: number;
  baselineViolations: number; improvedViolations: number; status: "validated" | "experimental";
  reason: string;
};
async function run(): Promise<void> {
  if (process.env.CI || process.env.GITHUB_ACTIONS) throw new Error("Desbravador roda apenas localmente");
  const options = optionsOf(process.argv.slice(2));
  const matrix = contexts();
  if (!matrix.length) throw new Error("Nenhum herói/chefe habilitado");
  const known = new Map(matrix.map(c => [keyOf(c), c]));
  const observations: PatternObservation[] = [];
  for (const [index, context] of matrix.entries()) {
    for (let iteration = 0; iteration < options.runs; iteration++) {
      const result = trial(context, options.seed + iteration, options.maxSteps, publishedKnowledge.rules);
      observations.push({ context: keyOf(context), won: result.won, pairs: result.pairs });
    }
    if ((index + 1) % 25 === 0) console.info("Descoberta:", index + 1, "/", matrix.length);
  }
  const candidates = minePatterns(observations, Math.max(3, options.runs)).slice(0, 6);
  const validation: Validation[] = [];
  for (const candidate of candidates) {
    const contextsToCheck = candidate.contexts.slice(0, 4).map(key => known.get(key))
      .filter((c): c is Context => c !== undefined);
    const rule: StrategyRule = { pattern: candidate.pattern, bonus: 25, status: "validated",
      evidence: { pairedTrials: 0, baselineWins: 0, improvedWins: 0, seedStart: options.seed + 200000 } };
    let pairedTrials = 0, baselineWins = 0, improvedWins = 0, baselineViolations = 0, improvedViolations = 0;
    for (const context of contextsToCheck) for (let iteration = 0; iteration < options.validateRuns; iteration++) {
      const seed = options.seed + 200000 + iteration;
      const before = trial(context, seed, options.maxSteps, publishedKnowledge.rules);
      const after = trial(context, seed, options.maxSteps, [...publishedKnowledge.rules, rule]);
      pairedTrials++;
      if (before.won) baselineWins++;
      if (after.won) improvedWins++;
      if (before.violation) baselineViolations++;
      if (after.violation) improvedViolations++;
    }
    const approved = pairedTrials >= 40 && improvedWins - baselineWins >= 4 &&
      improvedViolations <= baselineViolations;
    validation.push({ pattern: candidate.pattern, pairedTrials, baselineWins,
      improvedWins, baselineViolations, improvedViolations,
      status: approved ? "validated" : "experimental",
      reason: approved ? "Ganho pareado confirmado nas seeds reservadas" :
        "Ainda não comprovado: requer >=40 pares, +4 vitórias e sem violações adicionais" });
  }
  await mkdir(options.output, { recursive: true });
  const report = { version: 1, generatedAt: new Date().toISOString(), options, goals,
    training: { contexts: matrix.length, trials: observations.length,
      wins: observations.filter(o => o.won).length }, hypotheses: candidates, validation,
    warning: "Associação em treino não prova causalidade; só resultados validados podem ser promovidos." };
  await writeFile(join(options.output, "discovery-report.json"), JSON.stringify(report, null, 2));
  const library: StrategyKnowledge = { version: 1, rules: validation.filter(v => v.status === "validated")
    .map(v => ({ pattern: v.pattern, bonus: 25, status: "validated" as const,
      evidence: { pairedTrials: v.pairedTrials, baselineWins: v.baselineWins,
        improvedWins: v.improvedWins, seedStart: options.seed + 200000 } })) };
  await writeFile(join(options.output, "validated-knowledge.json"), JSON.stringify(library, null, 2));
  if (options.promote && library.rules.length) {
    const path = resolve("src/data/discoveryKnowledge.json");
    const prior = JSON.parse(await readFile(path, "utf8")) as StrategyKnowledge;
    const rules = new Map(prior.rules.map(rule => [patternKey(rule.pattern), rule]));
    for (const rule of library.rules) rules.set(patternKey(rule.pattern), rule);
    await writeFile(path, JSON.stringify({ version: 1, rules: [...rules.values()] }, null, 2) + "\n");
  }
  console.info("Descoberta:", observations.length, "partidas;", candidates.length,
    "hipóteses;", library.rules.length, "validadas.");
  console.info("Relatório:", join(options.output, "discovery-report.json"));
}
if (process.env.VITEST === undefined) run().catch(error => { console.error(error); process.exitCode = 1; });
