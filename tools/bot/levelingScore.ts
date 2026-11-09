/**
 * Leveling 2.0: auditoria determinística, SEM executar partidas e SEM alterar o motor.
 * Índices relativos (0..100), não probabilidades de vitória.
 */
import type { HeroCard, CreatureCard, SubbossCard, RoomCard } from "@/core/data/cardTypes";
import { cardAbilityGrants, lookupAbilityById } from "@/core/data/abilities";
import { SKILLS } from "@/core/data/skills";

export const LEVELING_VERSION = "2.0.0";
export const COMBAT_WEIGHTS = { life: 20, damage: 30, hit: 20, dice: 15, defense: 15 } as const;
export const COLORS = ["branco", "amarelo", "laranja", "vermelho", "roxo"] as const;
type CombatCard = HeroCard | CreatureCard | SubbossCard;
export type Domain = "combat" | "dungeon" | "survival" | "utility" | "progression";
export interface AbilityScore {
  id: string;
  name: string;
  activation: string;
  awakeningOnly: boolean;
  domains: Record<Exclude<Domain,"progression">, number>;
  impact: number;
  frequency: number;
  condition: number;
  utilization: number;
  score: number;
  uncertain: boolean;
}
export interface ColorScore {
  color: string;
  life: number;
  hitBonus: number;
  dice: number;
  damage: number;
  expectedDamage: number;
  expectedDamageTaken: number;
  winProbability: number;
  tieProbability: number;
  components: Record<"life"|"damage"|"hit"|"dice"|"defense", number>;
  score: number;
}
export interface CardLeveling {
  version: string;
  colors: ColorScore[];
  combat: number;
  dungeon: number;
  survival: number;
  utility: number;
  progression: number;
  abilities: AbilityScore[];
  warnings: string[];
}
export interface RoomLeveling {
  version: string;
  threatByPlayers: number[];
  threatByPlayersAndColor: number[][];
  skills: AbilityScore[];
  warnings: string[];
}
const round=(n:number)=>Math.round(n*10)/10;
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const rate=(n:number,max:number)=>clamp(n/max*100);
const vec=()=>({combat:0,dungeon:0,survival:0,utility:0});
const kindDomains: Record<string, Partial<Record<Exclude<Domain,"progression">,number>>> = {
 i_damage:{combat:4},i_apply_poison:{combat:3.5},i_apply_damage_over_time:{combat:3.5},
 i_heal:{survival:3},i_full_heal:{survival:5},i_prevent_destroy:{survival:5},
 i_discard:{dungeon:3},i_draw:{dungeon:2},i_draw_and_choose:{dungeon:3},
 i_advance_dungeon:{dungeon:3},i_recover_dungeon:{dungeon:4},
 i_reroll:{combat:2,utility:1},i_set_die:{combat:2.5},
 i_poison_ward:{survival:2.5},p_block:{survival:2.5},
 p_modifier:{combat:1,utility:1},add_trigger:{utility:2},
 i_choose_one:{utility:1},
};
function effects(value:unknown): Array<Record<string,unknown>> {
 if(Array.isArray(value)) return value.flatMap(effects);
 if(!value||typeof value!=="object")return [];
 const obj=value as Record<string,unknown>;
 return [...(typeof obj.kind==="string"?[obj]:[]),...["do","then","else","effect","options"].flatMap(k=>effects(obj[k]))];
}
const legacy = new Map(SKILLS.abilities.map(x=>[x.id,x]));
export function evaluateAbilities(cardId:string):AbilityScore[]{
 return cardAbilityGrants(cardId).map(grant=>{
  const definition=lookupAbilityById(grant.abilityId);
  const old=legacy.get(grant.abilityId);
  const nodes=effects(definition?.effect??old?.effect);
  const domains=vec();
  let uncertain=Boolean(definition?.script||old?.script);
  for(const node of nodes){
   const kind=String(node.kind);
   const impacts=kindDomains[kind];
   if(!impacts){uncertain=true;continue;}
   // Numeric DSL params are not always literal; do not claim precise damage without resolving them.
   const params={...(definition?.defaultParams??{}),...(grant.params??{})} as Record<string,unknown>;
   const raw=node.value??node.amount??params.value;
   const magnitude=typeof raw==="number"&&Number.isFinite(raw)?Math.min(3,Math.max(.5,raw/2)):1;
   for(const domain of Object.keys(impacts) as Array<keyof typeof domains>)
    domains[domain]+= (impacts[domain]??0)*magnitude;
  }
  if(uncertain && nodes.length===0) domains.utility+=1;
  const activation=grant.activation;
  const frequency=activation.kind==="continuous"?1:activation.kind==="event" ? .75 : activation.kind==="on_enter_play" ? .6 : .65;
  const condition=activation.conditions?.length ? .6 : 1;
  const usage=activation.limit?Math.min(1,Math.max(.15,activation.limit.maxUses/3)) : 1;
  const utilization=activation.consumeSource!=="none"&&activation.consumeSource!=null ? .65 : 1;
  const cost= (activation.cost?.hp??0)*.15+(activation.cost?.mp??0)*.1+(activation.actionCost==="consume_hero_action" ? .15 : 0);
  const total=Object.values(domains).reduce((a,b)=>a+b,0);
  const scale=frequency*condition*usage*utilization*Math.max(.2,1-cost);
  for(const d of Object.keys(domains) as Array<keyof typeof domains>)domains[d]=round(domains[d]*scale);
  return {id:grant.abilityId,name:grant.abilityId,activation:activation.kind,
   awakeningOnly:grant.requiresAwakening===true,domains,impact:round(total),
   frequency,condition,utilization:round(utilization*usage*Math.max(.2,1-cost)),
   score:round(total*scale),uncertain};
 });
}
// Exact discrete probability of d6 sums, with a 1-point tie exchange (combat.ts).
const distributions=new Map<number,number[]>();
function dist(dice:number):number[]{
 const n=Math.max(0,Math.min(12,Math.trunc(dice)));
 const known=distributions.get(n);if(known)return known;
 let a=[1];
 for(let i=0;i<n;i++){const b=Array(a.length+6).fill(0) as number[];
  a.forEach((v,j)=>{for(let face=1;face<=6;face++)b[j+face]+=v/6;});a=b;}
 distributions.set(n,a);return a;
}
export function matchup(a:{dice:number;hit:number;damage:number},b:{dice:number;hit:number;damage:number}){
 const x=dist(a.dice),y=dist(b.dice);
 let win=0,tie=0,loss=0;
 x.forEach((xp,i)=>y.forEach((yp,j)=>{if(i+a.hit>j+b.hit)win+=xp*yp;
 else if(i+a.hit===j+b.hit)tie+=xp*yp;else loss+=xp*yp;}));
 return {win, tie, loss, dealt:win*a.damage+tie, taken:loss*b.damage+tie};
}
const reference={life:12,damage:6,hit:8,dice:6,defense:6};
const average=(xs:readonly number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
export function evaluateCombat(card:CombatCard,opponent:CombatCard):ColorScore[]{
 return COLORS.map((color,index)=>{
  const dice=card.diceByColor[index]??0,hit=card.hitBonus[index]??0,life=card.life[index]??0;
  const enemyDice=opponent.diceByColor[index]??0,enemyHit=opponent.hitBonus[index]??0;
  const result=matchup({dice,hit,damage:card.damage},{dice:enemyDice,hit:enemyHit,damage:opponent.damage});
  const defense=Math.max(0,opponent.damage-result.taken);
  const components={
   life:rate(life,reference.life),damage:rate(result.dealt,reference.damage),
   hit:rate(result.win+result.tie*.5,1),dice:rate(dice,reference.dice),
   defense:rate(defense,reference.defense),
  };
  const weightTotal=Object.values(COMBAT_WEIGHTS).reduce((a,b)=>a+b,0);
  const score=round(Object.entries(COMBAT_WEIGHTS).reduce((a,[key,weight])=>
   a+components[key as keyof typeof components]*weight/weightTotal,0));
  return {color,life,hitBonus:hit,dice,damage:card.damage,
   expectedDamage:round(result.dealt),expectedDamageTaken:round(result.taken),
   winProbability:round(result.win*100),tieProbability:round(result.tie*100),
   components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,round(v)])) as typeof components,score};
 });
}
export function evaluateCard(card:CombatCard,opponent:CombatCard):CardLeveling{
 const colors=evaluateCombat(card,opponent);
 const abilities=evaluateAbilities(card.id);
 const accessible=(i:number)=>abilities.filter(a=>!a.awakeningOnly||i===4);
 const skills=(domain:Exclude<Domain,"progression">,i:number)=>
  Math.min(100,accessible(i).reduce((a,b)=>a+b.domains[domain],0)*4);
 const combined=colors.map((c,i)=>clamp(c.score+skills("combat",i)*.25));
 const combat=round(combined[0]);
 const dungeon=round(skills("dungeon",0));
 const survival=round(clamp(colors[0].components.life*.45+colors[0].components.defense*.35+skills("survival",0)*.2));
 const utility=round(skills("utility",0));
 const progression=round(Math.max(0,combined[4]-combined[0]));
 return {version:LEVELING_VERSION,colors,combat,dungeon,survival,utility,progression,abilities,
  warnings:abilities.filter(a=>a.uncertain).map(a=>"Efeito não quantificado integralmente: "+a.id)};
}
export function evaluateRoom(room:RoomCard,creatures:readonly CreatureCard[],referenceHero:HeroCard):RoomLeveling{
 const skills=evaluateAbilities(room.id);
 const mean=COLORS.map((_,i)=>average(creatures.map(c=>evaluateCombat(c,referenceHero)[i].score)));
 const byColor=room.enemiesByPlayers.map(n=>mean.map(v=>round(n*v+
  skills.filter(s=>!s.awakeningOnly).reduce((a,s)=>a+s.score,0)*1.5)));
 return {version:LEVELING_VERSION,threatByPlayers:byColor.map(a=>a[0]),
  threatByPlayersAndColor:byColor,skills,
  warnings:["Ameaça estimada pela composição média; sinergia, invocações e criatura especial exigem análise de cenário."]};
}
