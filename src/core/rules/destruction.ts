/** Marca temporária consumida por applyDamage após uma reação pré-destruição. */
export function destructionPreventionFlag(targetId: string): string {
	return `prevent_destruction::${targetId}`;
}
