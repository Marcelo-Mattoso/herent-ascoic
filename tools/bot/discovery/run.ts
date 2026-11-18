/**
 * O Desbravador: mineração experimental solo ou em equipes, com validação
 * independente em seeds reservadas. Não altera regras e nunca executa no CI.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getBoss, getHeroes } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";
import type { Difficulty } from "@/core/state/gameState";
import type { BotProfile } from "../profiles";
import { setupForRun } from "../profiles";
import { playAiGame } from "../ai";
import { LEVELING_RUNS_ROOT, assertLocalReportExecution } from "../localLevelingReports";
import { publishedKnowledge, historicalKnowledge, type StrategyKnowledge, type StrategyRule } from "./knowledge";
import { catalogFingerprint } from "./fingerprint";
import { minePatterns, patternKey, type PatternObservation } from "./miner";
import { SequenceCollector } from "./sequence";
import { teamCandidates } from "./teams";
import { mcnemarStatistic, selectBonus } from "./statistics";

type Context = {
  heroes: readonly string[];
  expansion: string;
  boss: string;
  difficulty: Difficulty;
  profile: BotProfile;
};
type Options = {
  runs: number;
  validateRuns: number;
  seed: number;
  maxSteps: number;
  output: string;
  promote: boolean;
  dryRun: boolean;
  partySize: 1 | 2 | 3 | 4;
  maxParties: number;
  maxCandidates: number;
};
const difficulties: readonly Difficulty[] = ["very_easy", "easy", "normal"];
const profiles: readonly BotProfile[] = ["power-player", "explorer"];
const goals = { very_easy: 1, easy: 0.75, normal: 0.5 } as const;
const MIN_PAIRED_TRIALS = 40;
const MIN_EXTRA_WINS = 4;
const MIN_CHI_SQUARED = 6.64; // McNemar com correção de continuidade; p~0,01.

function parseOptions(args: readonly string[]): Options {
  const flags = args.filter(arg => arg !== "--");
  const values = new Map<string, string>();
  let promote = false, dryRun = false;
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]!;
    if (flag === "--promote") { promote = true; continue; }
    if (flag === "--dry-run") { dryRun = true; continue; }
    if (!["--runs", "--validate-runs", "--seed", "--max-steps", "--output",
      "--party-size", "--max-parties", "--max-candidates"].includes(flag))
      throw new Error("Parâmetro desconhecido: " + flag);
    if (!flags[index + 1]) throw new Error("Falta valor para " + flag);
    values.set(flag, flags[++index]!);
  }
  const positive = (flag: string, fallback: number) => {
    const number = values.has(flag) ? Number(values.get(flag)) : fallback;
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error(flag + " exige inteiro positivo");
    return number;
  };
  if (dryRun && promote) throw new Error("--dry-run e --promote são incompatíveis");
  const partySize = positive("--party-size", 1);
  if (partySize > 4) throw new Error("--party-size exige número de 1 a 4");
  const maxCandidates = positive("--max-candidates", 6);
  if (maxCandidates > 30) throw new Error("--max-candidates deve ser <= 30");
  const output = resolve(values.get("--output") ?? join(LEVELING_RUNS_ROOT,
    "discover-" + new Date().toISOString().replace(/[:.]/g, "-")));
  if (!output.startsWith(LEVELING_RUNS_ROOT + sep))
    throw new Error("Saída deve estar dentro de tools/bot/runs/");
  const seed = positive("--seed", 1);
  const runs = positive("--runs", 2);
  const validateRuns = positive("--validate-runs", 12);
  if (seed + 200000 + validateRuns > 2_147_483_647)
    throw new Error("Intervalo de seeds ultrapassa limite de 32 bits");
  return { partySize: partySize as Options["partySize"], runs, validateRuns,
    maxSteps: positive("--max-steps", 1000), seed,
    maxParties: positive("--max-parties", 8), maxCandidates, output, promote, dryRun };
}

function buildContexts(options: Options): Context[] {
  const heroes = getHeroes().map(hero => hero.id);
  const parties = options.partySize === 1
    ? heroes.map(hero => [hero])
    : teamCandidates(heroes, options.partySize, options.maxParties);
  return getEnabledExpansions().flatMap(expansion => {
    const boss = getBoss(expansion.id);
    if (!boss) return [];
    return parties.flatMap(party => difficulties.flatMap(difficulty =>
      profiles.map(profile => ({ heroes: party, expansion: expansion.id,
        boss: boss.id, difficulty, profile }))));
  });
}

const keyOf = (c: Context): string =>
  [[...c.heroes].join(","), c.expansion, c.difficulty, c.profile].join("|");

function trial(context: Context, seed: number, maxSteps: number,
  rules: readonly StrategyRule[], collect = false,
): { won: boolean; violation: string | null; patterns: readonly string[];
  cooperativePatterns: readonly string[] } {
  const collector = collect ? new SequenceCollector() : null;
  const result = playAiGame(
    { ...setupForRun(seed, context.heroes, context.difficulty), bossCardId: context.boss },
    maxSteps, collector ? step => collector.record(step) : undefined,
    context.profile, undefined, rules, true, true,
  );
  return { won: result.outcome === "VICTORY" && !result.violation,
    violation: result.violation?.invariant ?? null,
    patterns: collector?.patterns ?? [],
    cooperativePatterns: collector?.cooperativePatterns ?? [] };
}

interface ValidationResult {
  readonly pattern: readonly string[];
  readonly origin: "historical" | "new";
  readonly partySize: number;
  readonly bonus: number;
  readonly tuningTrials: number;
  readonly testedContexts: readonly string[];
  readonly pairedTrials: number;
  readonly baselineWins: number;
  readonly improvedWins: number;
  readonly improvedOnly: number;
  readonly baselineOnly: number;
  readonly baselineViolations: number;
  readonly improvedViolations: number;
  readonly mcnemarStatistic: number;
  readonly status: "validated" | "experimental";
  readonly reason: string;
}

function differentContexts(
  keys: readonly string[],
  known: ReadonlyMap<string, Context>,
  max = 6,
): Context[] {
  const result: Context[] = [];
  const coverage = new Set<string>();
  const pending = keys.map(key => known.get(key)).filter((c): c is Context => c !== undefined);
  while (result.length < max && pending.length > 0) {
    let index = 0;
    let score = -1;
    for (let i = 0; i < pending.length; i++) {
      const candidate = pending[i]!;
      const facets = [candidate.expansion, candidate.difficulty,
        candidate.profile, ...candidate.heroes];
      const gain = facets.filter(x => !coverage.has(x)).length;
      if (gain > score) { index = i; score = gain; }
    }
    const [picked] = pending.splice(index, 1);
    result.push(picked!);
    for (const facet of [picked!.expansion, picked!.difficulty, picked!.profile, ...picked!.heroes])
      coverage.add(facet);
  }
  return result;
}

function decision(stats: Omit<ValidationResult, "status" | "reason">): ValidationResult {
  const chi = mcnemarStatistic(stats.improvedOnly, stats.baselineOnly);
  const improved = stats.improvedOnly - stats.baselineOnly >= MIN_EXTRA_WINS;
  const safe = stats.improvedViolations <= stats.baselineViolations;
  const robust = stats.pairedTrials >= MIN_PAIRED_TRIALS &&
    stats.testedContexts.length >= 2 && chi >= MIN_CHI_SQUARED;
  const passed = improved && safe && robust;
  return { ...stats, mcnemarStatistic: chi, status: passed ? "validated" : "experimental",
    reason: passed
      ? "Ganho confirmado em A/B com discordâncias pareadas; nenhuma violação adicional"
      : "Ainda não comprovado: exigir >=40 pares, >=2 contextos, vantagem estatística e segurança" };
}

async function run(): Promise<void> {
  assertLocalReportExecution();
  const options = parseOptions(process.argv.slice(2));
  const matrix = buildContexts(options);
  if (!matrix.length) throw new Error("Nenhum herói/chefe habilitado para descoberta");
  if (options.dryRun) {
    console.info(JSON.stringify({
      mode: "discovery-plan",
      partySize: options.partySize,
      contexts: matrix.length,
      trainingTrials: matrix.length * options.runs,
      maximumHypotheses: options.maxCandidates,
      maximumValidationPairsPerHypothesis: Math.min(6, matrix.length) * options.validateRuns,
      note: "Prévia; não executou partidas nem gravou resultados",
    }, null, 2));
    return;
  }
  const known = new Map(matrix.map(context => [keyOf(context), context]));
  const observations: PatternObservation[] = [];
  const trainingWins: Record<string, { trials: number; wins: number }> = {};
  const trainingByContext: Record<string, { heroes: readonly string[];
    expansion: string; difficulty: Difficulty; profile: BotProfile;
    trials: number; wins: number; violations: number }> = {};
  for (const [index, context] of matrix.entries()) {
    for (let iteration = 0; iteration < options.runs; iteration++) {
      const game = trial(context, options.seed + iteration, options.maxSteps,
        publishedKnowledge.rules, true);
      observations.push({ context: keyOf(context), won: game.won, pairs: game.patterns,
        cooperativePatterns: game.cooperativePatterns });
      const contextKey = keyOf(context);
      const old = trainingByContext[contextKey] ?? { ...context, trials: 0, wins: 0, violations: 0 };
      trainingByContext[contextKey] = { ...old, trials: old.trials + 1,
        wins: old.wins + (game.won ? 1 : 0),
        violations: old.violations + (game.violation ? 1 : 0) };
      const key = context.difficulty;
      const previous = trainingWins[key] ?? { trials: 0, wins: 0 };
      trainingWins[key] = { trials: previous.trials + 1,
        wins: previous.wins + (game.won ? 1 : 0) };
    }
    if ((index + 1) % 25 === 0) console.info("Descoberta:", index + 1, "/", matrix.length);
  }
  const existing = new Set(publishedKnowledge.rules.map(rule => patternKey(rule.pattern)));
  const mined = minePatterns(observations, Math.max(3, options.runs));
  const historical = historicalKnowledge.catalogFingerprint === catalogFingerprint()
    ? [] : historicalKnowledge.rules.filter(rule =>
      !rule.context?.partySize || rule.context.partySize === options.partySize);
  // Revalidar conhecimento antigo antes de explorar novas hipóteses.
  const historicalHypotheses = historical.map(rule => ({
    pattern: rule.pattern, support: 0, teamSupport: 0, wins: 0, lift: 0,
    contexts: [...known.keys()], origin: "historical" as const,
  }));
  const oldKeys = new Set(historicalHypotheses.map(rule => patternKey(rule.pattern)));
  const freshHypotheses = mined.filter(pattern =>
    !existing.has(patternKey(pattern.pattern)) && !oldKeys.has(patternKey(pattern.pattern)) &&
    (options.partySize === 1 || pattern.teamSupport >= 2))
    .map(pattern => ({ ...pattern, origin: "new" as const }));
  const hypotheses = [...historicalHypotheses, ...freshHypotheses].slice(0, options.maxCandidates);
  const baselineCache = new Map<string, ReturnType<typeof trial>>();
  const validations: ValidationResult[] = [];

  for (const hypothesis of hypotheses) {
    const contexts = differentContexts(hypothesis.contexts, known);
    // O valor do incentivo é ajustado APENAS em seeds de treino separadas.
    // Assim, a validação não escolhe a melhor variante depois de olhar os resultados.
    const tuningContexts = contexts.slice(0, 3);
    const tuningRuns = Math.min(3, options.runs);
    const bonusTrials = [40, 90, 140].map(bonus => {
      let wins = 0, violations = 0;
      for (const context of tuningContexts) for (let index = 0; index < tuningRuns; index++) {
        const seed = options.seed + 100000 + index;
        const probe: StrategyRule = { pattern: hypothesis.pattern, bonus,
          status: "validated", context: { partySize: options.partySize,
            cooperative: options.partySize > 1 },
          evidence: { pairedTrials: 0, baselineWins: 0, improvedWins: 0,
            seedStart: options.seed + 200000 } };
        const result = trial(context, seed, options.maxSteps,
          [...publishedKnowledge.rules, probe]);
        if (result.won) wins++;
        if (result.violation) violations++;
      }
      return { bonus, wins, violations };
    });
    const tunedBonus = selectBonus(bonusTrials);
    const experiment: StrategyRule = {
      pattern: hypothesis.pattern,
      bonus: tunedBonus,
      status: "validated",
      context: { partySize: options.partySize, cooperative: options.partySize > 1 },
      evidence: { pairedTrials: 0, baselineWins: 0,
        improvedWins: 0, seedStart: options.seed + 200000 },
    };
    let pairedTrials = 0, baselineWins = 0, improvedWins = 0,
      improvedOnly = 0, baselineOnly = 0, baselineViolations = 0, improvedViolations = 0;
    for (const context of contexts) for (let i = 0; i < options.validateRuns; i++) {
      const seed = options.seed + 200000 + i;
      const baselineKey = keyOf(context) + "|" + seed;
      let baseline = baselineCache.get(baselineKey);
      if (!baseline) {
        baseline = trial(context, seed, options.maxSteps, publishedKnowledge.rules);
        baselineCache.set(baselineKey, baseline);
      }
      const improved = trial(context, seed, options.maxSteps,
        [...publishedKnowledge.rules, experiment]);
      pairedTrials++;
      if (baseline.won) baselineWins++;
      if (improved.won) improvedWins++;
      if (improved.won && !baseline.won) improvedOnly++;
      if (baseline.won && !improved.won) baselineOnly++;
      if (baseline.violation) baselineViolations++;
      if (improved.violation) improvedViolations++;
    }
    validations.push(decision({
      pattern: hypothesis.pattern, origin: hypothesis.origin, partySize: options.partySize,
      bonus: tunedBonus, tuningTrials: tuningContexts.length * tuningRuns * bonusTrials.length,
      testedContexts: contexts.map(keyOf), pairedTrials,
      baselineWins, improvedWins, improvedOnly, baselineOnly,
      baselineViolations, improvedViolations,
      mcnemarStatistic: 0,
    }));
  }

  await mkdir(options.output, { recursive: true });
  const fingerprint = catalogFingerprint();
  const result = { version: 3, generatedAt: new Date().toISOString(),
    catalogFingerprint: fingerprint,
    historicalKnowledge: {
      fingerprint: historicalKnowledge.catalogFingerprint ?? null,
      previousRules: historicalKnowledge.rules.length,
      needRevalidation: historical.length,
    },
    options, goals, training: { contexts: matrix.length,
      trials: observations.length, byDifficulty: trainingWins,
      byContext: Object.fromEntries(Object.entries(trainingByContext).map(([key, row]) =>
        [key, { ...row, winRate: row.wins / row.trials,
          targetWinRate: goals[row.difficulty],
          meetsTarget: row.trials >= MIN_PAIRED_TRIALS
            ? row.wins / row.trials >= goals[row.difficulty] : null,
          assessment: row.trials < MIN_PAIRED_TRIALS
            ? "amostra_exploratoria" : "amostra_minima" }])) },
    hypotheses, validations,
    caveats: [
      "Efeitos são classificados pelo kind declarado na DSL. A execução foi registrada; o resultado individual do efeito exige auditoria.",
      "Mineração observacional não prova sinergia causal; avaliação A/B usa seeds separadas do treino.",
      "Composições cooperativas representam uma amostra limitada, não todas as combinações.",
    ],
  };
  await writeFile(join(options.output, "discovery-report.json"), JSON.stringify(result, null, 2));
  const library: StrategyKnowledge = { version: 1,
    catalogFingerprint: fingerprint, rules: validations
    .filter(v => v.status === "validated").map(v => ({
      pattern: v.pattern, bonus: v.bonus, status: "validated" as const,
      context: { partySize: v.partySize, cooperative: v.partySize > 1 },
      evidence: { pairedTrials: v.pairedTrials, baselineWins: v.baselineWins,
        improvedWins: v.improvedWins, seedStart: options.seed + 200000 },
    })) };
  await writeFile(join(options.output, "validated-knowledge.json"), JSON.stringify(library, null, 2));
  if (options.promote && library.rules.length) {
    const path = resolve("src/data/discoveryKnowledge.json");
    const prior = JSON.parse(await readFile(path, "utf8")) as StrategyKnowledge;
    if (prior.rules.length && prior.catalogFingerprint !== fingerprint)
      await writeFile(join(options.output, "historical-knowledge.json"), JSON.stringify(prior, null, 2));
    const registered = new Map((prior.catalogFingerprint === fingerprint ? prior.rules : []).map(rule =>
      [patternKey(rule.pattern) + ":" + (rule.context?.partySize ?? 0), rule]));
    for (const rule of library.rules)
      registered.set(patternKey(rule.pattern) + ":" + rule.context?.partySize, rule);
    await writeFile(path, JSON.stringify({
      version: 1, catalogFingerprint: fingerprint, rules: [...registered.values()],
    }, null, 2) + "\n");
  }
  console.info("Desbravador:", observations.length, "partidas de treino;",
    hypotheses.length, "hipóteses;", library.rules.length, "validadas.");
  console.info("Relatório:", join(options.output, "discovery-report.json"));
}
if (process.env.VITEST === undefined) run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
