// Cada pasta em src/data/expansions/<id>/cards.json representa uma expansão.
// A Fornalha Sombria ainda usa o catálogo legado src/data/cards.yaml.
export const EXPANSIONS = [
	{ id: "fornalha-sombria", name: "A Fornalha Sombria", enabled: true, legacy: true },
	// { id: "minha-expansao", name: "Minha Expansão", enabled: true },
] as const satisfies readonly {
	id: string;
	name: string;
	enabled: boolean;
	legacy?: boolean;
}[];
