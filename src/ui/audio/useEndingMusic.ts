import { useEffect } from "react";
import { getMusicPlayer, type EndingTrack } from "@/ui/globalMenu/musicPlayer";

export function useEndingMusic(ending: EndingTrack) {
	useEffect(() => {
		const player = getMusicPlayer();
		player.enterEnding(ending);
		return () => player.leaveEnding(ending);
	}, [ending]);
}
