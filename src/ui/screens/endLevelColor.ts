import { COLORS, type ColorIndex } from "@/core/state/color";
import { translate } from "@/i18n";

export function endLevelColorName(level: ColorIndex): string {
	return translate(`game:screens.endLevelColors.${COLORS[level]}`);
}
