// Projeção do estado de jogo para a UI.
// Camada de tradução entre GameState (shape interno) e PlayerView (contrato estável da UI).
// Quando o shape interno mudar (ECS, effect stack), a UI continua lendo a mesma forma.
//
// Passo 9: adicionados campos pós-ECS — paused e pendingSkillChoice.

import { getCardByName } from "../data/cards";
import { getModifierTotal } from "../ecs/world";
import type { PausedState } from "../effects/stack";
import { cardSkills } from "../skills/lookup";
import type { ColorIndex } from "../state/color";
import type {
	CombatPhase,
	CombatRollResult,
	CombatState,
} from "../state/combatState";
import type { EnemyState } from "../state/enemyState";
import type {
	Difficulty,
	GameMode,
	GameState,
	GroupArtifact,
	PendingReward,
} from "../state/gameState";

// Re-exporta tipos de configuração usados pela UI (ex: Setup.tsx)
export type { Difficulty, GameMode };

import type { HeroState } from "../state/heroState";
import type { RoomState } from "../state/roomState";
import type { GameStatus } from "../state/status";

// Aliases estruturais — iguais ao shape interno por enquanto.
// Mudam quando ECS entra plenamente: a projeção reconstruirá HeroView a partir de componentes.
export type HeroView = HeroState;
export type EnemyView = EnemyState;
export type RoomView = RoomState;

// Efeito ativo projetado para a UI — chip com ícone + texto curto.
// `kind` define a polaridade (buff/debuff/neutro) usada para colorir.
// `source` identifica de onde veio (skill, item, sala, criatura) — mostrado em tooltip.
export interface BuffView {
	readonly id: string;
	readonly kind: "buff" | "debuff" | "neutral";
	readonly icon: string;
	readonly label: string;
	readonly detail: string;
	readonly source: string;
}

export interface PlayerView {
	readonly status: GameStatus;
	readonly mode: GameMode;
	readonly heroes: readonly HeroView[];
	readonly enemies: readonly EnemyView[];
	readonly currentRoom: RoomView | null;
	readonly combat: {
		readonly phase: CombatPhase;
		readonly selectedHeroId: string | null;
		readonly round: number;
		readonly heroesActed: readonly string[];
		readonly powersUsedThisRoom: Readonly<Record<string, boolean>>;
		readonly lastRoll: CombatRollResult | null;
		readonly pendingDiceSelection: CombatState["pendingDiceSelection"];
		readonly buffsByHero: Readonly<Record<string, readonly BuffView[]>>;
	} | null;
	readonly groupXp: number;
	readonly despertar: ColorIndex;
	readonly groupArtifacts: readonly GroupArtifact[];
	readonly roomsCleared: number;
	readonly creaturesDefeated: number;
	readonly bossCardName: string;
	readonly winner: string | undefined;
	readonly paths: readonly string[];
	readonly pendingRewards: readonly PendingReward[];
	readonly eventLog: readonly string[];
	// Efeitos que afetam o grupo todo (recursos compartilhados: deck, fuga, sala).
	// Vivem aqui — não duplicados nas BuffBars dos heróis.
	readonly groupBuffs: readonly BuffView[];
	readonly decks: {
		readonly dungeonDeck: {
			readonly available: number;
			readonly discarded: readonly string[];
		};
		readonly enemyDeck: {
			readonly available: number;
			readonly discarded: number;
		};
		readonly artifactDeck: {
			readonly available: readonly string[];
			readonly discarded: number;
		};
		readonly itemDeck: {
			readonly available: readonly string[];
			readonly discarded: number;
		};
	};
	// Passo 8: estado de pausa para input do jogador durante resolução de efeitos.
	readonly paused: PausedState | null;
	// Escolha de skill pendente (integrada ao paused no futuro; mantida para compatibilidade).
	readonly pendingSkillChoice: {
		readonly skillId: string;
		readonly prompt: string;
		readonly options: readonly {
			readonly id: string;
			readonly label: string;
		}[];
		readonly sourceHeroId?: string;
	} | null;
}

