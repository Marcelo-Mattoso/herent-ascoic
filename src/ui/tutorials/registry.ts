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
	| "inventory-opened"
	| "item-inspected"
	| "dagger-equipped"
	| "axe-equipped"
	| "armor-equipped"
	| "item-used"
	| "ability-inspected"
	| "prey-marked"
	| "hunter-attack-resolved"
	| "fury-prepared"
	| "fury-triggered"
	| "power-used"
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

const archiveThreeSteps: readonly TutorialStep[] = [
	{
		id: "items-opening",
		title: "O Peso da Jornada",
		kind: "narration",
		advance: "manual",
		narration: [
			"Alguns atravessam a Fornalha confiando na própria força. Outros depositam sua sobrevivência naquilo que conseguem carregar.",
			"Mas possuir algo não significa saber utilizá-lo.",
		],
		instruction:
			"Neste arquivo, você aprenderá a organizar equipamentos, utilizar itens e compreender seus efeitos.",
	},
	{
		id: "inventory-open",
		title: "Conhecendo o inventário",
		kind: "interaction",
		advance: "inventory-opened",
		anchors: ["board.heroes", "inventory.open"],
		narration: [
			"Toda jornada impõe limites. Aquilo que se carrega precisa encontrar lugar. Aquilo que se utiliza precisa estar ao alcance.",
		],
		instruction: "Selecione o herói e abra o inventário do grupo.",
	},
	{
		id: "inventory-slots",
		title: "Os espaços de equipamento",
		kind: "observation",
		advance: "manual",
		narration: [
			"Cada instrumento exige seu lugar. E nenhum viajante pode carregar sobre o próprio corpo mais do que seus limites permitem.",
		],
		instruction:
			"Observe os dois espaços de vestimenta, os dois de mão, o amuleto e os três espaços da mochila.",
		highlights: [
			{
				anchor: "hero.clothing",
				instruction: "Duas vestimentas podem ocupar espaços distintos.",
			},
			{
				anchor: "hero.hands",
				instruction:
					"Duas mãos comportam itens de uma mão ou uma arma de duas mãos.",
			},
			{
				anchor: "hero.amulet",
				instruction: "O amuleto possui seu próprio espaço.",
			},
			{
				anchor: "hero.backpack",
				instruction: "A mochila guarda até três itens; abra-a para vê-los.",
			},
		],
	},
	{
		id: "item-inspect",
		title: "Examinando um item",
		kind: "interaction",
		advance: "item-inspected",
		anchor: "hero.backpack",
		narration: [
			"Um objeto pode parecer simples até que suas propriedades sejam compreendidas.",
			"Há poder naquilo que se conhece. E risco naquilo que se ignora.",
		],
		instruction:
			"Abra a mochila, examine uma carta e feche os detalhes para prosseguir.",
	},
	{
		id: "equip-dagger",
		title: "Equipando uma arma",
		kind: "interaction",
		advance: "dagger-equipped",
		anchor: "hero.backpack",
		narration: [
			"Uma lâmina guardada não transforma o golpe. Apenas quando empunhada poderá cumprir aquilo para que foi forjada.",
		],
		instruction: "Equipe a Adaga Enferrujada da mochila em uma mão disponível.",
	},
	{
		id: "equip-axe",
		title: "Uma mão ou duas",
		kind: "interaction",
		advance: "axe-equipped",
		anchors: ["hero.hands", "hero.backpack"],
		narration: [
			"Nem toda arma pode ser sustentada da mesma maneira. Algumas exigem uma mão. Outras exigem ambas.",
		],
		instruction:
			"Na mochila, escolha Trocar no Machado do Salão Arruinado e toque em uma mão. Observe a realocação dos itens anteriores.",
	},
	{
		id: "equip-armor",
		title: "Vestimentas e efeitos passivos",
		kind: "interaction",
		advance: "armor-equipped",
		anchors: ["hero.clothing", "hero.backpack"],
		narration: [
			"Há objetos cujo efeito não depende de um gesto. Sua presença, quando corretamente utilizados, modifica aquilo que seu portador pode suportar.",
		],
		instruction:
			"Equipe a Armadura de Couro Reforçado e observe a origem do efeito na carta e no Diário.",
	},
	{
		id: "use-item",
		title: "Utilizando um item",
		kind: "interaction",
		advance: "item-used",
		anchors: ["hero.hands", "hero.backpack"],
		narration: [
			"Alguns objetos permanecem silenciosos até que alguém decida despertar aquilo que guardam.",
		],
		instruction:
			"Troque o machado pela Poção de Precisão da mochila. Depois use a poção equipada pelo botão Usar.",
	},
	{
		id: "item-states",
		title: "Itens exauridos e consumíveis",
		kind: "observation",
		advance: "manual",
		anchors: ["board.heroes", "journal.open"],
		narration: [
			"Nem todo recurso permanece após ser utilizado. Alguns se esgotam. Outros desaparecem, deixando apenas a consequência de seu uso.",
		],
		instruction:
			"Compare a poção descartada no checkpoint anterior com o Encanto do Sangue Quente exaurido neste combate. Abra o Diário para conferir o estado; o herói já pode atacar nesta rodada.",
	},
	{
		id: "items-completion",
		title: "Arquivo III concluído — O Peso da Jornada",
		kind: "completion",
		advance: "complete",
		narration: [
			"Aquilo que se carrega pode oferecer proteção, força ou uma última oportunidade.",
			"Mas nenhuma ferramenta decide por aquele que a empunha.",
			"Eu registrei.",
		],
		instruction:
			"Você aprendeu a examinar, equipar e utilizar itens. O próximo arquivo tratará de habilidades e poderes.",
	},
];

