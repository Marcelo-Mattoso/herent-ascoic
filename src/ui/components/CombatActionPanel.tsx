// Painel de ações de combate. Patch 2.
// Renderiza botões e instruções conforme combat.phase:
//   selecting_hero    → instrução para clicar num herói
//   selecting_target  → Atacar, Passar, Cancelar (+ Usar poder/item)
//   resolving         → Rolar dados / Resolver ataque
//   outros            → nada (auto-avance cuida)

import type { PlayerView } from "@/core/projection/playerView";
import { ActionButton } from "@/ui/components/ActionButton";
import type { HeroCombatActions } from "@/ui/store/selectors";
import { UI } from "@/ui/theme";

interface CombatActionPanelProps {
	view: PlayerView;
	heroActions: HeroCombatActions;
	onAttack: () => void;
	onPass: () => void;
	onCancelSelection: () => void;
	onRoll: () => void;
	onResolve: () => void;
	onPower: () => void;
}

export function CombatActionPanel({
	view,
	heroActions,
	onAttack,
	onPass,
	onCancelSelection,
	onRoll,
	onResolve,
	onPower,
}: CombatActionPanelProps) {
	const phase = view.combat?.phase;
	const gameStatus = view.status;

	// Fase: aguardando seleção de herói
	if (
		phase === "selecting_hero" &&
		(gameStatus === "HERO_ACTION" || gameStatus === "BOSS_COMBAT")
	) {
		const pending = view.heroes.filter(
			(h) => h.status === "active" && !view.combat?.heroesActed.includes(h.id),
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
	if (
		phase === "selecting_target" &&
		(gameStatus === "HERO_ACTION" || gameStatus === "BOSS_COMBAT")
	) {
		const selectedId = view.combat?.selectedHeroId;
		const hero = view.heroes.find((h) => h.id === selectedId);

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
						disabled={!heroActions.canAttack}
						attention={heroActions.canAttack}
					/>
					<ActionButton
						label="Usar poder"
						icon="⚡"
						variant="secondary"
						disabled={!heroActions.canUsePower}
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
				attention
			/>
		);
	}

	if (gameStatus === "RESOLVE_ATTACK") {
		const blocked = !!view.combat?.pendingDiceSelection;
		return (
			<ActionButton
				label="Resolver ataque"
				icon="💥"
				variant="primary"
				onClick={onResolve}
				fullWidth
				disabled={blocked}
				attention={!blocked}
			/>
		);
	}

	return null;
}