export function playerView(state: GameState): PlayerView {
	return {
		status: state.status,
		mode: state.mode,
		heroes: state.heroes,
		enemies: state.activeEnemies,
		currentRoom: state.currentRoom,
		combat: state.combat
			? {
					phase: state.combat.phase,
					selectedHeroId: state.combat.selectedHeroId,
					round: state.combat.round,
					heroesActed: state.combat.heroesActed,
					powersUsedThisRoom: state.combat.powersUsedThisRoom,
					lastRoll: state.combat.lastRoll,
					pendingDiceSelection: state.combat.pendingDiceSelection,
					buffsByHero: projectBuffsByHero(state),
				}
			: null,
		groupXp: state.groupXp,
		despertar: state.despertar,
		groupArtifacts: state.groupArtifacts,
		roomsCleared: state.roomsCleared,
		creaturesDefeated: state.creaturesDefeated,
		bossCardName: state.bossCardName,
		winner: state.winner,
		paths: state.paths,
		pendingRewards: state.pendingRewards,
		eventLog: state.eventLog,
		groupBuffs: projectGroupBuffs(state),
		decks: {
			dungeonDeck: {
				available: state.decks.dungeonDeck.available.length,
				discarded: state.decks.dungeonDeck.discarded,
			},
			enemyDeck: {
				available: state.decks.enemyDeck.available.length,
				discarded: state.decks.enemyDeck.discarded.length,
			},
			artifactDeck: {
				available: state.decks.artifactDeck.available,
				discarded: state.decks.artifactDeck.discarded.length,
			},
			itemDeck: {
				available: state.decks.itemDeck.available,
				discarded: state.decks.itemDeck.discarded.length,
			},
		},
		paused: state.paused,
		pendingSkillChoice: state.pendingSkillChoice ?? null,
	};
}

