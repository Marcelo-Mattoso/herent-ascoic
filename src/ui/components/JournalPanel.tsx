import { i18n, translate } from "@/i18n";
import { useState } from "react";
import {
	exportJournalJson,
	exportJournalText,
	type GameJournal,
	type JournalCard,
	type JournalEnemy,
	type JournalHero,
	type JournalModifier,
	type JournalSkill,
	type JournalStateSnapshot,
} from "@/core/journal/gameJournal";

function download(name: string, content: string, type: string) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SLOT_NAMES: Record<string, string> = {
	clothing1: "journal:slots.clothing1",
	clothing2: "journal:slots.clothing2",
	hand1: "journal:slots.hand1",
	hand2: "journal:slots.hand2",
	amulet: "journal:slots.amulet",
};

const TARGET_NAMES: Record<string, string> = {
	damage_dealt: "journal:targets.damageDealt",
	damage_taken: "journal:targets.damageTaken",
	purple_damage_taken: "journal:targets.purpleDamageTaken",
	healing_received: "journal:targets.healingReceived",
	dice_count: "journal:targets.diceCount",
	hit_bonus: "journal:targets.hitBonus",
};

function cardName(id: string, fallback: string) {
	return i18n.exists(`${id}.name`, { ns: "cards" }) ? translate(`cards:${id}.name`) : fallback;
}

function skillName(id: string, fallback: string) {
	return i18n.exists(`${id}.name`, { ns: "skills" }) ? translate(`skills:${id}.name`) : fallback;
}

function SkillList({ skills }: { skills: readonly JournalSkill[] }) {
	if (!skills.length) return <p>{translate("journal:components.journalPanel.text001")}</p>;
	return (
		<ul className="journal-list">
			{skills.map((skill) => (
				<li key={skill.id}>
					<strong>{skillName(skill.id, skill.name)}</strong>{" "}
					<small>
						({skill.activation}
						{skill.used ? translate("journal:components.journalPanel.dynamic001") : ""})
					</small>
					{skill.text && <div>{skill.text}</div>}
					{skill.requirements && <small>{skill.requirements}</small>}
				</li>
			))}
		</ul>
	);
}

function CardLine({ card }: { card: JournalCard | null }) {
	if (!card) return <>{translate("journal:components.journalPanel.text002")}</>;
	return (
		<>
			<strong>{cardName(card.id, card.name)}</strong>{" "}
			<small>
				({card.id}
				{card.state
					? ` · ${card.state === "exhausted" ? "exaurido" : "pronto"}`
					: ""}
				)
			</small>
			{card.restriction && (
				<div>
					<small>{card.restriction}</small>
				</div>
			)}
			{card.skills.length > 0 && (
				<details>
					<summary>{translate("journal:components.journalPanel.text003")}</summary>
					<SkillList skills={card.skills} />
				</details>
			)}
		</>
	);
}

function ModifierList({
	modifiers,
}: {
	modifiers: readonly JournalModifier[];
}) {
	if (!modifiers.length) return <p>{translate("journal:components.journalPanel.text004")}</p>;
	return (
		<ul className="journal-list">
			{modifiers.map((mod, index) => (
				<li key={`${mod.sourceId}:${mod.target}:${index}`}>
					{TARGET_NAMES[mod.target] ? translate(TARGET_NAMES[mod.target]) : mod.target}: {mod.operation}{" "}
					{mod.value > 0 ? "+" : ""}
					{mod.value}
					{" · "}
					{mod.source}{" "}
					<small>
						({mod.duration}
						{mod.conditional ? translate("journal:components.journalPanel.dynamic002") : ""})
					</small>
				</li>
			))}
		</ul>
	);
}

