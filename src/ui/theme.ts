// Constantes visuais do design system do MVP 1.
// Todas as cores vêm daqui — nenhuma cor hardcoded em outro arquivo.

import type { ColorIndex } from "@/core/state/color";

export const COLORS_MAP = [
	{
		bg: "#FFFFFF",
		border: "#D3D1C7",
		text: "#2C2C2A",
		barFill: "#D3D1C7",
		name: "Branco",
	},
	{
		bg: "#FAEEDA",
		border: "#F0D9A8",
		text: "#854F0B",
		barFill: "#F0D9A8",
		name: "Amarelo",
	},
	{
		bg: "#FCE3D1",
		border: "#F5C4A8",
		text: "#8C3D0B",
		barFill: "#F5C4A8",
		name: "Laranja",
	},
	{
		bg: "#FCEBEB",
		border: "#F5C4C4",
		text: "#501313",
		barFill: "#F5C4C4",
		name: "Vermelho",
	},
	{
		bg: "#F0E6FB",
		border: "#D8C4F5",
		text: "#3D1A6E",
		barFill: "#D8C4F5",
		name: "Roxo",
	},
] as const;

export function colorStyle(index: ColorIndex) {
	return COLORS_MAP[index];
}

export const UI = {
	pageBg: "#FAFAF7",
	panelBg: "#FFFFFF",
	subpanelBg: "#F1EFE8",
	textPrimary: "#2C2C2A",
	textSecondary: "#5F5E5A",
	textTertiary: "#888780",
	border: "rgba(0,0,0,0.15)",
	borderStrong: "rgba(0,0,0,0.30)",
	info: { bg: "#E6F1FB", text: "#185FA5" },
	danger: { bg: "#FCEBEB", text: "#501313" },
	success: { bg: "#EAF3DE", text: "#3B6D11" },
	artifactBg: "#FDF8EF",
	artifactBorder: "#F0D9A8",
} as const;
