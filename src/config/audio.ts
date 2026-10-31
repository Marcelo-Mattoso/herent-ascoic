/**
 * Chaves de publicação do áudio.
 *
 * Música: habilitada.
 * Efeitos: desabilitados até os arquivos definitivos serem escolhidos.
 *
 * Estas chaves são globais: preferências do navegador não podem reativar
 * um recurso desabilitado por configuração. Para liberar efeitos no futuro,
 * altere apenas sfx.enabled para true e publique uma nova versão.
 */
export const AUDIO_CONFIG = {
	music: { enabled: true },
	sfx: { enabled: false },
} as const;