function HeroSection({ hero }: { hero: JournalHero }) {
	return (
		<details className="journal-card" open>
			<summary>
				{cardName(hero.cardId, hero.name)}{" "}
				<small>
					({hero.id} · {hero.status})
				</small>
			</summary>
			<div className="journal-card__body">
				<p>
					{translate("journal:components.journalPanel.text005")}{" "}{hero.life}/{hero.maxLife} {translate("journal:components.journalPanel.text006")}{" "}{hero.damage} {translate("journal:components.journalPanel.text007")}{" "}{hero.hitBonus} {translate("journal:components.journalPanel.text008")}{" "}{hero.dice} {translate("journal:components.journalPanel.text009")}{" "}{hero.impeto} {translate("journal:components.journalPanel.text010")}{" "}
					{hero.xp}
				</p>
				{hero.healBlocked && <p>{translate("journal:components.journalPanel.text011")}</p>}
				{hero.conditions.length > 0 && (
					<p>{translate("journal:components.journalPanel.text012")}{" "}{hero.conditions.join(", ")}</p>
				)}
				{hero.usedPowers.length > 0 && (
					<p>{translate("journal:components.journalPanel.text013")}{" "}{hero.usedPowers.join(", ")}</p>
				)}
				<h4>{translate("journal:components.journalPanel.text014")}</h4>
				<ul className="journal-list">
					{hero.equipment.map((slot) => (
						<li key={slot.slot}>
							{SLOT_NAMES[slot.slot] ? translate(SLOT_NAMES[slot.slot]) : slot.slot}:{" "}
							{slot.sharedWith ? (
								<em>{translate("journal:components.journalPanel.text015")}</em>
							) : (
								<CardLine card={slot.card} />
							)}
						</li>
					))}
				</ul>
				<h4>
					{translate("journal:components.journalPanel.text016")}{hero.backpack.filter(Boolean).length}/{hero.backpack.length}
					)
				</h4>
				<ol className="journal-list">
					{hero.backpack.map((card, index) => (
						<li key={index}>
							<CardLine card={card} />
						</li>
					))}
				</ol>
				<h4>{translate("journal:components.journalPanel.text017")}</h4>
				<SkillList skills={hero.skills} />
				<h4>{translate("journal:components.journalPanel.text018")}</h4>
				<ModifierList modifiers={hero.modifiers} />
				<small>
					{translate("journal:components.journalPanel.text019")}{" "}</small>
			</div>
		</details>
	);
}

function EnemySection({ enemy }: { enemy: JournalEnemy }) {
	return (
		<details className="journal-card" open>
			<summary>
				{cardName(enemy.cardId, enemy.name)}{" "}
				<small>
					({enemy.id} · {enemy.status})
				</small>
			</summary>
			<div className="journal-card__body">
				<p>
					{translate("journal:components.journalPanel.text020")}{" "}{enemy.life}/{enemy.maxLife} {translate("journal:components.journalPanel.text021")}{" "}{enemy.damage} {translate("journal:components.journalPanel.text022")}{" "}{enemy.hitBonus} {translate("journal:components.journalPanel.text023")}{" "}{enemy.dice}
				</p>
				{enemy.conditions.length > 0 && (
					<p>{translate("journal:components.journalPanel.text024")}{" "}{enemy.conditions.join(", ")}</p>
				)}
				{Object.keys(enemy.tokens).length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text025")}{" "}
						{Object.entries(enemy.tokens)
							.map(([key, count]) => `${key}: ${count}`)
							.join(", ")}
					</p>
				)}
				<h4>{translate("journal:components.journalPanel.text026")}</h4>
				<ModifierList modifiers={enemy.modifiers} />
				<small>
					{translate("journal:components.journalPanel.text027")}{" "}</small>
				<h4>{translate("journal:components.journalPanel.text028")}</h4>
				<SkillList skills={enemy.skills} />
			</div>
		</details>
	);
}

