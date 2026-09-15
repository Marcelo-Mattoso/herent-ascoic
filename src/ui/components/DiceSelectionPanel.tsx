import { useState } from "react";
import { getSkillName } from "@/core/data/skillLocale";
import {
	dieReplacementValues,
	isEligibleDie,
	type DiceSelection,
} from "@/core/rules/diceSelection";
import type { CombatRollResult } from "@/core/state/combatState";
import { ActionButton } from "./ActionButton";
import { Modal } from "./Modal";

export function DiceSelectionPanel({
	selection,
	roll,
	heroName,
	enemyName,
	onConfirm,
}: {
	selection: DiceSelection;
	roll: CombatRollResult;
	heroName: string;
	enemyName: string;
	onConfirm: (side: "hero" | "enemy", index: number, value?: number) => void;
}) {
	const [selected, setSelected] = useState<{
		side: "hero" | "enemy";
		index: number;
	} | null>(null);
	const [value, setValue] = useState<number>();
	const modifying = selection.deltaMax !== undefined;
	const rerolling = !modifying && selection.action === "reroll";
	const current = selected
		? (selected.side === "hero" ? roll.heroResults : roll.enemyResults)[
				selected.index
			]
		: undefined;
	const values =
		current === undefined ? [] : dieReplacementValues(selection, current);
	const nextValue = modifying
		? value
		: rerolling
			? undefined
			: (selection.setToValue ?? 6);
	const ready =
		selected !== null &&
		(rerolling || (nextValue !== undefined && values.includes(nextValue)));
	const total = selected?.side === "hero" ? roll.heroTotal : roll.enemyTotal;
	const description = modifying
		? `Ajuste um dado em até ${Math.abs(selection.deltaMax!)} ponto(s), entre 1 e 6.`
		: rerolling
			? "Role novamente um dado. O novo resultado substituirá o atual."
			: `Altere o resultado de um dado para ${selection.setToValue ?? 6}.`;

	return (
		<Modal title={getSkillName(selection.skillId)} maxWidth={640}>
			<div className="dice-choice">
				<p className="dice-choice__intro">{description}</p>
				<p className="dice-choice__step">1. Escolha um dos dados destacados</p>
				<div className="dice-choice__sides">
					{(["hero", "enemy"] as const).map((side) => {
						const results =
							side === "hero" ? roll.heroResults : roll.enemyResults;
						const sideTotal =
							side === "hero" ? roll.heroTotal : roll.enemyTotal;
						const sum = results.reduce((a, b) => a + b, 0);
						const eligible = results.some((_, index) =>
							isEligibleDie(selection, side, index, results),
						);
						return (
							<section
								key={side}
								className={`dice-choice__side dice-choice__side--${side}`}
							>
								<span className="dice-choice__label">
									{side === "hero" ? "ALIADO" : "INIMIGO"}
								</span>
								<h3>{side === "hero" ? heroName : enemyName}</h3>
								<div className="dice-choice__dice">
									{results.map((result, index) => (
										<button
											key={index}
											type="button"
											className="dice-choice__die"
											disabled={!isEligibleDie(selection, side, index, results)}
											aria-label={`Dado ${index + 1} ${side === "hero" ? "aliado" : "inimigo"}: ${result}`}
											aria-pressed={
												selected?.side === side && selected.index === index
											}
											onClick={() => {
												setSelected({ side, index });
												setValue(undefined);
											}}
										>
											{result}
										</button>
									))}
								</div>
								<p className="dice-choice__sum">
									Dados {sum} · Bônus {sideTotal - sum >= 0 ? "+" : ""}
									{sideTotal - sum} <strong>Total {sideTotal}</strong>
								</p>
								{!eligible && (
									<small>Esta habilidade não altera estes dados.</small>
								)}
							</section>
						);
					})}
				</div>
				{modifying && (
					<div>
						<p className="dice-choice__step">2. Escolha o novo valor</p>
						{selected ? (
							<div className="dice-choice__dice">
								{values.map((option) => (
									<button
										type="button"
										key={option}
										className="dice-choice__die"
										aria-label={`Novo valor ${option}`}
										aria-pressed={value === option}
										onClick={() => setValue(option)}
									>
										{option}
									</button>
								))}
							</div>
						) : (
							<p className="dice-choice__muted">
								Selecione um dado para ver os valores permitidos.
							</p>
						)}
					</div>
				)}
				<div className="dice-choice__preview" aria-live="polite">
					{selected && current !== undefined
						? rerolling
							? `Dado ${current} → nova rolagem. O resultado pode aumentar ou diminuir.`
							: nextValue !== undefined
								? `Dado ${current} → ${nextValue} · Total ${total} → ${total - current + nextValue}`
								: `Dado ${current} selecionado. Escolha o novo valor.`
						: "O ataque aguarda sua escolha."}
				</div>
				<ActionButton
					label={rerolling ? "Confirmar e rerrolar" : "Aplicar alteração"}
					variant="primary"
					fullWidth
					disabled={!ready}
					onClick={() => {
						if (ready && selected)
							onConfirm(selected.side, selected.index, nextValue);
					}}
				/>
				<p className="dice-choice__muted">
					Depois da habilidade, você poderá resolver o ataque.
				</p>
			</div>
		</Modal>
	);
}
