/**
 * O Instrutor Solo — experimentos A/B de prioridades para habilidade, item e poder.
 * Sem equipe, rede neural, alteração de carta ou execução em CI.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { getBoss, getHeroes, getCardById } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";
import { assertLocalReportExecution, LEVELING_RUNS_ROOT } from "../localLevelingReports";
import { playAiGame, type AiStep } from "../ai";
import { setupForRun } from "../profiles";
import { catalogFingerprint } from "./fingerprint";
import { publishedSoloPolicy, soloWeightKey,
  soloDecisionFeatures, type SoloPolicy, type SoloLearningProfile } from "./soloPolicy";
import { mcnemarStatistic } from "./statistics";
import { observedFrequency } from "./dropStatistics";
import { publishedKnowledge } from "./knowledge";

type Difficulty = "very_easy" | "easy" | "normal";
type Focus = "all" | "skills" | "items" | "powers";
type TrainSelection = SoloLearningProfile;
type Context = { hero: string; boss: string; expansion: string; difficulty: Difficulty };
interface Args {
  readonly focus: Focus;
  readonly profile: TrainSelection;
  readonly seed: number;
  readonly runs: number;
  readonly validateRuns: number;
  readonly maxSteps: number;
  readonly maxHeroes: number;
  readonly maxContexts: number;
  readonly maxFeatures: number;
  readonly epochs: number;
  readonly output: string;
  readonly promote: boolean;
  readonly dryRun: boolean;
  readonly hero?: string;
  readonly allHeroes: boolean;
}
const goals: Record<Difficulty, number> = { very_easy: 1, easy: .75, normal: .5 };
const difficulties: readonly Difficulty[] = ["very_easy", "easy", "normal"];
const focusKinds: Record<Exclude<Focus, "all">, readonly string[]> = {
  skills: ["decision:skill", "decision:reaction", "skill@", "reaction@"],
  items: ["decision:item", "decision:loot", "item@", "loot@"],
  powers: ["decision:power", "power@"],
};
const featuresFromAction = (step: AiStep, action: AiStep["chosen"]["action"]) =>
  soloDecisionFeatures(step.before, action);

function parse(args: readonly string[]): Args {
  const params = new Map<string, string>();
  let promote = false, dryRun = false, allHeroes = false;
  const flags = args.filter(value => value !== "--");
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    if (flag === "--promote") { promote = true; continue; }
    if (flag === "--dry-run") { dryRun = true; continue; }
    if (flag === "--all-heroes") { allHeroes = true; continue; }
    if (!["--profile", "--focus", "--seed", "--runs", "--validate-runs", "--max-steps",
      "--max-heroes", "--max-contexts", "--max-features", "--epochs",
      "--output", "--hero"].includes(flag))
      throw new Error("Flag desconhecida: " + flag);
    if (!flags[i + 1]) throw new Error("Falta valor de " + flag);
    params.set(flag, flags[++i]!);
  }
  if (promote && dryRun) throw new Error("--promote não combina com --dry-run");
  if (allHeroes && params.has("--hero")) throw new Error("Use --hero OU --all-heroes");
  const numeric = (name: string, fallback: number): number => {
    const value = params.has(name) ? Number(params.get(name)) : fallback;
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(name + " exige inteiro positivo");
    return value;
  };
  const profile = params.get("--profile") ?? "power-player";
  if (profile !== "power-player")
    throw new Error("--profile aceita somente power-player; Speedrunner foi incorporado ao Power Player");
  const focus = params.get("--focus") ?? "all";
  if (!["all", "skills", "items", "powers"].includes(focus))
    throw new Error("--focus exige all, skills, items ou powers");
  const seed = numeric("--seed", 1);
  const runs = numeric("--runs", 2);
  const validateRuns = numeric("--validate-runs", 12);
  const epochs = numeric("--epochs", 1);
  // Seeds reservadas para validação começam em +200000. Nunca permitir
  // que uma época de treinamento atravesse esse conjunto separado.
  if (epochs > 19) throw new Error("--epochs aceita no máximo 19 para proteger as seeds reservadas");
  if (seed + Math.max(200000 + validateRuns, (epochs - 1) * 10000 + runs) > 2147483647)
    throw new Error("Seeds ultrapassam o limite seguro");
  const output = resolve(params.get("--output") ??
    join(LEVELING_RUNS_ROOT, "solo-train-" + new Date().toISOString().replace(/[:.]/g, "-")));
  if (!output.startsWith(LEVELING_RUNS_ROOT + sep)) throw new Error("Output fora de tools/bot/runs");
  return { focus: focus as Focus, profile: profile as TrainSelection, seed, runs, validateRuns,
    maxSteps: numeric("--max-steps", 1000),
    maxHeroes: numeric("--max-heroes", 4), maxContexts: numeric("--max-contexts", 12),
    maxFeatures: numeric("--max-features", 9), epochs,
    output, promote, dryRun, hero: params.get("--hero"), allHeroes };
}
function contexts(options: Args): Context[] {
  const all = getHeroes().map(h => h.id).sort();
  if (options.hero && !all.includes(options.hero)) throw new Error("Herói não encontrado: " + options.hero);
  // Rotação entre execuções: mude --seed para percorrer o catálogo ao longo do tempo.
  const start = (options.seed - 1) % all.length;
  const rotated = [...all.slice(start), ...all.slice(0, start)];
  const selected = options.hero ? [options.hero] :
    options.allHeroes ? all : rotated.slice(0, options.maxHeroes);
  const bosses = getEnabledExpansions().map(exp => ({
    expansion: exp.id, boss: getBoss(exp.id)?.id,
  })).filter((x): x is { expansion: string; boss: string } => !!x.boss);
  if (!bosses.length || !selected.length) throw new Error("Catálogo vazio para treino");
  // Intercala herói, expansão e dificuldade em vez de usar somente a primeira expansão.
  const full = selected.flatMap(hero => bosses.flatMap(exp =>
    difficulties.map(difficulty => ({ hero, ...exp, difficulty }))));
  const chosen: Context[] = [];
  const rest = [...full];
  const used = new Set<string>();
  while (chosen.length < options.maxContexts && rest.length) {
    let pick = 0, max = -1;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i]!;
      const score = [c.hero, c.expansion, c.difficulty].filter(f => !used.has(f)).length;
      if (score > max) { max = score; pick = i; }
    }
    const [c] = rest.splice(pick, 1);
    chosen.push(c!);
    used.add(c!.hero); used.add(c!.expansion); used.add(c!.difficulty);
  }
  return chosen;
}
interface Trial {
  readonly win: boolean;
  readonly violation: boolean;
  readonly rooms: number;
  readonly steps: number;
  readonly observed: Readonly<Record<string, number>>;
  readonly items: Readonly<Record<string, { opportunities: number; uses: number; pickups: number }>>;
  readonly drops: Readonly<Record<string, number>>;
  readonly itemDrawEvents: number;
}
function runTrial(c: Context, seed: number, maxSteps: number,
  policy: SoloPolicy, profile: SoloLearningProfile,
  telemetry = false, currentBot = false): Trial {
  const observed: Record<string, number> = {};
  const drops: Record<string, number> = {};
  let itemDrawEvents = 0;
  const items: Record<string, { opportunities: number; uses: number; pickups: number }> = {};
  const itemRecord = (id: string) => {
    if (!items[id]) items[id] = { opportunities: 0, uses: 0, pickups: 0 };
    return items[id]!;
  };
  const onStep = telemetry ? (step: AiStep): void => {
    // Diferença de multiconjuntos da pilha visível: conta retiradas do baralho,
    // inclusive cartas repetidas, sem atribuir causalidade ao herói selecionado.
    const remaining = new Map<string, number>();
    for (const id of step.after.decks.itemDeck.available)
      remaining.set(id, (remaining.get(id) ?? 0) + 1);
    for (const id of step.before.decks.itemDeck.available) {
      const count = remaining.get(id) ?? 0;
      if (count > 0) { remaining.set(id, count - 1); continue; }
      const card = getCardById(id);
      if (card?.type === "item" || card?.type === "ally") {
        drops[id] = (drops[id] ?? 0) + 1;
        itemDrawEvents++;
      }
    }
    const opportunities = new Set<string>();
    const offeredItems = new Set<string>();
    for (const choice of step.options) {
      for (const feature of featuresFromAction(step, choice.action)) opportunities.add(feature);
      if (choice.action.type === "USE_ITEM" || choice.action.type === "USE_REWARD_ITEM")
        offeredItems.add(choice.action.payload.itemId);
    }
    for (const key of opportunities) observed[key] = (observed[key] ?? 0) + 1;
    for (const id of offeredItems) itemRecord(id).opportunities++;
    const selected = step.chosen.action;
    if (selected.type === "USE_ITEM" || selected.type === "USE_REWARD_ITEM")
      itemRecord(selected.payload.itemId).uses++;
    if (selected.type === "CHOOSE_ITEM_DESTINATION" && selected.payload.destination === "equip") {
      const reward = step.before.pendingRewards[0];
      if (reward) itemRecord(reward.cardId).pickups++;
    }
  } : undefined;
  const result = playAiGame({
    ...setupForRun(seed, [c.hero], c.difficulty), bossCardId: c.boss,
  }, maxSteps, onStep, profile, undefined, publishedKnowledge.rules,
    !currentBot, false, policy, !currentBot);
  return { win: result.outcome === "VICTORY" && !result.violation,
    violation: result.violation !== null, rooms: result.roomsCleared,
    steps: result.steps, observed, items, drops, itemDrawEvents };
}
function score(result: Trial): number {
  // O estrategista unificado vence primeiro e busca menos ações em vitórias.
  // Uma derrota rápida nunca gera bônus de velocidade.
  return result.win
    ? 600 + result.rooms * 2 - result.steps * 0.12
    : -250 + result.rooms * 12 - (result.violation ? 210 : 0);
}
export function candidateFeatures(counts: Readonly<Record<string, number>>,
  options: Pick<Args, "focus" | "maxFeatures">): string[] {
  const base = (name: string) => name.slice(name.indexOf("|") + 1);
  const entries = Object.entries(counts).filter(([name, seen]) =>
    seen >= (name.includes("@card:") || name.includes("@ability:") ? 2 : 4) &&
    !name.includes("@phase:") && !name.includes("@timing:"));
  const rank = (name: string): number =>
    base(name).startsWith("decision:") ? 0 :
    name.includes("@power:") || name.includes("@item:") ||
      name.includes("@loot:") || name.includes("@effect:") ? 1 :
    name.includes("@itemclass:") || name.includes("@lootclass:") ||
      name.includes("@health:") || name.includes("@threat:") ||
      name.includes("@recovery:") || name.includes("@reaction:") ? 2 : 3;
  const choose = (focus: Exclude<Focus, "all">) => entries.filter(([name]) =>
    focusKinds[focus].some(prefix => base(name).startsWith(prefix)))
    .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(x => x[0]);
  // Um ranking global concentrava os nove primeiros ajustes em 1–2
  // heróis e deixava os outros sem qualquer tentativa de aprendizado.
  // Intercalar heróis por categoria mantém a amostra de treino diversa.
  const distributeHeroes = (rows: readonly string[], shift: number): string[] => {
    const grouped = new Map<string, string[]>();
    for (const name of rows) {
      const owner = name.slice(0, name.indexOf("|"));
      if (!grouped.has(owner)) grouped.set(owner, []);
      grouped.get(owner)!.push(name);
    }
    const ids = [...grouped.keys()].sort();
    const rotated = ids.length ? [...ids.slice(shift % ids.length),
      ...ids.slice(0, shift % ids.length)] : [];
    const ordered: string[] = [];
    while (rotated.some(hero => grouped.get(hero)!.length)) {
      for (const hero of rotated) {
        const feature = grouped.get(hero)!.shift();
        if (feature) ordered.push(feature);
      }
    }
    return ordered;
  };
  if (options.focus !== "all")
    return distributeHeroes(choose(options.focus), 0).slice(0, options.maxFeatures);
  const pools = [choose("skills"), choose("items"), choose("powers")]
    .map((rows, index) => distributeHeroes(rows, index));
  const result: string[] = [];
  while (result.length < options.maxFeatures && pools.some(pool => pool.length)) {
    for (const pool of pools) {
      const next = pool.shift();
      if (next && !result.includes(next)) result.push(next);
      if (result.length >= options.maxFeatures) break;
    }
  }
  return result;
}
interface Comparison { pairs: number; baseWins: number; nextWins: number;
  baseViolations: number; nextViolations: number;
  improvedOnly: number; baselineOnly: number; statistic: number;
  sharedVictories: number; baseStepsShared: number; nextStepsShared: number;
  relativeStepReduction: number;
}
function compare(base: readonly Trial[], candidate: readonly Trial[]): Comparison {
  let baseWins = 0, nextWins = 0, baseViolations = 0, nextViolations = 0;
  let improvedOnly = 0, baselineOnly = 0, sharedVictories = 0;
  let baseStepsShared = 0, nextStepsShared = 0;
  for (let i = 0; i < base.length; i++) {
    const a = base[i]!, b = candidate[i]!;
    if (a.win) baseWins++;
    if (b.win) nextWins++;
    if (a.violation) baseViolations++;
    if (b.violation) nextViolations++;
    if (!a.win && b.win) improvedOnly++;
    if (a.win && !b.win) baselineOnly++;
    if (a.win && b.win) {
      sharedVictories++;
      baseStepsShared += a.steps;
      nextStepsShared += b.steps;
    }
  }
  return { pairs: base.length, baseWins, nextWins, baseViolations, nextViolations,
    improvedOnly, baselineOnly, statistic: mcnemarStatistic(improvedOnly, baselineOnly),
    sharedVictories, baseStepsShared, nextStepsShared,
    relativeStepReduction: baseStepsShared > 0
      ? (baseStepsShared - nextStepsShared) / baseStepsShared : 0 };
}
async function trainOne(options: Args, profile: SoloLearningProfile): Promise<void> {
  const matrix = contexts(options);
  const fingerprint = catalogFingerprint();
  // Política única: pesos por herói + contexto, com vitória como prioridade.
  const policyPath = resolve("src/data/soloPolicy.json");
  const disk = JSON.parse(await readFile(policyPath, "utf8")) as SoloPolicy;
  const initial: SoloPolicy = { version: 1, catalogFingerprint: fingerprint,
    weights: { ...(disk.catalogFingerprint === fingerprint ? disk.weights : publishedSoloPolicy.weights) } };
  const outputDirectory = join(options.output, profile);
  if (options.dryRun) {
    console.info(JSON.stringify({ mode: "solo-training-plan", profile, focus: options.focus,
      heroes: [...new Set(matrix.map(x => x.hero))], contexts: matrix.length,
      trainingMatchesPerCandidate: matrix.length * options.runs,
      validationPairs: matrix.length * options.validateRuns,
      featuresLimit: options.maxFeatures, epochs: options.epochs,
      teams: false, catalogFingerprint: fingerprint }, null, 2));
    return;
  }
  const trainTasks = matrix.flatMap(c => Array.from({ length: options.runs },
    (_, i) => ({ context: c, seed: options.seed + i })));
  const validationTasks = matrix.flatMap(c => Array.from({ length: options.validateRuns },
    (_, i) => ({ context: c, seed: options.seed + 200000 + i })));
  const first = trainTasks.map(({ context, seed }) =>
    runTrial(context, seed, options.maxSteps, initial, profile, true));
  const counts: Record<string, number> = {};
  const itemCatalog: Record<string, { opportunities: number; uses: number; pickups: number }> = {};
  const dropByContext = new Map<string, { games: number; totalDrawEvents: number;
    perItem: Map<string, { occurrences: number; gamesSeen: number }> }>();
  for (let index = 0; index < first.length; index++) {
    const game = first[index]!;
    const ctx = trainTasks[index]!.context;
    const key = [ctx.hero, ctx.expansion, ctx.difficulty].join("|");
    const row = dropByContext.get(key) ?? { games: 0, totalDrawEvents: 0,
      perItem: new Map<string, { occurrences: number; gamesSeen: number }>() };
    row.games++; row.totalDrawEvents += game.itemDrawEvents;
    for (const [itemId, occurrences] of Object.entries(game.drops)) {
      const old = row.perItem.get(itemId) ?? { occurrences: 0, gamesSeen: 0 };
      row.perItem.set(itemId, {
        occurrences: old.occurrences + occurrences, gamesSeen: old.gamesSeen + 1,
      });
    }
    dropByContext.set(key, row);
  }
  for (const trial of first) {
    for (const [key, amount] of Object.entries(trial.observed))
      counts[key] = (counts[key] ?? 0) + amount;
    for (const [id, row] of Object.entries(trial.items)) {
      const entry = itemCatalog[id] ?? { opportunities: 0, uses: 0, pickups: 0 };
      itemCatalog[id] = { opportunities: entry.opportunities + row.opportunities,
        uses: entry.uses + row.uses, pickups: entry.pickups + row.pickups };
    }
  }
  const features = candidateFeatures(counts, options)
    .map(key => soloWeightKey(profile, key));
  let current = initial;
  let baseline = first;
  const explored: Array<{ epoch: number; feature: string; previous: number;
    next: number; scoreGain: number }> = [];
  for (let epoch = 0; epoch < options.epochs; epoch++) {
    // O Power Player unificado também explora seeds novas em outras épocas,
    // equilibrando ganho de vitória e economia de ações.
    const epochTasks = epoch === 0 ? trainTasks : trainTasks.map(task =>
      ({ ...task, seed: task.seed + epoch * 10000 }));
    const epochBaseline = epoch === 0 ? baseline : epochTasks.map(({ context, seed }) =>
      runTrial(context, seed, options.maxSteps, current, profile));
    let best: { feature: string; value: number; gain: number; results: Trial[] } | undefined;
    for (const feature of features) {
      const previous = current.weights[feature] ?? 0;
      for (const shift of [-140, -70, 70, 140]) {
        const value = Math.max(-220, Math.min(220, previous + shift));
        if (value === previous) continue;
        const probe: SoloPolicy = { version: 1, catalogFingerprint: fingerprint,
          weights: { ...current.weights, [feature]: value } };
        const results = epochTasks.map(({ context, seed }) =>
          runTrial(context, seed, options.maxSteps, probe, profile));
        const gain = results.reduce((total, trial, i) =>
          total + score(trial) - score(epochBaseline[i]!), 0);
        if (gain > (best?.gain ?? 0)) best = { feature, value, gain, results };
      }
      console.info("Instrutor solo [" + profile + "]:", epoch + 1, "/", options.epochs,
        feature, "avaliado");
    }
    if (!best) {
      // Sem ganho nesta época: pode testar outra seed, mantendo validação
      // reservada independente de todas as tentativas anteriores.
      continue;
    }
    explored.push({ epoch: epoch + 1, feature: best.feature,
      previous: current.weights[best.feature] ?? 0, next: best.value, scoreGain: best.gain });
    current = { version: 1, catalogFingerprint: fingerprint,
      weights: { ...current.weights, [best.feature]: best.value } };
    baseline = best.results;
  }
  // Avalia a política FINAL uma única vez em seeds nunca usadas no treinamento.
  const baseValidation = validationTasks.map(({ context, seed }) =>
    runTrial(context, seed, options.maxSteps, initial, profile));
  const learnedValidation = validationTasks.map(({ context, seed }) =>
    runTrial(context, seed, options.maxSteps, current, profile));
  const validation = compare(baseValidation, learnedValidation);
  // Gate extra: a política candidata precisa superar TAMBÉM a política
  // efetivamente publicada (legado + combos antigos quando ainda ativos).
  const deployed = validationTasks.map(({ context, seed }) =>
    runTrial(context, seed, options.maxSteps, initial, profile, false, true));
  const versusCurrentBot = compare(deployed, learnedValidation);
  const changed = JSON.stringify(current.weights) !== JSON.stringify(initial.weights);
  const passes = (comparison: Comparison) => {
    if (comparison.pairs < 40 || comparison.nextViolations > comparison.baseViolations) return false;
    const statisticallyBetter = comparison.nextWins - comparison.baseWins >= 4 &&
      comparison.statistic >= 6.64;
    // A otimização por velocidade só é válida entre vitórias compartilhadas,
    // sem perder vitórias nem ampliar violações do motor.
    const faster = comparison.nextWins >= comparison.baseWins &&
      comparison.sharedVictories >= 8 && comparison.relativeStepReduction >= .05;
    return statisticallyBetter || faster;
  };
  const validationByHero = [...new Set(matrix.map(row => row.hero))].map(hero => {
    const indices = validationTasks.flatMap((task, index) =>
      task.context.hero === hero ? [index] : []);
    const only = (trials: readonly Trial[]) => indices.map(index => trials[index]!);
    return { hero, againstAdaptive: compare(only(baseValidation), only(learnedValidation)),
      againstPublished: compare(only(deployed), only(learnedValidation)) };
  });
  // Ganhar no agregado não autoriza piorar muito um único herói.
  // Uma vitória de tolerância por controle evita bloquear por ruído pequeno,
  // mantendo visível a regressão por personagem no relatório.
  const perHeroSafe = validationByHero.every(entry =>
    [entry.againstAdaptive, entry.againstPublished].every(group =>
      group.nextWins + 1 >= group.baseWins &&
      group.nextViolations <= group.baseViolations));
  const verified = changed && passes(validation) && passes(versusCurrentBot) && perHeroSafe;
  await mkdir(outputDirectory, { recursive: true });
  const report = {
    version: 2, generatedAt: new Date().toISOString(), profile, focus: options.focus, options,
    catalogFingerprint: fingerprint, heroes: [...new Set(matrix.map(x => x.hero))],
    contexts: matrix, trainingGames: first.length, candidates: features,
    learning: explored, validation, versusCurrentBot, validationByHero,
    perHeroSafe, verified,
    itemsObserved: Object.entries(itemCatalog).map(([id, row]) => ({ cardId: id, ...row }))
      .sort((a, b) => b.uses - a.uses || b.opportunities - a.opportunities),
    initialWeights: initial.weights, learnedWeights: current.weights,
    caveat: "Itens observados não são ranking causal: preferências só são promovidas pela avaliação A/B.",
    goals,
  };
  const dropObservations = [...dropByContext.entries()].map(([context, row]) => ({
    context, games: row.games, itemDrawEvents: row.totalDrawEvents,
    items: [...row.perItem.entries()].map(([cardId, seen]) => ({
      cardId, ...seen,
      perDraw: observedFrequency(seen.occurrences, row.totalDrawEvents),
      perGame: observedFrequency(seen.gamesSeen, row.games),
      sampleSufficientForRanking: row.totalDrawEvents >= 30,
    })).sort((a, b) => b.occurrences - a.occurrences),
  }));
  await writeFile(join(outputDirectory, "item-drop-observations.json"),
    JSON.stringify({ profile, sample: "observed-run-transitions",
      warning: "Frequência observada, NÃO probabilidade causal de drop por herói. Rotas e quantidade de recompensas podem mudar entre estilos de jogo.",
      contexts: dropObservations }, null, 2));
  await writeFile(join(outputDirectory, "solo-training-report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(outputDirectory, "solo-policy-candidate.json"), JSON.stringify(current, null, 2));
  if (options.promote && verified) {
    const old = JSON.parse(await readFile(policyPath, "utf8")) as SoloPolicy;
    if (old.catalogFingerprint !== fingerprint && Object.keys(old.weights).length)
      await writeFile(join(outputDirectory, "previous-solo-policy.json"), JSON.stringify(old, null, 2));
    await writeFile(policyPath, JSON.stringify(current, null, 2) + "\n");
    console.info("Política solo validada e promovida para src/data/soloPolicy.json.");
  } else if (options.promote) {
    console.info("Política NÃO promovida: ganho independente insuficiente.");
  }
  console.info("Treino [" + profile + "] concluído:", explored.length, "ajustes,",
    validation.pairs, "pares de validação, confirmado:", verified);
  console.info("Relatório:", join(outputDirectory, "solo-training-report.json"));
}
async function main(): Promise<void> {
  assertLocalReportExecution();
  const options = parse(process.argv.slice(2));
  await trainOne(options, options.profile);
}
if (process.env.VITEST === undefined) main().catch(error => {
  console.error(error); process.exitCode = 1;
});
