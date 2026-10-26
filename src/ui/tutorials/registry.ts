import type { Action } from "@/core/actions/types";
import type { PlayerView } from "@/core/projection/playerView";
import {
	canReuseCombatBoard,
	COMBAT_DEFAULT_HERO,
	prepareCombatEntry,
} from "./combatScenario";

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
			readonly defaultHeroCardIds?: readonly string[];
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
	| "combat-hero-selected"
	| "combat-first-resolved"
	| "combat-second-declared"
	| "combat-second-resolved"
	| "combat-ended"
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
	readonly anchors?: readonly string[];
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

const archiveTwoSteps: readonly TutorialStep[] = [
	{
		id: "combat-opening",
		title: "O encontro",
		kind: "narration",
		advance: "manual",
		narration: [
			"Algumas presenças guardam os caminhos da Fornalha. Outras parecem ter nascido das próprias fissuras do Véu.",
			"Nem sempre há passagem sem confronto.",
		],
		instruction:
			"Neste arquivo, você aprenderá a enfrentar as criaturas encontradas na masmorra.",
	},
	{
		id: "combat-participants",
		title: "Reconhecendo os envolvidos",
		kind: "observation",
		advance: "manual",
		narration: [
			"De um lado, aqueles que decidiram avançar. Do outro, aquilo que se ergue para impedi-los.",
		],
		instruction:
			"Observe seu herói e a criatura. A vida diminui conforme o dano aplicado.",
		highlights: [
			{
				anchor: "combat.hero",
				instruction: "Esta carta representa o herói disponível para agir.",
			},
			{
				anchor: "combat.enemy",
				instruction: "Esta é a criatura que impede a passagem.",
			},
			{
				anchor: "combat.enemy-life",
				instruction: "A vida atual e máxima da criatura aparece aqui.",
			},
			{
				anchor: "combat.hero-attributes",
				instruction:
					"A carta do herói mostra sua vida e os recursos relevantes para o combate.",
			},
		],
	},
	{
		id: "combat-select-hero",
		title: "Selecionando o herói",
		kind: "interaction",
		advance: "combat-hero-selected",
		anchor: "combat.hero",
		narration: [
			"Uma decisão precisa de alguém que a execute. Antes do golpe, há aquele que o escolhe.",
		],
		instruction: "Selecione o seu herói para iniciar um ataque.",
	},
	{
		id: "combat-select-target",
		title: "Escolhendo o alvo",
		kind: "interaction",
		advance: "combat-first-resolved",
		anchor: "combat.enemy",
		narration: ["A força sem direção nada decide. Um golpe exige um destino."],
		instruction:
			"Selecione a criatura. Acompanhe a rolagem e use Resolver ataque para concluir esta primeira ação.",
	},
	{
		id: "combat-drag",
		title: "Arrastar e soltar",
		kind: "interaction",
		advance: "combat-second-declared",
		anchors: ["combat.hero", "combat.enemy"],
		narration: [
			"Há caminhos diferentes para alcançar o mesmo destino. A intenção permanece. Apenas o gesto muda.",
		],
		instruction:
			"Arraste a carta do herói até a criatura. Em dispositivos de toque, selecione as duas cartas novamente.",
	},
	{
		id: "combat-dice",
		title: "Os dados",
		kind: "interaction",
		advance: "combat-second-resolved",
		anchor: "combat.dice",
		narration: [
			"Nem toda intenção encontra seu destino. Mesmo o golpe mais preciso atravessa um instante de incerteza.",
		],
		instruction:
			"Observe os dados e seus modificadores reais. Quando a animação terminar, use Resolver ataque.",
	},
	{
		id: "combat-result",
		title: "Acerto e dano",
		kind: "observation",
		advance: "manual",
		anchor: "board.active-enemies",
		narration: [
			"Nem todo golpe alcança seu alvo. E nem todo golpe que alcança produz a mesma consequência.",
		],
		instruction:
			"Compare o resultado registrado no Diário com a vida anterior e atual da criatura.",
		highlights: [
			{
				anchor: "board.active-enemies",
				instruction:
					"A criatura derrotada saiu da área de inimigos ativos. A vida final está no quadro do Arquivista.",
			},
			{
				anchor: "combat.hero-life",
				instruction: "Aqui está a vida restante do herói.",
			},
		],
	},
	{
		id: "combat-action",
		title: "A conclusão da ação",
		kind: "observation",
		advance: "combat-ended",
		anchor: "combat.hero",
		narration: [
			"Um ato concluído não pode ser repetido apenas porque seu resultado desagradou àquele que o escolheu.",
			"Cada oportunidade utilizada altera o que ainda pode acontecer.",
		],
		instruction:
			"Observe quem atacou e teve a oportunidade de ataque consumida. Estar em foco, usar uma habilidade ou exaurir um item não significa, por si só, ter atacado.",
	},
	{
		id: "combat-completion",
		title: "Arquivo II concluído — O Combate",
		kind: "completion",
		advance: "complete",
		narration: [
			"Um confronto termina. Suas consequências permanecem.",
			"Daquilo que foi perdido ou preservado nasce o próximo registro.",
		],
		instruction:
			"As condições de encerramento foram confirmadas pelo motor. Escolha como prosseguir.",
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
		subtitle: "Seleção, rolagem e resolução",
		summary: "Seleção, rolagens, ataque e dano.",
		available: true,
		entry: {
			kind: "prepared-board",
			defaultHeroCardIds: [COMBAT_DEFAULT_HERO],
			canReuseBoard: canReuseCombatBoard,
			prepareActions: prepareCombatEntry,
		},
		steps: archiveTwoSteps,
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
