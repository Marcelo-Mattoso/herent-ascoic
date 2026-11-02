// O pacote escolhido determina o mestre da masmorra.
import { getBoss } from "../data/cards";

export function selectBoss(expansionId?: string): string {
	return getBoss(expansionId)?.id ?? "";
}
