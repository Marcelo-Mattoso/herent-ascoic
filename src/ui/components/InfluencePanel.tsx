import { translate } from "@/i18n";
import { useMemo } from "react";
import type {
	InfluenceScope,
	InfluenceView,
} from "@/core/projection/playerView";
import { UI } from "@/ui/theme";

const SCOPE_ORDER: InfluenceScope[] = [
	"room_to_group",
	"room_to_hero",
	"dungeon_to_group",
	"hero_to_group",
	"hero_to_dungeon",
	"hero_to_self",
	"hero_to_enemy",
	"enemy_to_group",
	"enemy_to_hero",
	"item_to_hero",
	"unknown",
];

const SCOPE_LABELS: Record<InfluenceScope, string> = {
	room_to_group: "game:components.influencePanel.scopeLabels.room_to_group",
	room_to_hero: "game:components.influencePanel.scopeLabels.room_to_hero",
	dungeon_to_group: "game:components.influencePanel.scopeLabels.dungeon_to_group",
	hero_to_group: "game:components.influencePanel.scopeLabels.hero_to_group",
	hero_to_dungeon: "game:components.influencePanel.scopeLabels.hero_to_dungeon",
	hero_to_self: "game:components.influencePanel.scopeLabels.hero_to_self",
	hero_to_enemy: "game:components.influencePanel.scopeLabels.hero_to_enemy",
	enemy_to_group: "game:components.influencePanel.scopeLabels.enemy_to_group",
	enemy_to_hero: "game:components.influencePanel.scopeLabels.enemy_to_hero",
	item_to_hero: "game:components.influencePanel.scopeLabels.item_to_hero",
	unknown: "game:components.influencePanel.scopeLabels.unknown",
};

const KIND_PALETTE: Record<
	InfluenceView["kind"],
	{ bg: string; fg: string; border: string }
> = {
	buff: { bg: "#FEF3C7", fg: "#92400E", border: "#F59E0B" },
	debuff: { bg: "#FCE4EC", fg: "#7A1F3D", border: "#C2185B" },
	neutral: { bg: "#E5E7EB", fg: "#374151", border: "#9CA3AF" },
};

function actorLabel(inf: InfluenceView): string {
	const f = inf.from;
	const t = inf.to;
	const fromStr =
		f.kind === "hero" ||
		f.kind === "enemy" ||
		f.kind === "room" ||
		f.kind === "item" ||
		f.kind === "self"
			? f.name
			: f.kind === "group"
				? "Grupo"
				: "Dungeon";
	const toStr =
		t.kind === "hero" ||
		t.kind === "enemy" ||
		t.kind === "room" ||
		t.kind === "self"
			? t.name
			: t.kind === "group"
				? "Grupo"
				: "Dungeon";
	if (fromStr && toStr && fromStr !== toStr) return `${fromStr} → ${toStr}`;
	return fromStr || toStr;
}

function InfluenceChip({ influence: inf }: { influence: InfluenceView }) {
	const palette = KIND_PALETTE[inf.kind];
	const actor = actorLabel(inf);
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 4,
				background: palette.bg,
				border: `1px solid ${palette.border}`,
				borderRadius: 6,
				padding: "2px 7px",
				fontSize: 10,
				color: palette.fg,
				lineHeight: 1.4,
			}}
			title={`${inf.source} · ${inf.duration}`}
		>
			<span>{inf.icon}</span>
			<span style={{ fontWeight: 600 }}>{inf.label}</span>
			{inf.source && inf.source !== inf.label && (
				<span style={{ opacity: 0.85, fontStyle: "italic" }}>
					· {inf.source}
				</span>
			)}
			{actor && <span style={{ opacity: 0.75 }}>· {actor}</span>}
			<span style={{ opacity: 0.55, fontSize: 9 }}>· {inf.duration}</span>
		</div>
	);
}

function groupByScope(
	influences: readonly InfluenceView[],
): Partial<Record<InfluenceScope, InfluenceView[]>> {
	const result: Partial<Record<InfluenceScope, InfluenceView[]>> = {};
	for (const inf of influences) {
		const arr = result[inf.scope];
		if (arr) arr.push(inf);
		else result[inf.scope] = [inf];
	}
	return result;
}

interface InfluencePanelProps {
	influences: readonly InfluenceView[];
}

export function InfluencePanel({ influences }: InfluencePanelProps) {
	const groups = useMemo(() => groupByScope(influences), [influences]);
	const hasAny = influences.length > 0;

	return (
		<div
			style={{
				background: UI.panelBg,
				border: `1px solid ${UI.border}`,
				borderRadius: 8,
				padding: "6px 10px",
				display: "flex",
				flexDirection: "column",
				gap: 4,
			}}
		>
			<div
				style={{
					fontSize: 9,
					fontWeight: 700,
					color: UI.textTertiary,
					letterSpacing: "0.06em",
					textTransform: "uppercase",
					marginBottom: 2,
				}}
			>
				{translate("game:components.influencePanel.text001")}{" "}</div>

			{!hasAny && (
				<span style={{ fontSize: 10, color: UI.textTertiary }}>
					{translate("game:components.influencePanel.text002")}{" "}</span>
			)}

			{SCOPE_ORDER.map((scope) => {
				const items = groups[scope];
				if (!items?.length) return null;
				return (
					<div key={scope}>
						<div
							style={{
								fontSize: 8,
								fontWeight: 700,
								color: UI.textTertiary,
								letterSpacing: "0.08em",
								textTransform: "uppercase",
								marginBottom: 3,
							}}
						>
							{translate(SCOPE_LABELS[scope])}
						</div>
						<div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
							{items.map((inf) => (
								<InfluenceChip key={inf.id} influence={inf} />
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
