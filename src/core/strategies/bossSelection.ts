// Strategy: usa o primeiro chefe do catálogo habilitado.
import { getBoss } from "../data/cards";

export function selectBoss(): string {
	const boss = getBoss();
	if (!boss) throw new Error("Nenhum chefe disponível nas expansões habilitadas");
	return boss.id;
}
