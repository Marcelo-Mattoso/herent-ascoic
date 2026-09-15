import { useState } from "react";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { useGameStore } from "@/ui/store/gameStore";

export function UseItemModal({
	heroId,
	initialItemId,
	onClose,
}: {
	heroId: string;
	initialItemId?: string;
	onClose: () => void;
}) {
	const { dispatch, heroActionsFor } = useGameStore();
	const items = heroActionsFor(heroId).usableItems ?? [];
	const [selectedId, setSelectedId] = useState(initialItemId);
	const selected = items.find((item) => item.itemId === selectedId);

	function use(itemId: string, target?: { id: string; kind: string }) {
		dispatch({
			type: "USE_ITEM",
			payload: {
				heroId,
				itemId,
				targetHeroId: target?.kind === "hero" ? target.id : undefined,
				targetEnemyId: target?.kind === "enemy" ? target.id : undefined,
			},
		});
		onClose();
	}

	return (
		<Modal
			title={selected ? selected.name : "Usar item ativo"}
			onClose={onClose}
		>
			<div className="flex flex-col gap-2">
				{items.length === 0 && (
					<p>Nenhum item ativo disponível nesta janela.</p>
				)}
				{selected?.target.kind === "needs_selection" ? (
					<>
						<p>{selected.target.prompt}</p>
						{selected.target.candidates.map((target) => (
							<ActionButton
								key={target.id}
								label={target.label}
								variant="secondary"
								onClick={() => use(selected.itemId, target)}
							/>
						))}
						<ActionButton
							label="Voltar aos itens"
							variant="secondary"
							onClick={() => setSelectedId(undefined)}
						/>
					</>
				) : (
					(selected ? [selected] : items).map((item) => (
						<ActionButton
							key={item.itemId}
							label={`Usar ${item.name}`}
							variant="secondary"
							onClick={() =>
								item.target.kind === "needs_selection"
									? setSelectedId(item.itemId)
									: use(item.itemId)
							}
						/>
					))
				)}
			</div>
		</Modal>
	);
}
