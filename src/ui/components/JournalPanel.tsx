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
	clothing1: "Vestimenta 1",
	clothing2: "Vestimenta 2",
	hand1: "Mão 1",
	hand2: "Mão 2",
	amulet: "Amuleto",
};

const TARGET_NAMES: Record<string, string> = {
	damage_dealt: "Dano causado",
	damage_taken: "Dano sofrido",
	purple_damage_taken: "Dano roxo sofrido",
	healing_received: "Cura recebida",
	dice_count: "Dados",
	hit_bonus: "Acerto",
};

function SkillList({ skills }: { skills: readonly JournalSkill[] }) {
	if (!skills.length) return <p>Nenhuma habilidade registrada na carta.</p>;
	return (
		<ul className="journal-list">
			{skills.map((skill) => (
				<li key={skill.id}>
					<strong>{skill.name}</strong>{" "}
					<small>
						({skill.activation}
						{skill.used ? ", usada" : ""})
					</small>
					{skill.text && <div>{skill.text}</div>}
					{skill.requirements && <small>{skill.requirements}</small>}
				</li>
			))}
		</ul>
	);
}

function CardLine({ card }: { card: JournalCard | null }) {
	if (!card) return <>Vazio</>;
	return (
		<>
			<strong>{card.name}</strong>{" "}
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
					<summary>Habilidades e efeitos</summary>
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
	if (!modifiers.length) return <p>Nenhum modificador ECS ativo.</p>;
	return (
		<ul className="journal-list">
			{modifiers.map((mod, index) => (
				<li key={`${mod.sourceId}:${mod.target}:${index}`}>
					{TARGET_NAMES[mod.target] ?? mod.target}: {mod.operation}{" "}
					{mod.value > 0 ? "+" : ""}
					{mod.value}
					{" · "}
					{mod.source}{" "}
					<small>
						({mod.duration}
						{mod.conditional ? "; depende do contexto" : ""})
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
				{hero.name}{" "}
				<small>
					({hero.id} · {hero.status})
				</small>
			</summary>
			<div className="journal-card__body">
				<p>
					Vida {hero.life}/{hero.maxLife} · Dano base {hero.damage} · Acerto
					base {hero.hitBonus} · Dados {hero.dice} · Ímpeto {hero.impeto} · XP{" "}
					{hero.xp}
				</p>
				{hero.healBlocked && <p>Cura bloqueada</p>}
				{hero.conditions.length > 0 && (
					<p>Condições: {hero.conditions.join(", ")}</p>
				)}
				{hero.usedPowers.length > 0 && (
					<p>Usos marcados pelo motor: {hero.usedPowers.join(", ")}</p>
				)}
				<h4>Equipamentos</h4>
				<ul className="journal-list">
					{hero.equipment.map((slot) => (
						<li key={slot.slot}>
							{SLOT_NAMES[slot.slot]}:{" "}
							{slot.sharedWith ? (
								<em>Ocupada pela carta da Mão 1</em>
							) : (
								<CardLine card={slot.card} />
							)}
						</li>
					))}
				</ul>
				<h4>
					Mochila ({hero.backpack.filter(Boolean).length}/{hero.backpack.length}
					)
				</h4>
				<ol className="journal-list">
					{hero.backpack.map((card, index) => (
						<li key={index}>
							<CardLine card={card} />
						</li>
					))}
				</ol>
				<h4>Habilidades</h4>
				<SkillList skills={hero.skills} />
				<h4>Modificadores presentes</h4>
				<ModifierList modifiers={hero.modifiers} />
				<small>
					Os totais aplicados, incluindo bônus condicionais de itens, aparecem
					na rolagem da Linha do tempo.
				</small>
			</div>
		</details>
	);
}

function EnemySection({ enemy }: { enemy: JournalEnemy }) {
	return (
		<details className="journal-card" open>
			<summary>
				{enemy.name}{" "}
				<small>
					({enemy.id} · {enemy.status})
				</small>
			</summary>
			<div className="journal-card__body">
				<p>
					Vida {enemy.life}/{enemy.maxLife} · Dano base {enemy.damage} · Acerto
					base {enemy.hitBonus} · Dados {enemy.dice}
				</p>
				{enemy.conditions.length > 0 && (
					<p>Condições: {enemy.conditions.join(", ")}</p>
				)}
				{Object.keys(enemy.tokens).length > 0 && (
					<p>
						Tokens:{" "}
						{Object.entries(enemy.tokens)
							.map(([key, count]) => `${key}: ${count}`)
							.join(", ")}
					</p>
				)}
				<h4>Modificadores presentes</h4>
				<ModifierList modifiers={enemy.modifiers} />
				<small>
					O total aplicado no confronto aparece na rolagem da Linha do tempo.
				</small>
				<h4>Habilidades</h4>
				<SkillList skills={enemy.skills} />
			</div>
		</details>
	);
}

function StateContents({ snapshot }: { snapshot: JournalStateSnapshot }) {
	return (
		<div className="journal-state">
			<section>
				<h3>Tabuleiro</h3>
				<p>
					Fase: {snapshot.status} · Rodada: {snapshot.round ?? "—"} · Combate:{" "}
					{snapshot.combatPhase ?? "—"}
				</p>
				{snapshot.selectedHeroId && (
					<p>
						Herói selecionado:{" "}
						{snapshot.heroes.find((hero) => hero.id === snapshot.selectedHeroId)
							?.name ?? snapshot.selectedHeroId}
					</p>
				)}
				{snapshot.combatPairs.length > 0 && (
					<p>
						Confrontos:{" "}
						{snapshot.combatPairs
							.map(
								(pair) =>
									`${snapshot.heroes.find((hero) => hero.id === pair.heroId)?.name ?? pair.heroId} → ${snapshot.enemies.find((enemy) => enemy.id === pair.enemyId)?.name ?? pair.enemyId}`,
							)
							.join("; ")}
					</p>
				)}
				<p>
					Sala: {snapshot.room?.card.name ?? "Nenhuma"}
					{snapshot.room ? ` (${snapshot.room.status})` : ""}
				</p>
				{snapshot.room?.effect && <p>Efeito da sala: {snapshot.room.effect}</p>}
				<p>
					Despertar: {snapshot.despertar} · XP do grupo: {snapshot.groupXp} ·
					Salas concluídas: {snapshot.roomsCleared} · Criaturas derrotadas:{" "}
					{snapshot.creaturesDefeated}
				</p>
				{snapshot.issues.length > 0 && (
					<>
						<h4>Inconsistências detectadas</h4>
						<ul className="journal-list">
							{snapshot.issues.map((issue, index) => (
								<li key={index}>{issue}</li>
							))}
						</ul>
					</>
				)}
				{snapshot.roomModifiers.length > 0 && (
					<>
						<h4>Modificadores da sala</h4>
						<ul className="journal-list">
							{snapshot.roomModifiers.map(({ targetId, modifier }, index) => (
								<li key={`${targetId}:${index}`}>
									{targetId}: {TARGET_NAMES[modifier.target] ?? modifier.target}{" "}
									{modifier.value > 0 ? "+" : ""}
									{modifier.value} · {modifier.source} ({modifier.duration})
								</li>
							))}
						</ul>
					</>
				)}
				{snapshot.flags.length > 0 && (
					<p>Condições globais: {snapshot.flags.join(", ")}</p>
				)}
				{snapshot.blocks.length > 0 && (
					<p>
						Bloqueios:{" "}
						{snapshot.blocks
							.map((block) => `${block.key} (${block.sources.join(", ")})`)
							.join("; ")}
					</p>
				)}
				{snapshot.tokens.length > 0 && (
					<p>
						Tokens:{" "}
						{snapshot.tokens
							.map((token) => `${token.key}: ${token.count}`)
							.join(", ")}
					</p>
				)}
				{snapshot.temporaryEffects.length > 0 && (
					<p>
						Efeitos temporários:{" "}
						{snapshot.temporaryEffects
							.map(
								(effect) =>
									`${effect.description} (${effect.roundsLeft} rodadas)`,
							)
							.join("; ")}
					</p>
				)}
				{snapshot.pendingChoices.length > 0 && (
					<p>Escolhas pendentes: {snapshot.pendingChoices.join("; ")}</p>
				)}
				{snapshot.pendingRewards.length > 0 && (
					<p>
						Recompensas pendentes:{" "}
						{snapshot.pendingRewards.map((card) => card.name).join(", ")}
					</p>
				)}
				{snapshot.revealedPaths.length > 0 && (
					<p>
						Caminhos revelados:{" "}
						{snapshot.revealedPaths.map((card) => card.name).join(", ")}
					</p>
				)}
			</section>
			<section>
				<h3>Heróis</h3>
				{snapshot.heroes.length ? (
					snapshot.heroes.map((hero) => (
						<HeroSection key={hero.id} hero={hero} />
					))
				) : (
					<p>Nenhum herói.</p>
				)}
			</section>
			<section>
				<h3>Criaturas</h3>
				{snapshot.enemies.length ? (
					snapshot.enemies.map((enemy) => (
						<EnemySection key={enemy.id} enemy={enemy} />
					))
				) : (
					<p>Nenhuma criatura ativa.</p>
				)}
				{snapshot.defeatedEnemies.length > 0 && (
					<details>
						<summary>Derrotadas ({snapshot.defeatedEnemies.length})</summary>
						{snapshot.defeatedEnemies.map((enemy) => (
							<EnemySection key={enemy.id} enemy={enemy} />
						))}
					</details>
				)}
			</section>
			<section>
				<h3>Artefatos</h3>
				{snapshot.artifacts.length ? (
					<ul className="journal-list">
						{snapshot.artifacts.map((artifact, index) => (
							<li key={`${artifact.card.id}:${index}`}>
								<CardLine card={artifact.card} /> · {artifact.state} · Portador:{" "}
								{snapshot.heroes.find((hero) => hero.id === artifact.carriedBy)
									?.name ?? "Grupo"}
							</li>
						))}
					</ul>
				) : (
					<p>Nenhum artefato.</p>
				)}
			</section>
			<section>
				<h3>Baralhos</h3>
				<ul className="journal-list">
					{snapshot.decks.map((deck) => (
						<li key={deck.id}>
							<strong>{deck.id}</strong>: {deck.available} restantes ·{" "}
							{deck.discarded.length} descartadas · {deck.removed} removidas
							{deck.discarded.length > 0 && (
								<details>
									<summary>Descartes visíveis</summary>
									{deck.discarded.map((card, index) => (
										<div key={`${card.id}:${index}`}>{card.name}</div>
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
			aria-label="Diário da partida"
		>
			<header className="journal-panel__header">
				<h2>Diário da partida</h2>
				<button type="button" onClick={onClose} aria-label="Fechar diário">
					×
				</button>
			</header>
			<nav className="journal-panel__tabs" aria-label="Seções do diário">
				<button
					type="button"
					aria-current={tab === "timeline" ? "page" : undefined}
					onClick={() => setTab("timeline")}
				>
					Linha do tempo
				</button>
				<button
					type="button"
					aria-current={tab === "state" ? "page" : undefined}
					onClick={() => setTab("state")}
				>
					Estado atual
				</button>
			</nav>
			<div className="journal-panel__body">
				{tab === "timeline" ? (
					<>
						{journal.omittedEntries > 0 && (
							<p>
								Os {journal.omittedEntries} registros mais antigos saíram da
								memória. O estado atual continua completo.
							</p>
						)}
						{journal.entries.length ? (
							[...journal.entries].reverse().map((entry) => (
								<details className="journal-entry" key={entry.actionId}>
									<summary>
										<time>
											{new Date(entry.timestamp).toLocaleTimeString("pt-BR")}
										</time>{" "}
										· {entry.summary}
									</summary>
									<div className="journal-entry__body">
										<p>
											Ação #{entry.sequence}: {entry.actionType}
										</p>
										{entry.changes.map((change, index) => (
											<p key={index}>{change}</p>
										))}
										{entry.messages.map((message, index) => (
											<p key={index}>Motor: {message}</p>
										))}
										{entry.roll && (
											<div className="journal-roll">
												<p>
													Herói [{entry.roll.heroResults.join(", ")}]:{" "}
													{entry.roll.heroBreakdown
														.map(
															(part) =>
																`${part.source} ${part.value > 0 ? "+" : ""}${part.value}`,
														)
														.join("; ")}{" "}
													→ {entry.roll.heroTotal}
												</p>
												<p>
													Criatura [{entry.roll.enemyResults.join(", ")}]:{" "}
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
											<summary>Ver estado antes desta ação</summary>
											<StateContents snapshot={entry.before} />
										</details>
										<details>
											<summary>Ver estado após esta ação</summary>
											<StateContents snapshot={entry.after} />
										</details>
									</div>
								</details>
							))
						) : (
							<p>Nenhuma ação registrada ainda.</p>
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
					Exportar TXT
				</button>
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
					Exportar JSON
				</button>
			</footer>
		</section>
	);
}
