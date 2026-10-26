import type { Action } from "@/core/actions/types";
import type { PlayerView } from "@/core/projection/playerView";

export type TutorialModuleId =
	| "archive-one"
	| "archive-two"
	| "archive-three"
	| "archive-four";

export interface TutorialEntryContext {
	readonly view: PlayerView;
	readonly selectedHeroCardIds: readonly string[];
}

export type TutorialEntry =
	| {
			readonly kind: "setup";
			readonly seed: number;
			readonly deferInitialRoomReveal: boolean;
	  }
	| {
			readonly kind: "prepared-board";
			readonly canReuseBoard?: (context: TutorialEntryContext) => boolean;
			readonly prepareActions?: (
				context: TutorialEntryContext,
			) => readonly Action[];
	  };

export type TutorialStepKind =
	| "narration"
	| "interaction"
	| "observation"
	| "completion";
export type TutorialAdvance =
	| "manual"
	| "hero-selected"
	| "game-started"
	| "room-revealed"
	| "complete";

export interface TutorialHighlight {
	readonly anchor: string;
	readonly instruction: string;
}

export interface TutorialStep {
	readonly id: string;
	readonly title: string;
	readonly kind: TutorialStepKind;
	readonly narration: readonly string[];
	readonly instruction: string;
	readonly advance: TutorialAdvance;
	readonly anchor?: string;
	readonly highlights?: readonly TutorialHighlight[];
	readonly skippable?: boolean;
}

export interface TutorialModule {
	readonly id: TutorialModuleId;
	readonly title: string;
	readonly subtitle: string;
	readonly summary: string;
	readonly available: boolean;
	readonly entry: TutorialEntry;
	readonly steps: readonly TutorialStep[];
}

