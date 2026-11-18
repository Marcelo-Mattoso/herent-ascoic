/**
 * Identidade determinística do catálogo. Mudou carta, efeito, grant,
 * versão da expansão ou versão do jogo? O conhecimento precisa de revalidação.
 */
import packageJson from "../../../package.json";
import { ABILITIES, cardAbilityGrants } from "@/core/data/abilities";
import { getAllCards } from "@/core/data/cards";
import { getEnabledExpansions } from "@/core/data/expansions";

let cached: string | undefined;
export function catalogFingerprint(): string {
  if (cached) return cached;
  const cards = [...getAllCards()].sort((a, b) => a.id.localeCompare(b.id));
  const payload = JSON.stringify({
    discovererVersion: 3,
    gameVersion: packageJson.version,
    expansions: getEnabledExpansions().map(exp => [exp.id, exp.version]).sort(),
    cards,
    grants: cards.map(card => [card.id, cardAbilityGrants(card.id)]),
    definitions: [...ABILITIES.abilities].sort((a, b) => a.id.localeCompare(b.id)),
  });
  // FNV-1a de 64 bits, não criptográfico: funciona como marcador de mudança.
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < payload.length; i++) {
    hash ^= BigInt(payload.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  cached = "catalog-v3-" + hash.toString(16).padStart(16, "0");
  return cached;
}
