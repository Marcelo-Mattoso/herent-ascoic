export const DIAGNOSTIC_LOG = {
	stage: "alpha" as "alpha" | "release",
	enabled: true,
} as const;

export const ALPHA_LOG_ENABLED =
	DIAGNOSTIC_LOG.stage === "alpha" && DIAGNOSTIC_LOG.enabled;
