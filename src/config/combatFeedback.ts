/** Ajustes visuais para impactos fortes; não alteram o dano do jogo. */
export const COMBAT_FEEDBACK_CONFIG = {
	heavyDamageThreshold: 2,
	screenShake: {
		durationMs: 440,
		horizontalPx: 12,
		verticalPx: 5,
	},
} as const;