const archiveFourSteps: readonly TutorialStep[] = [
	{ id: "abilities-opening", title: "Aquilo que Cada Um Carrega", kind: "narration", advance: "manual",
		narration: ["Uma mesma passagem não exige as mesmas respostas de todos aqueles que a atravessam.", "Há capacidades que se revelam pela escolha. Outras aguardam o instante em que sua presença se torna necessária."],
		instruction: "Neste arquivo, você utilizará habilidades, preparará reações e conhecerá os poderes dos heróis." },
	{ id: "abilities-inspect", title: "Conhecendo as Habilidades", kind: "interaction", advance: "ability-inspected", anchors: ["combat.hero", "hero.skill-card"],
		narration: ["A força de cada viajante não está apenas em suas armas. Há conhecimentos, instintos e dons que nenhuma lâmina pode substituir."],
		instruction: "Abra o painel do Caçador e examine a carta que descreve sua habilidade e seu poder." },
	{ id: "prey-mark", title: "Uma Habilidade Manual", kind: "interaction", advance: "prey-marked", anchors: ["hero.skill-action", "combat.enemy"],
		narration: ["Há aqueles que não enfrentam a ameaça sem antes compreendê-la.", "Reconhecer um alvo também é uma maneira de preparar aquilo que virá."],
		instruction: "Use Marca da Presa e escolha uma criatura válida no seletor de alvos." },
	{ id: "hunter-attack", title: "A Habilidade Não É um Ataque", kind: "interaction", advance: "hunter-attack-resolved", anchors: ["combat.hero", "combat.enemy", "combat.dice"],
		narration: ["Nem toda escolha é um golpe. Algumas apenas estabelecem as condições para aquilo que ainda acontecerá."],
		instruction: "A Marca preservou o ataque. Selecione o Caçador, escolha uma criatura e resolva o ataque real." },
	{ id: "fury-prepare", title: "Preparando uma Reação", kind: "interaction", advance: "fury-prepared", anchors: ["combat.hero", "hero.skill-action"],
		narration: ["Há forças que não devem ser despertadas antes do instante necessário.", "Algumas aguardam uma decisão. Depois dela, resta apenas o acontecimento."],
		instruction: "Abra o Bárbaro e prepare Fúria Rubra. A preparação pode ser cancelada antes do ataque." },
	{ id: "fury-trigger", title: "O Momento da Fúria", kind: "interaction", advance: "fury-triggered", anchors: ["combat.hero", "combat.enemy", "combat.dice"],
		narration: ["Quando a oportunidade surge, aquilo que foi preparado encontra seu momento."],
		instruction: "Ataque com o Bárbaro. Observe a Fúria executar automaticamente, sem confirmação adicional." },
	{ id: "hero-power", title: "O Poder de um Herói", kind: "interaction", advance: "power-used", anchors: ["combat.hero", "hero.power-card", "hero.power-action"],
		narration: ["Algumas capacidades acompanham aqueles que percorrem a Fornalha como marcas de sua própria natureza.", "Seu alcance não é infinito. Seu uso também pertence às regras do caminho."],
		instruction: "Abra o Guerreiro e use Guarda Inquebrável do Bastião. Observe a proteção e o limite por partida." },
	{ id: "passive-effect", title: "Efeitos Passivos", kind: "observation", advance: "manual", anchors: ["board.heroes", "journal.open"],
		narration: ["Nem toda força exige uma ordem. Algumas permanecem presentes enquanto sua origem existir."],
		instruction: "Observe o Encanto da Chama Baixa equipado, seu efeito projetado e a carta de origem no Diário. Efeitos contínuos não exigem ativação manual." },
	{ id: "ability-limits", title: "Custos e Limites", kind: "observation", advance: "manual", anchors: ["hero.power-card", "journal.open"],
		narration: ["Toda possibilidade possui suas condições. Aquilo que foi utilizado nem sempre pode ser reclamado novamente no mesmo instante."],
		instruction: "Confira o poder utilizado e o motivo da indisponibilidade. O limite do poder não consome o ataque do herói." },
	{ id: "abilities-completion", title: "Arquivo IV concluído — A Vontade e o Poder", kind: "completion", advance: "complete",
		narration: ["Agora conhece os primeiros limites de sua força. Sabe o que pode despertar por escolha, o que precisa aguardar e aquilo que permanece mesmo em silêncio.", "Mas conhecer um caminho não é o mesmo que atravessá-lo.", "Os próximos acontecimentos ainda não foram registrados.", "Eu registrei. Agora, apenas relato."],
		instruction: "Você concluiu os quatro arquivos de aprendizado de Ascensão Heróica. Escolha como prosseguir." },
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
		title: "Arquivo III — O Peso da Jornada",
		subtitle: "Itens e equipamentos",
		summary: "Mochila, espaços, efeitos e consumo.",
		available: true,
		entry: {
			kind: "prepared-board",
			defaultHeroCardIds: [COMBAT_DEFAULT_HERO],
		},
		steps: archiveThreeSteps,
	},
	{
		id: "archive-four",
		title: "Arquivo IV — A Vontade e o Poder",
		subtitle: "Habilidades e poderes",
		summary: "Ativação, preparação, efeitos e limites.",
		available: true,
		entry: { kind: "prepared-board", defaultHeroCardIds: ["hero_broken_veil_hunter"] },
		steps: archiveFourSteps,
	},
];

export function getTutorialModule(id: TutorialModuleId): TutorialModule {
	const module = TUTORIAL_MODULES.find((entry) => entry.id === id);
	if (!module) throw new Error(`Arquivo de tutorial não encontrado: ${id}`);
	return module;
}
