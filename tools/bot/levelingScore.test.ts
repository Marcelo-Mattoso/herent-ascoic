import { describe, expect, it } from "vitest";
import { getAllCards } from "@/core/data/cards";
import { buildCatalogBalance } from "./catalogBalance";
import { COLORS, COMBAT_WEIGHTS, LEVELING_VERSION, evaluateCard, matchup } from "./levelingScore";

describe("Leveling 2.0 — auditoria estrutural", () => {
 it("preserva distribuição dos pesos normalizada", () => {
  expect(Object.values(COMBAT_WEIGHTS).reduce((a,b)=>a+b,0)).toBe(100);
 });
 it("respeita empate do manual (ambos sofrem um ponto)", () => {
  const result=matchup({dice:0,hit:0,damage:5},{dice:0,hit:0,damage:7});
  expect(result.win).toBe(0);
  expect(result.tie).toBe(1);
  expect(result.dealt).toBe(1);
  expect(result.taken).toBe(1);
 });
 it("calcula probabilidades discretas d6 sem aleatoriedade", () => {
  const result=matchup({dice:1,hit:0,damage:2},{dice:1,hit:0,damage:2});
  expect(result.win).toBeCloseTo(15/36,8);
  expect(result.tie).toBeCloseTo(6/36,8);
  expect(result.loss).toBeCloseTo(15/36,8);
 });
 it("avalia cinco cores e não inclui chefes finais", () => {
  const cards=getAllCards();
  const hero=cards.find(c=>c.type==="hero");
  const creature=cards.find(c=>c.type==="creature");
  if(!hero||!creature)throw new Error("Catálogo incompleto");
  const result=evaluateCard(hero,creature);
  expect(result.version).toBe(LEVELING_VERSION);
  expect(result.colors.map(c=>c.color)).toEqual([...COLORS]);
  for(const color of result.colors){
   expect(color.score).toBeGreaterThanOrEqual(0);
   expect(color.score).toBeLessThanOrEqual(100);
   expect(color.winProbability+color.tieProbability).toBeLessThanOrEqual(100.1);
  }
  const report=buildCatalogBalance();
  for(const pack of report.expansions){
   expect(pack.heroes.every(h=>h.leveling?.colors.length===5)).toBe(true);
   expect(pack.creatures.every(h=>h.leveling?.colors.length===5)).toBe(true);
   expect(pack.rooms.every(room=>room.leveling?.threatByPlayers.length===4)).toBe(true);
   expect(pack.rooms.every(room=>room.leveling?.threatByPlayersAndColor.every(row=>row.length===5))).toBe(true);
  }
  expect(report.levelingVersion).toBe(LEVELING_VERSION);
 });
});
