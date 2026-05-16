// Strategy: ordem em que efeitos simultâneos são aplicados.
// Default: sala → artefato → item → herói → criatura → roxo → chefe.

export type EffectSource =
	| "room"
	| "artifact"
	| "item"
	| "hero"
	| "creature"
	| "purple"
	| "boss";

export const DEFAULT_EFFECT_ORDER: readonly EffectSource[] = [
	"room",
	"artifact",
	"item",
	"hero",
	"creature",
	"purple",
	"boss",
] as const;

export function compareEffectOrder(a: EffectSource, b: EffectSource): number {
	return DEFAULT_EFFECT_ORDER.indexOf(a) - DEFAULT_EFFECT_ORDER.indexOf(b);
}