function StateContents({ snapshot }: { snapshot: JournalStateSnapshot }) {
	return (
		<div className="journal-state">
			<section>
				<h3>{translate("journal:components.journalPanel.text029")}</h3>
				<p>
					{translate("journal:components.journalPanel.text030")}{" "}{snapshot.status} {translate("journal:components.journalPanel.text031")}{" "}{snapshot.round ?? "—"} {translate("journal:components.journalPanel.text032")}{" "}
					{snapshot.combatPhase ?? "—"}
				</p>
				{snapshot.selectedHeroId && (
					<p>
						{translate("journal:components.journalPanel.text033")}{" "}
						{snapshot.heroes.find((hero) => hero.id === snapshot.selectedHeroId)
							?.name ?? snapshot.selectedHeroId}
					</p>
				)}
				{snapshot.combatPairs.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text034")}{" "}
						{snapshot.combatPairs
							.map(
								(pair) =>
									`${snapshot.heroes.find((hero) => hero.id === pair.heroId)?.name ?? pair.heroId} → ${snapshot.enemies.find((enemy) => enemy.id === pair.enemyId)?.name ?? pair.enemyId}`,
							)
							.join("; ")}
					</p>
				)}
				<p>
					{translate("journal:components.journalPanel.text035")}{" "}{snapshot.room?.card.name ?? "Nenhuma"}
					{snapshot.room ? ` (${snapshot.room.status})` : ""}
				</p>
				{snapshot.room?.effect && <p>{translate("journal:components.journalPanel.text036")}{" "}{snapshot.room.effect}</p>}
				<p>
					{translate("journal:components.journalPanel.text037")}{" "}{snapshot.despertar} {translate("journal:components.journalPanel.text038")}{" "}{snapshot.groupXp} {translate("journal:components.journalPanel.text039")}{" "}{snapshot.roomsCleared} {translate("journal:components.journalPanel.text040")}{" "}
					{snapshot.creaturesDefeated}
				</p>
				{snapshot.issues.length > 0 && (
					<>
						<h4>{translate("journal:components.journalPanel.text041")}</h4>
						<ul className="journal-list">
							{snapshot.issues.map((issue, index) => (
								<li key={index}>{issue}</li>
							))}
						</ul>
					</>
				)}
				{snapshot.roomModifiers.length > 0 && (
					<>
						<h4>{translate("journal:components.journalPanel.text042")}</h4>
						<ul className="journal-list">
							{snapshot.roomModifiers.map(({ targetId, modifier }, index) => (
								<li key={`${targetId}:${index}`}>
									{targetId}: {TARGET_NAMES[modifier.target] ? translate(TARGET_NAMES[modifier.target]) : modifier.target}{" "}
									{modifier.value > 0 ? "+" : ""}
									{modifier.value} · {modifier.source} ({modifier.duration})
								</li>
							))}
						</ul>
					</>
				)}
				{snapshot.flags.length > 0 && (
					<p>{translate("journal:components.journalPanel.text043")}{" "}{snapshot.flags.join(", ")}</p>
				)}
				{snapshot.blocks.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text044")}{" "}
						{snapshot.blocks
							.map((block) => `${block.key} (${block.sources.join(", ")})`)
							.join("; ")}
					</p>
				)}
				{snapshot.tokens.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text045")}{" "}
						{snapshot.tokens
							.map((token) => `${token.key}: ${token.count}`)
							.join(", ")}
					</p>
				)}
				{snapshot.temporaryEffects.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text046")}{" "}
						{snapshot.temporaryEffects
							.map(
								(effect) =>
									`${effect.description} (${effect.roundsLeft} rodadas)`,
							)
							.join("; ")}
					</p>
				)}
				{snapshot.pendingChoices.length > 0 && (
					<p>{translate("journal:components.journalPanel.text047")}{" "}{snapshot.pendingChoices.join("; ")}</p>
				)}
				{snapshot.pendingRewards.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text048")}{" "}
							{snapshot.pendingRewards.map((card) => cardName(card.id, card.name)).join(", ")}
					</p>
				)}
				{snapshot.revealedPaths.length > 0 && (
					<p>
						{translate("journal:components.journalPanel.text049")}{" "}
							{snapshot.revealedPaths.map((card) => cardName(card.id, card.name)).join(", ")}
					</p>
				)}
			</section>
			<section>
				<h3>{translate("journal:components.journalPanel.text050")}</h3>
				{snapshot.heroes.length ? (
					snapshot.heroes.map((hero) => (
						<HeroSection key={hero.id} hero={hero} />
					))
				) : (
					<p>{translate("journal:components.journalPanel.text051")}</p>
				)}
			</section>
			<section>
				<h3>{translate("journal:components.journalPanel.text052")}</h3>
				{snapshot.enemies.length ? (
					snapshot.enemies.map((enemy) => (
						<EnemySection key={enemy.id} enemy={enemy} />
					))
				) : (
					<p>{translate("journal:components.journalPanel.text053")}</p>
				)}
				{snapshot.defeatedEnemies.length > 0 && (
					<details>
						<summary>{translate("journal:components.journalPanel.text054")}{snapshot.defeatedEnemies.length})</summary>
						{snapshot.defeatedEnemies.map((enemy) => (
							<EnemySection key={enemy.id} enemy={enemy} />
						))}
					</details>
				)}
			</section>
			<section>
				<h3>{translate("journal:components.journalPanel.text055")}</h3>
				{snapshot.artifacts.length ? (
					<ul className="journal-list">
						{snapshot.artifacts.map((artifact, index) => (
							<li key={`${artifact.card.id}:${index}`}>
								<CardLine card={artifact.card} /> · {artifact.state} {translate("journal:components.journalPanel.text056")}{" "}
								{snapshot.heroes.find((hero) => hero.id === artifact.carriedBy)
									?.name ?? "Grupo"}
							</li>
						))}
					</ul>
				) : (
					<p>{translate("journal:components.journalPanel.text057")}</p>
				)}
			</section>
			<section>
				<h3>{translate("journal:components.journalPanel.text058")}</h3>
				<ul className="journal-list">
					{snapshot.decks.map((deck) => (
						<li key={deck.id}>
							<strong>{deck.id}</strong>: {deck.available} {translate("journal:components.journalPanel.text059")}{" "}
							{deck.discarded.length} {translate("journal:components.journalPanel.text060")}{" "}{deck.removed} {translate("journal:components.journalPanel.text061")}{" "}{deck.discarded.length > 0 && (
								<details>
									<summary>{translate("journal:components.journalPanel.text062")}</summary>
									{deck.discarded.map((card, index) => (
															<div key={`${card.id}:${index}`}>{cardName(card.id, card.name)}</div>
									))}
								</details>
							)}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

export function JournalPanel({
	journal,
	onClose,
}: {
	journal: GameJournal;
	onClose: () => void;
}) {
	const [tab, setTab] = useState<"timeline" | "state">("timeline");
	const safeId = journal.gameId.replace(/[^a-z0-9_-]/gi, "_");
	return (
		<section
			className="journal-panel"
			role="dialog"
			aria-modal="true"
			aria-label={translate("journal:components.journalPanel.ariaLabel063")}
		>
			<header className="journal-panel__header">
				<h2>{translate("journal:components.journalPanel.text064")}</h2>
				<button type="button" onClick={onClose} aria-label={translate("journal:components.journalPanel.ariaLabel065")}>
					×
				</button>
			</header>
			<nav className="journal-panel__tabs" aria-label={translate("journal:components.journalPanel.ariaLabel066")}>
				<button
					type="button"
					aria-current={tab === "timeline" ? "page" : undefined}
					onClick={() => setTab("timeline")}
				>
					{translate("journal:components.journalPanel.text067")}{" "}</button>
				<button
					type="button"
					aria-current={tab === "state" ? "page" : undefined}
					onClick={() => setTab("state")}
				>
					{translate("journal:components.journalPanel.text068")}{" "}</button>
			</nav>
			<div className="journal-panel__body">
				{tab === "timeline" ? (
					<>
						{journal.omittedEntries > 0 && (
							<p>
								{translate("journal:components.journalPanel.text069")}{" "}{journal.omittedEntries} {translate("journal:components.journalPanel.text070")}{" "}</p>
						)}
						{journal.entries.length ? (
							[...journal.entries].reverse().map((entry) => (
								<details className="journal-entry" key={entry.actionId}>
									<summary>
										<time>
											{new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" }).format(entry.timestamp)}
										</time>{" "}
										· {entry.summary}
									</summary>
									<div className="journal-entry__body">
										<p>
											{translate("journal:components.journalPanel.text071")}{entry.sequence}: {entry.actionType}
										</p>
										{entry.changes.map((change, index) => (
											<p key={index}>{change}</p>
										))}
										{entry.messages.map((message, index) => (
											<p key={index}>{translate("journal:components.journalPanel.text072")}{" "}{message}</p>
										))}
										{entry.roll && (
											<div className="journal-roll">
												<p>
													{translate("journal:components.journalPanel.text073")}{entry.roll.heroResults.join(", ")}]:{" "}
													{entry.roll.heroBreakdown
														.map(
															(part) =>
																`${part.source} ${part.value > 0 ? "+" : ""}${part.value}`,
														)
														.join("; ")}{" "}
													→ {entry.roll.heroTotal}
												</p>
												<p>
													{translate("journal:components.journalPanel.text074")}{entry.roll.enemyResults.join(", ")}]:{" "}
													{entry.roll.enemyBreakdown
														.map(
															(part) =>
																`${part.source} ${part.value > 0 ? "+" : ""}${part.value}`,
														)
														.join("; ")}{" "}
													→ {entry.roll.enemyTotal}
												</p>
											</div>
										)}
										<details>
											<summary>{translate("journal:components.journalPanel.text075")}</summary>
											<StateContents snapshot={entry.before} />
										</details>
										<details>
											<summary>{translate("journal:components.journalPanel.text076")}</summary>
											<StateContents snapshot={entry.after} />
										</details>
									</div>
								</details>
							))
						) : (
							<p>{translate("journal:components.journalPanel.text077")}</p>
						)}
					</>
				) : (
					<StateContents snapshot={journal.current} />
				)}
			</div>
			<footer className="journal-panel__footer">
				<button
					type="button"
					onClick={() =>
						download(
							`diario-${safeId}.txt`,
							exportJournalText(journal),
							"text/plain;charset=utf-8",
						)
					}
				>
					{translate("journal:components.journalPanel.text078")}{" "}</button>
				<button
					type="button"
					onClick={() =>
						download(
							`diario-${safeId}.json`,
							exportJournalJson(journal),
							"application/json;charset=utf-8",
						)
					}
				>
					{translate("journal:components.journalPanel.text079")}{" "}</button>
			</footer>
		</section>
	);
}
