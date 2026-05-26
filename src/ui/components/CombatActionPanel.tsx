// Painel de ações de combate. Patch 2.
// Renderiza botões e instruções conforme combat.phase:
//   selecting_hero    → instrução para clicar num herói
//   selecting_target  → Atacar, Passar, Cancelar (+ Usar poder/item)
//   resolving         → Rolar dados / Resolver ataque
//   outros            → nada (auto-avance cuida)

import type { GameState } from "@/core/state/gameState";
import { ActionButton } from "@/ui/components/ActionButton";
import { UI } from "@/ui/theme";

interface CombatActionPanelProps {
	state: GameState;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onRoll: () => void;
	onResolve: () => void;
	onPower: () => void;
}

export function CombatActionPanel({
	state,
	onAttack,
	onPass,
	onCancelSelection,
	onRoll,
	onResolve,
	onPower,
}: CombatActionPanelProps) {
	const phase = state.combat?.phase;
	const gameStatus = state.status;

	// Fase: aguardando seleção de herói
	if (phase === "selecting_hero" && (gameStatus === "HERO_ACTION" || gameStatus === "BOSS_COMBAT")) {
		const pending = state.heroes.filter(
			(h) => h.status === "active" && !state.combat?.heroesActed.includes(h.id),
		);
		return (
			<div
				className="h-10 flex items-center justify-center text-xs"
				style={{ color: UI.textTertiary }}
			>
				{pending.length > 0
					? `Clique em um herói para ativá-lo (${pending.length} disponível${pending.length > 1 ? "is" : ""})`
					: "Todos os heróis agiram."}
			</div>
		);
	}

	// Fase: herói selecionado, aguardando alvo ou ação
	if (phase === "selecting_target" && (gameStatus === "HERO_ACTION" || gameStatus === "BOSS_COMBAT")) {
		const selectedId = state.combat?.selectedHeroId;
		const hero = state.heroes.find((h) => h.id === selectedId);
		const hasPower = hero && !state.combat?.powersUsedThisRoom[hero.id];
		const hasActiveEnemies = state.activeEnemies.some((e) => e.status === "active");

		return (
			<div className="space-y-2">
				<p className="text-xs text-center" style={{ color: UI.textSecondary }}>
					<strong style={{ color: UI.textPrimary }}>{hero?.cardName}</strong> —
					clique num inimigo ou escolha uma ação
				</p>
				<div className="flex gap-2 flex-wrap">
					<ActionButton
						label="Atacar"
						icon="⚔"
						variant="primary"
						onClick={onAttack}
						disabled={!hasActiveEnemies}
					/>
					<ActionButton
						label="Usar poder"
						icon="⚡"
						variant="secondary"
						disabled={!hasPower}
						onClick={onPower}
					/>
					<ActionButton
						label="Passar rodada"
						icon="⏭"
						variant="secondary"
						onClick={onPass}
					/>
					<ActionButton
						label="Cancelar"
						icon="✕"
						variant="danger"
						onClick={onCancelSelection}
					/>
				</div>
			</div>
		);
	}

	// Fase: resolvendo (ROLL_DICE / RESOLVE_ATTACK)
	if (gameStatus === "ROLL_DICE") {
		return (
			<ActionButton
				label="Rolar dados"
				icon="🎲"
				variant="primary"
				onClick={onRoll}
				fullWidth
			/>
		);
	}

	if (gameStatus === "RESOLVE_ATTACK") {
		return (
			<ActionButton
				label="Resolver ataque"
				icon="💥"
				variant="primary"
				onClick={onResolve}
				fullWidth
			/>
		);
	}

	return null;
}
