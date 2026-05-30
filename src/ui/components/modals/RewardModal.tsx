// Modal de distribuição de recompensa. Patch 1.
// Itens: etapa 1 (escolher herói, ignorada se 1 herói) → etapa 2 (equip/mochila/descartar).
// Artefatos: confirmação direta (ou escolha de portador se requiresBearer).

import { useState } from "react";
import { getCardByName } from "@/core/data/cards";
import { ActionButton } from "@/ui/components/ActionButton";
import { Modal } from "@/ui/components/Modal";
import { PlaceholderArt } from "@/ui/components/PlaceholderArt";
import { useGameStore } from "@/ui/store/gameStore";
import { UI } from "@/ui/theme";

interface RewardModalProps {
	onClose: () => void;
}

export function RewardModal({ onClose }: RewardModalProps) {
	const { view, dispatch } = useGameStore();
	const reward = view.pendingRewards[0];
	const activeHeroes = view.heroes.filter((h) => h.status === "active");

	// Etapa do fluxo: "choose_hero" | "choose_destination" | "artifact_bearer"
	const [selectedHeroId, setSelectedHeroId] = useState<string>(
		activeHeroes[0]?.id ?? "",
	);

	// Estado para fluxo de item (deve ficar antes de qualquer return condicional)
	const needHeroStep = reward?.type === "item" && activeHeroes.length > 1;
	const [step, setStep] = useState<"hero" | "destination">(
		needHeroStep ? "hero" : "destination",
	);

	if (!reward) return null;

	// ── Artefato ──────────────────────────────────────────────────────────────
	if (reward.type === "artifact") {
		if (reward.requiresBearer) {
			return (
				<Modal title={`Artefato: ${reward.cardName}`} maxWidth={440}>
					<div className="space-y-4">
						<div className="flex gap-3 items-start">
							<PlaceholderArt cardType="artifact" size="sm" />
							<div>
								<p
									className="text-sm font-medium"
									style={{ color: UI.textPrimary }}
								>
									{reward.cardName}
								</p>
								<p className="text-xs mt-1" style={{ color: UI.textSecondary }}>
									Este artefato requer um portador. Escolha o herói que o
									carregará.
								</p>
							</div>
						</div>

						<div className="space-y-1">
							{activeHeroes.map((h) => (
								<button
									key={h.id}
									type="button"
									className="w-full p-2 rounded-lg text-left text-sm transition-all"
									style={{
										background:
											selectedHeroId === h.id ? UI.info.bg : UI.subpanelBg,
										border: `1px solid ${selectedHeroId === h.id ? "#185FA5" : UI.border}`,
										color: UI.textPrimary,
									}}
									onClick={() => setSelectedHeroId(h.id)}
								>
									{h.cardName}{" "}
									<span style={{ color: UI.textSecondary }}>
										({h.currentLife}/{h.maxLife} vida)
									</span>
								</button>
							))}
						</div>

						<ActionButton
							label="Confirmar portador"
							variant="primary"
							fullWidth
							onClick={() => {
								dispatch({
									type: "CHOOSE_ARTIFACT_BEARER",
									payload: { heroId: selectedHeroId },
								});
								onClose();
							}}
						/>
					</div>
				</Modal>
			);
		}

		// Artefato sem portador — confirmação simples
		return (
			<Modal title="Artefato obtido!" maxWidth={380}>
				<div className="space-y-4">
					<div className="flex gap-3 items-center">
						<PlaceholderArt cardType="artifact" size="sm" />
						<p
							className="text-sm font-medium"
							style={{ color: UI.textPrimary }}
						>
							{reward.cardName}
						</p>
					</div>
					<p className="text-xs" style={{ color: UI.textSecondary }}>
						O artefato foi adicionado à área do grupo.
					</p>
					<ActionButton
						label="OK"
						variant="primary"
						fullWidth
						onClick={() => {
							dispatch({
								type: "CHOOSE_ARTIFACT_BEARER",
								payload: { heroId: null },
							});
							onClose();
						}}
					/>
				</div>
			</Modal>
		);
	}

	// ── Item ──────────────────────────────────────────────────────────────────
	if (step === "hero") {
		return (
			<Modal title={`Item: ${reward.cardName}`} maxWidth={440}>
				<div className="space-y-4">
					<div className="flex gap-3 items-start">
						<PlaceholderArt cardType="item" size="sm" />
						<div>
							<p
								className="text-sm font-medium"
								style={{ color: UI.textPrimary }}
							>
								{reward.cardName}
							</p>
							<p className="text-xs mt-1" style={{ color: UI.textSecondary }}>
								Escolha o herói que vai receber este item.
							</p>
						</div>
					</div>

					<div className="space-y-1">
						{activeHeroes.map((h) => (
							<button
								key={h.id}
								type="button"
								className="w-full p-2 rounded-lg text-left text-sm transition-all"
								style={{
									background:
										selectedHeroId === h.id ? UI.info.bg : UI.subpanelBg,
									border: `1px solid ${selectedHeroId === h.id ? "#185FA5" : UI.border}`,
									color: UI.textPrimary,
								}}
								onClick={() => setSelectedHeroId(h.id)}
							>
								{h.cardName}{" "}
								<span style={{ color: UI.textSecondary }}>
									({h.currentLife}/{h.maxLife} vida)
								</span>
							</button>
						))}
					</div>

					<ActionButton
						label="Próximo"
						variant="primary"
						fullWidth
						disabled={!selectedHeroId}
						onClick={() => setStep("destination")}
					/>
				</div>
			</Modal>
		);
	}

	// Etapa 2: destino do item
	const hero =
		activeHeroes.find((h) => h.id === selectedHeroId) ?? activeHeroes[0];
	const itemCard = getCardByName(reward.cardName);
	const isConsumable =
		itemCard?.type === "item" && itemCard.itemClass === "consumable";

	return (
		<Modal title={`Item: ${reward.cardName}`} maxWidth={380}>
			<div className="space-y-4">
				<div className="flex gap-3 items-center">
					<PlaceholderArt cardType="item" size="sm" />
					<div>
						<p
							className="text-sm font-medium"
							style={{ color: UI.textPrimary }}
						>
							{reward.cardName}
						</p>
						{hero && (
							<p className="text-xs" style={{ color: UI.textSecondary }}>
								Para: {hero.cardName}
							</p>
						)}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					{!isConsumable && (
						<ActionButton
							label="Equipar"
							variant="primary"
							fullWidth
							onClick={() => {
								dispatch({
									type: "CHOOSE_ITEM_DESTINATION",
									payload: {
										heroId: selectedHeroId,
										destination: "equip",
									},
								});
								onClose();
							}}
						/>
					)}
					<ActionButton
						label="Guardar na mochila"
						variant={isConsumable ? "primary" : "secondary"}
						fullWidth
						onClick={() => {
							dispatch({
								type: "CHOOSE_ITEM_DESTINATION",
								payload: {
									heroId: selectedHeroId,
									destination: "backpack",
								},
							});
							onClose();
						}}
					/>
					<ActionButton
						label="Descartar"
						variant="danger"
						fullWidth
						onClick={() => {
							dispatch({
								type: "CHOOSE_ITEM_DESTINATION",
								payload: {
									heroId: selectedHeroId,
									destination: "discard",
								},
							});
							onClose();
						}}
					/>
				</div>
			</div>
		</Modal>
	);
}
