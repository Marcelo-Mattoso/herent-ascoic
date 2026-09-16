import { useEffect } from "react";
import { getCardName } from "@/core/data/cardLocale";
import { getSkillName } from "@/core/data/skillLocale";
import type { PlayerView } from "@/core/projection/playerView";
import { cardSkills } from "@/core/skills/lookup";
import { renderSkillText } from "@/core/skills/renderLabel";
import type {
	PendingTriggerInterrupt,
	TriggerSourceKind,
	TriggerWindow,
} from "@/core/triggers/engine";
import { useGameStore } from "@/ui/store/gameStore";

const SOURCE_KIND_LABEL: Record<TriggerSourceKind, string> = {
	artifact: "Artefato",
	boss: "Chefe",
	enemy: "Inimigo",
	hero: "Herói",
	item: "Item",
	room: "Sala",
};

const WINDOW_LABEL: Record<TriggerWindow, string> = {
	after_damage: "Depois do dano",
	after_roll_before_result: "Após a rolagem",
	before_attack_roll: "Antes da rolagem de ataque",
	before_combat: "Antes do combate",
	before_damage: "Antes do dano",
	before_destroy: "Antes da destruição",
	combat_end: "Fim do combate",
	dungeon_discard: "Descarte da masmorra",
	entity_enter_play: "Entrada em jogo",
	hero_action: "Ação do herói",
	hero_leave_play: "Saída do herói",
	on_destroy: "Destruição",
	paths_open: "Caminhos abertos",
	room_enter: "Entrada na sala",
	room_leave: "Saída da sala",
	round_end: "Fim da rodada",
	round_start: "Início da rodada",
	targeted: "Alvo escolhido",
};

function effectText(pending: PendingTriggerInterrupt): string {
	if (pending.description && pending.description !== pending.skillId) {
		return pending.description;
	}
	const sourceSkill = cardSkills(pending.sourceCardId).find(
		({ ref }) => ref.skillId === pending.skillId,
	);
	if (!sourceSkill) return getSkillName(pending.skillId);
	return renderSkillText(sourceSkill.ref);
}

function sourceText(
	pending: PendingTriggerInterrupt,
	view: PlayerView,
): string {
	const cardName = getCardName(pending.sourceCardId);
	const hero = pending.sourceHeroId
		? view.heroes.find((h) => h.id === pending.sourceHeroId)
		: null;
	const enemy = pending.sourceEnemyId
		? view.enemies.find((e) => e.id === pending.sourceEnemyId)
		: null;

	if (pending.sourceKind === "item" && hero) {
		return `${cardName}, equipado por ${getCardName(hero.cardId)}`;
	}
	if (pending.sourceKind === "artifact" && hero) {
		return `${cardName}, carregado por ${getCardName(hero.cardId)}`;
	}
	if (pending.sourceKind === "hero" && hero) return getCardName(hero.cardId);
	if (
		(pending.sourceKind === "enemy" || pending.sourceKind === "boss") &&
		enemy
	) {
		return getCardName(enemy.cardId);
	}
	return cardName;
}

export function TriggerInterruptModal() {
	const { view, dispatch } = useGameStore();
	const pending = view.pendingTriggerInterrupt;

	useEffect(() => {
		if (!pending) return;
		const interruptId = pending.id;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			dispatch({
				type: "SKIP_TRIGGER_INTERRUPT",
				payload: { interruptId },
			});
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [dispatch, pending]);

	if (!pending) return null;

	const activeInterrupt = pending;
	const skillName = getSkillName(activeInterrupt.skillId);
	const source = sourceText(activeInterrupt, view);
	const sourceKind = SOURCE_KIND_LABEL[activeInterrupt.sourceKind];
	const windowName = WINDOW_LABEL[activeInterrupt.window];
	const description = effectText(activeInterrupt);
	const reason = activeInterrupt.reason || `Janela ativa: ${windowName}.`;

	function apply() {
		dispatch({
			type: "APPLY_TRIGGER_INTERRUPT",
			payload: { interruptId: activeInterrupt.id },
		});
	}

	function skip() {
		dispatch({
			type: "SKIP_TRIGGER_INTERRUPT",
			payload: { interruptId: activeInterrupt.id },
		});
	}

	return (
		<div
			className="trigger-interrupt-layer"
			role="presentation"
			aria-label="Interrupção de habilidade"
		>
			<section
				className="trigger-interrupt-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="trigger-interrupt-title"
			>
				<header className="trigger-interrupt-modal__header">
					<div>
						<p>Interrupção de habilidade</p>
						<h1 id="trigger-interrupt-title">{skillName}</h1>
					</div>
					<span>{windowName}</span>
				</header>

				<div className="trigger-interrupt-modal__source">
					<span>{sourceKind}</span>
					<strong>{source}</strong>
				</div>

				<div className="trigger-interrupt-modal__body">
					<section>
						<h2>Motivo</h2>
						<p>{reason}</p>
					</section>
					<section>
						<h2>Efeito</h2>
						<p>{description}</p>
					</section>
				</div>

				<footer className="trigger-interrupt-modal__actions">
					<button type="button" className="ornate-action" onClick={skip}>
						Ignorar
					</button>
					<button
						type="button"
						className="ornate-action ornate-action--primary"
						onClick={apply}
					>
						Aplicar habilidade
					</button>
				</footer>
			</section>
		</div>
	);
}
