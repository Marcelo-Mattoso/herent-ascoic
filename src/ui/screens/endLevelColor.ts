import { COLORS, type ColorIndex } from "@/core/projection/viewTypes";
import { translate } from "@/i18n";

export function endLevelColorName(level: ColorIndex): string {
	return translate(`game:screens.endLevelColors.${COLORS[level]}`);
}