// Projeta os buffs/efeitos ativos por herói para exibição na UI.
// Lê apenas os campos do CombatState que representam estado "em vigor agora".
function projectBuffsByHero(
	state: GameState,
): Readonly<Record<string, readonly BuffView[]>> {
	const combat = state.combat;
	if (!combat) return {};

	const result: Record<string, BuffView[]> = {};
	const push = (heroId: string, buff: BuffView) => {
		if (!result[heroId]) result[heroId] = [];
		result[heroId].push(buff);
	};

	// Marca da Presa — nome da criatura marcada (mostra em todos os heróis).
	const preyEnemyName = combat.prey
		? (state.activeEnemies.find((e) => e.id === combat.prey)?.cardName ?? null)
		: null;

	for (const hero of state.heroes) {
		const id = hero.id;

		// Bônus de próximo ataque — lê do ECS world (Lote G: damage_dealt e hit_bonus positivos)
		const entity = state.world.entities[id];
		if (entity) {
			let i = 0;
			for (const comp of entity.components) {
				if (comp.type !== "modifier") continue;
				if (comp.target !== "damage_dealt" && comp.target !== "hit_bonus") continue;
				if (comp.value <= 0) continue;
				const polarity: "buff" | "debuff" = "buff";
				const sign = "+";
				push(id, {
					id: `bonus:${comp.source}:${i++}`,
					kind: polarity,
					icon: "⚔️",
					label: `${sign}${comp.value} próximo ataque`,
					detail: "consumido após resolver",
					source: comp.source,
				});
			}
		}

		// Dado extra (Bárbaro Rubro etc.)
		const extra = combat.extraDice[id] ?? 0;
		if (extra > 0) {
			push(id, {
				id: "extra-dice",
				kind: "buff",
				icon: "🎲",
				label: `+${extra} dado`,
				detail: "próxima rolagem",
				source: "Poder do herói",
			});
		}

		// Redução de dano sofrido — lê do ECS world (Lote B)
		const reduction = -getModifierTotal(state.world, id, "damage_taken");
		if (reduction > 0) {
			push(id, {
				id: "damage-reduction",
				kind: "buff",
				icon: "🛡️",
				label: `-${reduction} dano sofrido`,
				detail: "até fim da rodada",
				source: "Modificador defensivo",
			});
		}

		// Penalidade de acerto — lê do ECS world (Lote D; hit_bonus negativo = debuff)
		const penaltyTotal = getModifierTotal(state.world, id, "hit_bonus");
		const penalty = penaltyTotal < 0 ? -penaltyTotal : 0;
		if (penalty > 0) {
			push(id, {
				id: "tohit-penalty",
				kind: "debuff",
				icon: "🌫️",
				label: `-${penalty} acerto`,
				detail: "imposta por inimigo/efeito",
				source: "Maldição",
			});
		}

		// Eco do Necromante
		const eco = combat.ecoTokens[id] ?? 0;
		if (eco > 0) {
			push(id, {
				id: "eco",
				kind: "buff",
				icon: "👻",
				label: "Eco",
				detail: "token disponível",
				source: "Necromante",
			});
		}

		// Véu Protetor — herói ignora o próximo efeito que o escolha como alvo.
		if (combat.targetProtectionByHero[id]) {
			push(id, {
				id: "target-protection",
				kind: "buff",
				icon: "✨",
				label: "Véu Protetor",
				detail: "ignora o próximo efeito direcionado",
				source: "Véu Protetor",
			});
		}

		// Fuga declarada — não é buff nem debuff, é estado.
		if (combat.fleeAttemptByHero[id]) {
			push(id, {
				id: "flee",
				kind: "neutral",
				icon: "🏃",
				label: "Fuga declarada",
				detail: "resolve no próximo confronto",
				source: "Decisão do jogador",
			});
		}

		// Marca da Presa — afeta os ataques contra a criatura marcada.
		if (preyEnemyName) {
			push(id, {
				id: "prey",
				kind: "buff",
				icon: "🎯",
				label: `Marca: ${preyEnemyName}`,
				detail: "bônus ao atacar a presa",
				source: "Caçador",
			});
		}

		// Passivas while_equipped — varre os itens equipados do herói e adiciona
		// um chip por skill com trigger while_equipped (Foco do Caçador etc.).
		const equippedItems = Object.values(hero.activeItems).filter(
			(name): name is string => typeof name === "string" && name.length > 0,
		);
		for (const itemName of equippedItems) {
			const itemCard = getCardByName(itemName);
			if (!itemCard) continue;
			for (const { def } of cardSkills(itemCard.id)) {
				if (def.trigger !== "while_equipped") continue;
				push(id, {
					id: `equipped:${itemName}:${def.id}`,
					kind: "buff",
					icon: "🔮",
					label: def.name,
					detail: `equipado · ${itemName}`,
					source: itemName,
				});
			}
		}
	}

	return result;
}

// Efeitos que afetam o grupo todo — recursos compartilhados (deck, fuga, sala).
// Vivem em `state.flags.*` e são únicos no estado, não por herói.
function projectGroupBuffs(state: GameState): readonly BuffView[] {
	const buffs: BuffView[] = [];
	if (state.flags.dungeonDiscardPrevented) {
		buffs.push({
			id: "flag:dungeon-discard-prevented",
			kind: "buff",
			icon: "🗝️",
			label: "Caminho Preservado",
			detail: "próximo descarte de dungeon será devolvido ao topo",
			source: "Ladino das Fendas",
		});
	}
	if (state.flags.fleeBlocked) {
		buffs.push({
			id: "flag:flee-blocked",
			kind: "debuff",
			icon: "🚷",
			label: "Fuga bloqueada",
			detail: "ninguém pode fugir desta sala",
			source: "Efeito de sala/inimigo",
		});
	}
	if (state.flags.discardDungeonLocked) {
		buffs.push({
			id: "flag:discard-dungeon-locked",
			kind: "neutral",
			icon: "🔒",
			label: "Descartes trancados",
			detail: "cartas de dungeon não podem ser descartadas",
			source: "Efeito de sala",
		});
	}
	return buffs;
}