const archiveOneSteps: readonly TutorialStep[] = [
	{
		id: "opening",
		title: "Abertura",
		kind: "narration",
		advance: "manual",
		narration: [
			"Eu registrei inúmeras travessias pela Fornalha Sombria. Algumas terminaram antes da primeira porta. Outras alcançaram lugares que não deveriam ter sido esquecidos.",
			"Todas começaram da mesma maneira: com uma escolha.",
		],
		instruction: "Conheça os primeiros passos de uma expedição.",
	},
	{
		id: "choose-hero",
		title: "Escolhendo um herói",
		kind: "interaction",
		advance: "hero-selected",
		anchor: "setup.hero-selection",
		narration: [
			"Nem todos aqueles que atravessam o Véu carregam as mesmas forças. Cada um traz consigo habilidades, limites e escolhas que poderão determinar o caminho.",
		],
		instruction:
			"Selecione um herói para compor sua expedição. Você também pode examinar sua carta.",
	},
	{
		id: "group",
		title: "O grupo",
		kind: "observation",
		advance: "manual",
		anchor: "setup.hero-selection",
		narration: [
			"Alguns seguem sozinhos. Outros dividem a travessia. O número daqueles que caminham juntos não elimina o risco. Apenas transforma as decisões.",
		],
		instruction:
			"A expedição pode ter de um a quatro heróis. Acrescente outros, se desejar, ou continue com o escolhido.",
	},
	{
		id: "start",
		title: "Iniciando a expedição",
		kind: "interaction",
		advance: "game-started",
		anchor: "setup.start-expedition",
		narration: [
			"Quando o primeiro passo é dado, o caminho deixa de ser possibilidade. Torna-se registro.",
		],
		instruction:
			"Use o botão Iniciar partida para entrar no tabuleiro de treinamento.",
	},
	{
		id: "board",
		title: "Conhecendo a masmorra",
		kind: "observation",
		advance: "manual",
		skippable: true,
		narration: [
			"A Fornalha Sombria não revela todos os seus caminhos. Cada sala expõe apenas parte daquilo que aguarda os que decidiram avançar.",
		],
		instruction: "Observe as regiões do tabuleiro.",
		highlights: [
			{
				anchor: "board.current-room",
				instruction:
					"Aqui aparece a sala atual. Ainda não há uma sala revelada.",
			},
			{
				anchor: "board.heroes",
				instruction: "Este é o grupo de heróis que você escolheu.",
			},
			{
				anchor: "board.active-enemies",
				instruction: "As criaturas de um encontro aparecem nesta região.",
			},
			{
				anchor: "board.main-action",
				instruction: "O comando da fase conduz a próxima ação da expedição.",
			},
		],
	},
	{
		id: "reveal",
		title: "Revelando uma sala",
		kind: "interaction",
		advance: "room-revealed",
		anchor: "board.main-action",
		narration: [
			"Cada passagem conserva aquilo que ainda não foi descoberto. Uma porta aberta pode revelar obstáculos, encontros ou oportunidades.",
		],
		instruction:
			"Use Revelar sala. A sala será sorteada e aplicada pelo motor do jogo.",
	},
	{
		id: "encounter",
		title: "O encontro e a progressão",
		kind: "observation",
		advance: "manual",
		anchor: "board.current-room",
		skippable: true,
		narration: [
			"Nem toda passagem permanece vazia. Há presenças que impedem o avanço. Há encontros que deixam algo para trás. O caminho prossegue apenas quando suas condições são cumpridas.",
		],
		instruction:
			"Observe a sala revelada e as criaturas, se houver. Combate e espólios serão tratados nos próximos arquivos.",
		highlights: [
			{
				anchor: "board.current-room",
				instruction: "Esta é a sala que o motor revelou para a expedição.",
			},
			{
				anchor: "board.active-enemies",
				instruction:
					"Estas criaturas impedem a progressão até que o encontro seja resolvido.",
			},
			{
				anchor: "board.progression",
				instruction:
					"Aqui aparecem o XP, os artefatos e a condição ligada ao chefe.",
			},
		],
	},
	{
		id: "goal",
		title: "O objetivo da expedição",
		kind: "narration",
		advance: "manual",
		anchor: "board.progression",
		narration: [
			"Não é a primeira porta que define uma travessia. Nem a última batalha revela tudo o que existiu antes dela.",
			"Na Fornalha Sombria, cada decisão altera aquilo que poderá ser enfrentado adiante.",
		],
		instruction:
			"Explore a masmorra, enfrente seus desafios e avance em direção a Azhakar. A vitória depende das condições reais da expedição.",
	},
	{
		id: "completion",
		title: "Arquivo I concluído",
		kind: "completion",
		advance: "complete",
		narration: [
			"Este arquivo registra o início de uma travessia. Os acontecimentos seguintes ainda aguardam aqueles que decidirem avançar.",
			"Eu registrei.",
		],
		instruction: "Escolha como prosseguir.",
	},
];

export const TUTORIAL_MODULES: readonly TutorialModule[] = [
	{
		id: "archive-one",
		title: "Arquivo I — O Início da Jornada",
		subtitle: "Narrativa e mecânicas da masmorra",
		summary: "Heróis, salas, criaturas e progressão.",
		available: true,
		entry: { kind: "setup", seed: 2, deferInitialRoomReveal: true },
		steps: archiveOneSteps,
	},
	{
		id: "archive-two",
		title: "Arquivo II — O Combate",
		subtitle: "Em breve",
		summary: "Seleção, rolagens, ataque e dano.",
		available: false,
		entry: { kind: "prepared-board" },
		steps: [],
	},
	{
		id: "archive-three",
		title: "Arquivo III — Equipamentos e Itens",
		subtitle: "Em breve",
		summary: "Mochila, equipamentos e consumo.",
		available: false,
		entry: { kind: "prepared-board" },
		steps: [],
	},
	{
		id: "archive-four",
		title: "Arquivo IV — Habilidades e Poderes",
		subtitle: "Em breve",
		summary: "Ativação, preparação e triggers.",
		available: false,
		entry: { kind: "prepared-board" },
		steps: [],
	},
];

export function getTutorialModule(id: TutorialModuleId): TutorialModule {
	const module = TUTORIAL_MODULES.find((entry) => entry.id === id);
	if (!module) throw new Error(`Arquivo de tutorial não encontrado: ${id}`);
	return module;
}
