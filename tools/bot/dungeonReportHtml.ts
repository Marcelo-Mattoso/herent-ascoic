import type { BenchmarkSummary, BenchmarkTrial, DungeonBenchmarkOptions } from "./dungeonBenchmark";
import type { ReportProvenance } from "./reportProvenance";
import type { BenchmarkDiagnostics } from "./reportDiagnostics";

export interface DungeonReportData {
	readonly generatedAt: string;
	readonly provenance?: ReportProvenance;
	readonly scope?: "solo";
	readonly diagnostics?: BenchmarkDiagnostics;
	readonly options: DungeonBenchmarkOptions;
	readonly completed: number;
	readonly expected: number;
	readonly trials: readonly BenchmarkTrial[];
	readonly summaries: readonly BenchmarkSummary[];
	readonly expansionNames?: Readonly<Record<string, string>>;
}

const percent = (value: number) => (100 * value).toFixed(1) + "%";
const average = (value: number) => value.toFixed(1);

export function renderDungeonReportMarkdown(report: DungeonReportData): string {
	const { options, summaries, trials } = report;
	const rows = summaries.map((s) =>
		"| " + [s.expansionId, s.profile, s.difficulty, s.heroName, String(s.games), String(s.victories),
			String(s.defeats), String(s.stalls), percent(s.victoryRate), average(s.avgRooms),
			average(s.avgSteps)].join(" | ") + " |");
	const anomalies = trials.filter((trial) => trial.violation);
	return [
		"# Ensaio de masmorras — Ascensão Heróica",
		"",
		"Execução em " + report.generatedAt + ". " + report.completed + "/" + report.expected + " partidas.",
		report.provenance ? "Commit: " + (report.provenance.gitCommit ?? "não identificado") +
			"; árvore Git " + (report.provenance.workingTreeClean ? "limpa" : "não validada") +
			"; comparabilidade " + (report.provenance.comparable ? "verificada" : "não verificada") + "." : "",
		"Escopo: exclusivamente partidas solo; grupos de 2–4 heróis não estão incluídos.",
		...(report.diagnostics ? [
			"## Diagnósticos de consistência",
			"Hard/Pesadelo: " + report.diagnostics.difficultyParity.sameOutcome + "/" +
				report.diagnostics.difficultyParity.pairedGames + " pares com mesmo resultado.",
			"Veneno: " + report.diagnostics.poison.toHeroes + " PV em heróis, " +
				report.diagnostics.poison.toEnemies + " PV em inimigos, " +
				report.diagnostics.poison.preventedByHeart + " PV evitados pelo Coração.",
			"XP sem conciliação: " + report.diagnostics.xpAccountingMismatches +
				"; tentativas inefetivas de level up: " + report.diagnostics.ineffectiveLevelUpAttempts + ".",
			...report.diagnostics.warnings.map((warning) => "- " + warning),
			"",
		] : []),
		"Seeds " + options.seed + " a " + (options.seed + options.runs - 1) +
			"; " + options.runs + " repetições; até " + options.maxSteps + " ações por partida.",
		"",
		"Cada seed usa a mesma ordem inicial de salas, criaturas, itens e artefatos dentro de cada expansão, para todos os heróis, perfis e dificuldades. Expansões distintas usam baralhos distintos; a trajetória posterior pode divergir.",
		"Vitória, derrota e impasse são contados separadamente. A taxa reflete o desempenho do bot, não a chance de vitória de um jogador humano. Dez seeds dão apenas um diagnóstico exploratório.",
		"",
		"## Resultados por expansão, perfil, dificuldade e herói",
		"",
		"| Expansão | Perfil | Dificuldade | Herói | Jogos | Vitórias | Derrotas | Impasses | Vitórias % | Salas médias | Ações médias |",
		"|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
		...rows,
		"",
		"## Impasses e erros encontrados",
		"",
		...(anomalies.length
			? anomalies.map((trial) =>
				"- Seed " + trial.seed + " · " + trial.expansionId + " · " + trial.heroId + " · " + trial.profile +
				" · " + trial.difficulty + ": " + trial.violation + " — " + trial.violationMessage)
			: ["Nenhum erro/invariante nas partidas concluídas."]),
		"",
		"Consulte `index.html` para o painel visual, `report.json` para os dados e `report.csv` para analisar no Excel.",
		"",
	].join("\n");
}

export function renderDungeonReportCsv(trials: readonly BenchmarkTrial[]): string {
	const columns = ["seed", "repetition", "expansionId", "profile", "difficulty", "heroId", "outcome",
		"violation", "violationMessage", "steps", "roomsCleared", "creaturesDefeated",
		"bossDefeated", "artifacts", "skillUses", "powerUses"] as const;
	const quote = (value: unknown) => {
		const text = value == null ? "" : String(value);
		return '"' + text.replaceAll('"', '""') + '"';
	};
	return [columns.join(","), ...trials.map((trial) =>
		columns.map((column) => quote(trial[column])).join(","))].join("\n") + "\n";
}

/** HTML autossuficiente, aberto como file:// — não entra em public/ nem em dist/. */
export function renderDungeonReportHtml(report: DungeonReportData): string {
	const payload = JSON.stringify(report).replaceAll("<", "\\u003c");
	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow,noarchive"/>
<title>Relatório de Masmorras | Ascensão Heróica</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#e5edf6;background:#080f1c}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 90% 0%,#172b40 0%,transparent 38%),#080f1c}
header,main,footer{max-width:1260px;margin:auto;padding:0 28px}
header{padding-top:54px;padding-bottom:24px}header h1{font-size:clamp(2rem,5vw,3.5rem);letter-spacing:-.05em;line-height:1.1;margin:10px 0 12px;color:#fff}
.eyebrow{font-size:.73rem;letter-spacing:.16em;text-transform:uppercase;color:#8ce5cd;font-weight:800}
.lead{color:#9aabc1;line-height:1.6;max-width:840px;font-size:.98rem}.meta{display:flex;flex-wrap:wrap;gap:10px;margin:25px 0}
.pill{border:1px solid #35465b;border-radius:999px;padding:7px 12px;font-size:.78rem;color:#b8c7d8;background:#101d2c}
main{padding-bottom:45px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.metric,.panel{background:#101c2b;border:1px solid #26364c;border-radius:16px}.metric{padding:20px}
.metric .label{font-size:.77rem;color:#9faec1}.metric strong{display:block;font-size:2rem;margin:9px 0 3px;letter-spacing:-.04em;color:#f9fcff}
.metric small{color:#87a0b7;font-size:.73rem}.sections{display:grid;gap:17px;margin-top:22px}.panel{padding:24px}
.panel h2{margin:0 0 9px;font-size:1.25rem;letter-spacing:-.025em}.help{color:#9bb0c5;font-size:.85rem;line-height:1.6;margin:0 0 18px}
.controls{display:flex;align-items:end;gap:15px;flex-wrap:wrap;margin-top:20px}.control{display:flex;flex-direction:column;gap:6px;color:#9aabc1;font-size:.74rem}
select{color:#edf7ff;padding:10px 12px;background:#17283b;border:1px solid #3c5369;border-radius:9px;min-width:200px;font-size:.91rem}
.scroller{overflow-x:auto}table{border-collapse:separate;border-spacing:0;width:100%;font-size:.84rem;text-align:left}th,td{padding:12px 10px;border-bottom:1px solid #25364a;white-space:nowrap}
th{font-weight:700;color:#a7bdd3;font-size:.76rem;background:#172536;position:sticky;top:0}
td{color:#d8e5f3}.hero{font-weight:700;color:#f2f8ff}.heat{text-align:center;border-radius:9px;font-variant-numeric:tabular-nums}
.heat strong{font-size:1rem;display:block}.heat small{font-size:.68rem;opacity:.8}
.bar-wrap{background:#243548;border-radius:999px;height:9px;min-width:85px;overflow:hidden}.bar{height:100%;background:linear-gradient(90deg,#2e91a7,#57dbb5)}
.profile-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:11px}
.profile{background:#17283b;border:1px solid #304359;border-radius:12px;padding:15px}
.profile b{display:block;color:#fff;font-size:.82rem;margin-bottom:10px}.profile .pct{font-size:1.7rem;font-weight:800;letter-spacing:-.03em}
.profile p{font-size:.7rem;color:#9db1c4;margin:8px 0 0}.failure{color:#ffbd9a}.success{color:#65e1be}.muted{color:#8198b1}
footer{padding:20px 28px 50px;font-size:.8rem;color:#8ca0b6}.note{border-left:3px solid #57dbb5;padding:8px 15px;background:#14283a;color:#bdd2e1;line-height:1.65;margin-top:18px}
.empty{text-align:center;color:#9bb0c5;padding:24px}.legend{font-size:.7rem;color:#9db1c4;padding:8px 0}
@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.profile-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:530px){header,main,footer{padding-left:15px;padding-right:15px}.metrics{gap:8px}.metric{padding:14px}.panel{padding:15px}.profile-grid{grid-template-columns:1fr 1fr}.metric strong{font-size:1.6rem}}
</style>
</head>
<body>
<header>
<div class="eyebrow">A FORJA · LABORATÓRIO DE BALANCEAMENTO · DESENVOLVIMENTO</div>
<h1>O teste de cada herói<br/>em cada expansão.</h1>
<p class="lead">Comparação pareada dos heróis de todas as expansões habilitadas, nos módulos isolados de cada chefe. Cada repetição reutiliza a mesma seed dentro de cada expansão, cruzando heróis, dificuldades e perfis.</p>
<div class="meta" id="metadata"></div>
</header>
<main>
<section class="metrics" id="metrics"></section>
<div class="sections">
<section class="panel">
<h2>Diagnósticos de consistência</h2>
<p class="help">Métricas globais calculadas a partir das partidas solo. Preparação não prova execução do efeito e paridade de desfecho não prova identidade de dificuldade.</p>
<div id="diagnostics" class="help">Relatório legado: sem telemetria de consistência agregada.</div>
</section>
<section class="panel">
<h2>Matriz de vitórias por herói</h2>
<p class="help">Selecione um módulo e um herói para ver a taxa de vitória em cada dificuldade. A seleção começa na expansão de referência; o comparativo abaixo mostra todos os módulos com os mesmos filtros de herói/perfil/dificuldade. A opção "Todas as expansões" agrega taxas e não deve ser confundida com uma masmorra única. Impasses não são tratados como derrotas.</p>
<div class="controls">
<label class="control">Expansão <select id="expansion"></select></label>
<label class="control">Herói <select id="hero"></select></label>
<label class="control">Perfil do bot <select id="profile"></select></label>
<label class="control">Dificuldade <select id="difficulty"></select></label>
</div>
<div class="scroller" style="margin-top:19px"><table><thead id="matrix-head"></thead><tbody id="matrix"></tbody></table></div>
<div class="legend">Cor verde = taxa maior; cor âmbar = poucos sucessos; traço = sem partidas.</div>
</section>
<section class="panel">
<h2>Comparativo entre expansões</h2>
<p class="help">Mesmo herói, perfil, dificuldade e seeds; cada módulo usa seus próprios baralhos e chefe. Compare o desempenho e investigue diferenças de dificuldade. <a href="catalog.html">Ver a auditoria de criaturas, salas e equipamentos</a>.</p>
<div class="scroller"><table><thead><tr><th>Expansão</th><th>Partidas</th><th>Vitórias</th><th>Derrotas</th><th>Impasses</th><th>Vitória %</th><th>Salas médias</th></tr></thead><tbody id="expansion-compare"></tbody></table></div>
</section>
<section class="panel">
<h2>Comparação entre os perfis</h2>
<p class="help">Vitórias por perfil nas mesmas sementes, respeitando o herói e a dificuldade selecionados. Use esta comparação para identificar diferenças de estratégia entre perfis.</p>
<div class="profile-grid" id="profile-compare"></div>
</section>
<section class="panel">
<h2>Detalhamento das partidas</h2>
<p class="help">Resultados individuais para auditar seeds, progresso, derrotas e travamentos. O filtro acima também se aplica à tabela.</p>
<div class="scroller" style="max-height:510px;overflow:auto"><table>
<thead><tr><th>Seed</th><th>Expansão</th><th>Herói</th><th>Perfil</th><th>Dificuldade</th><th>Resultado</th><th>Salas</th><th>Criaturas</th><th>Ações</th><th>Artefatos</th><th>Habilidades</th><th>Diagnóstico</th></tr></thead>
<tbody id="trials"></tbody></table></div>
</section>
<section class="panel">
<h2>Como interpretar</h2>
<p class="help">Masmorra igual significa mesma seed, boss, primeira sala e baralhos iniciais DENTRO de uma expansão. Não significa que a Fornalha e a Bruxa tenham as mesmas cartas. Conforme a partida avança, decisões e efeitos podem alterar o percurso.</p>
<div class="note">Este relatório é um instrumento de desenvolvimento, não aparece na interface pública do jogo. Taxa de vitória do bot não é probabilidade de vitória humana. Com dez repetições por combinação, trate diferenças pequenas como indícios para investigar, não como conclusões definitivas.</div>
</section>
</div>
</main>
<footer>Ascensão Heróica · Ensaio de masmorras · arquivo local sem serviços externos</footer>
<script type="application/json" id="dataset">${payload}</script>
<script>
(function(){
"use strict";
const data=JSON.parse(document.getElementById("dataset").textContent);
const diffLabels={very_easy:"Muito fácil",easy:"Fácil",normal:"Normal",hard:"Difícil",nightmare:"Pesadelo"};
const profileLabels={"casual":"Casual","power-player":"Power Player","speedrunner":"Speedrunner","explorer":"Explorador","random":"Aleatório"};
const el=(id)=>document.getElementById(id);
const esc=(value)=>String(value??"").replace(/[&<>"']/g,(s)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
const pct=(a,b)=>b?(100*a/b).toFixed(1)+"%":"—";
const nameById=new Map(data.summaries.map((s)=>[s.heroId,s.heroName]));
const expansionNames=data.expansionNames||{};
if(data.diagnostics){
 const d=data.diagnostics,p=d.difficultyParity;
 const parity=p.pairedGames?(100*p.sameOutcomeRate).toFixed(1)+'% ('+p.sameOutcome+'/'+p.pairedGames+')':'Sem pares';
 const notices=d.warnings.length?d.warnings.map(w=>'<li>'+esc(w)+'</li>').join(''):'<li>Nenhum alerta automático registrado.</li>';
 el('diagnostics').innerHTML='<p><strong>Difícil × Pesadelo:</strong> '+esc(parity)+' resultados iguais nos pares. <strong>XP não conciliado:</strong> '+d.xpAccountingMismatches+'. <strong>Level up sem efeito:</strong> '+d.ineffectiveLevelUpAttempts+'.</p><p><strong>Veneno:</strong> '+(d.poison?.toHeroes??0)+' PV nos heróis, '+(d.poison?.toEnemies??0)+' PV nos inimigos, '+(d.poison?.preventedByHeart??0)+' PV evitados pelo Coração.</p><ul>'+notices+'</ul><p>Consulte <code>diagnostics.abilityActivity</code> no JSON para contagem por ID; triggers automáticos sem modal não são observados por esses contadores.</p>';
}
const expansionName=(id)=>expansionNames[id]||id;
function status(trial){return trial.violation?"stall":trial.outcome==="VICTORY"?"win":trial.outcome==="DEFEAT"?"loss":"stall"}
function render(){
const hero=el("hero").value, profile=el("profile").value, difficulty=el("difficulty").value, expansion=el("expansion").value;
const trials=data.trials.filter((t)=>(expansion==="all"||t.expansionId===expansion)&&(hero==="all"||t.heroId===hero)&&(profile==="all"||t.profile===profile)&&(difficulty==="all"||t.difficulty===difficulty));
const wins=trials.filter((t)=>status(t)==="win").length,losses=trials.filter((t)=>status(t)==="loss").length,stalls=trials.length-wins-losses;
const rooms=trials.reduce((n,t)=>n+t.roomsCleared,0),steps=trials.reduce((n,t)=>n+t.steps,0);
const cards=[
["Taxa de vitória",pct(wins,trials.length),"Vitórias observadas"],
["Vitórias / derrotas",wins+" / "+losses,"Impasses: "+stalls],
["Salas limpas",trials.length?(rooms/trials.length).toFixed(1):"—","Média por partida"],
["Ações / partida",trials.length?Math.round(steps/trials.length):"—","Limite: "+data.options.maxSteps]
];
el("metrics").innerHTML=cards.map((a)=>'<div class="metric"><span class="label">'+esc(a[0])+'</span><strong>'+esc(a[1])+'</strong><small>'+esc(a[2])+'</small></div>').join("");
const diffs=difficulty==="all"?data.options.difficulties:[difficulty];
el("matrix-head").innerHTML='<tr><th>Herói</th>'+diffs.map((d)=>'<th>'+esc(diffLabels[d]||d)+'</th>').join("")+'</tr>';
const heroes=hero==="all"?data.options.heroes:[hero];
el("matrix").innerHTML=heroes.map((heroId)=>{
const cells=diffs.map((diff)=>{
const group=data.trials.filter((t)=>t.heroId===heroId&&t.difficulty===diff&&(expansion==="all"||t.expansionId===expansion)&&(profile==="all"||t.profile===profile));
if(!group.length)return '<td class="heat">—</td>';
const victories=group.filter((t)=>status(t)==="win").length;
const defeats=group.filter((t)=>status(t)==="loss").length;
const stalls=group.length-victories-defeats;
const rate=victories/group.length;
const bg=rate>.6?'rgba(57,198,147,.31)':rate>.2?'rgba(38,143,160,.28)':'rgba(201,140,65,.19)';
return '<td class="heat" style="background:'+bg+'"><strong>'+pct(victories,group.length)+'</strong><small>'+victories+' V · '+defeats+' D · '+stalls+' I / '+group.length+'</small></td>';
}).join("");
return '<tr><td class="hero">'+esc(nameById.get(heroId)||heroId)+'</td>'+cells+'</tr>';
}).join("");
el("trials").innerHTML=trials.length?trials.map((t)=>{
const s=status(t),label=s==="win"?"Vitória":s==="loss"?"Derrota":"Impasso",cls=s==="win"?"success":s==="stall"?"failure":"muted";
return '<tr><td>'+t.seed+'</td><td>'+esc(expansionName(t.expansionId))+'</td><td>'+esc(nameById.get(t.heroId)||t.heroId)+'</td><td>'+esc(profileLabels[t.profile]||t.profile)+'</td><td>'+esc(diffLabels[t.difficulty]||t.difficulty)+'</td><td class="'+cls+'">'+label+'</td><td>'+t.roomsCleared+'</td><td>'+t.creaturesDefeated+'</td><td>'+t.steps+'</td><td>'+t.artifacts+'</td><td>'+t.skillUses+'</td><td title="'+esc(t.violationMessage||"")+'">'+esc(t.violation||"—")+'</td></tr>';
}).join(""):'<tr><td colspan="12" class="empty">Sem resultados para este filtro.</td></tr>';
el("expansion-compare").innerHTML=data.options.expansions.map((id)=>{
const group=data.trials.filter((t)=>t.expansionId===id&&(hero==="all"||t.heroId===hero)&&(profile==="all"||t.profile===profile)&&(difficulty==="all"||t.difficulty===difficulty));
const w=group.filter((t)=>status(t)==="win").length,d=group.filter((t)=>status(t)==="loss").length,s=group.length-w-d;
const avg=group.length?(group.reduce((sum,t)=>sum+t.roomsCleared,0)/group.length).toFixed(1):"—";
return '<tr><td>'+esc(expansionName(id))+'</td><td>'+group.length+'</td><td>'+w+'</td><td>'+d+'</td><td>'+s+'</td><td>'+pct(w,group.length)+'</td><td>'+avg+'</td></tr>';
}).join("");
el("profile-compare").innerHTML=data.options.profiles.map((p)=>{
const group=data.trials.filter((t)=>t.profile===p&&(expansion==="all"||t.expansionId===expansion)&&(hero==="all"||t.heroId===hero)&&(difficulty==="all"||t.difficulty===difficulty));
const n=group.filter((t)=>status(t)==="win").length,st=group.filter((t)=>status(t)==="stall").length,rate=group.length?n/group.length:0;
return '<div class="profile"><b>'+esc(profileLabels[p]||p)+'</b><div class="pct">'+pct(n,group.length)+'</div><div class="bar-wrap"><div class="bar" style="width:'+(rate*100)+'%"></div></div><p>'+n+' vitórias · '+st+' impasses / '+group.length+' jogos</p></div>';
}).join("");
}
el("metadata").innerHTML=[
'Gerado em '+new Date(data.generatedAt).toLocaleString("pt-BR"),
data.options.runs+' seeds compartilhadas',
data.completed+' / '+data.expected+' partidas',
data.options.expansions.length+' expansões independentes',
data.provenance?.gitCommit ? 'Commit '+data.provenance.gitCommit.slice(0,8)+(data.provenance.comparable?' · limpo':' · não comparável') : 'Commit não informado',
'Escopo: solo'
].map((x)=>'<span class="pill">'+esc(x)+'</span>').join("");
el("expansion").innerHTML='<option value="all">Todas as expansões</option>'+data.options.expansions.map((id)=>'<option value="'+esc(id)+'">'+esc(expansionName(id))+'</option>').join("");
el("expansion").value=data.options.expansions[0]||"all";
el("hero").innerHTML='<option value="all">Todos os heróis</option>'+data.options.heroes.map((h)=>'<option value="'+esc(h)+'">'+esc(nameById.get(h)||h)+'</option>').join("");
el("profile").innerHTML='<option value="all">Todos os perfis (agregado)</option>'+data.options.profiles.map((p)=>'<option value="'+esc(p)+'">'+esc(profileLabels[p]||p)+'</option>').join("");
el("difficulty").innerHTML='<option value="all">Todas as dificuldades</option>'+data.options.difficulties.map((d)=>'<option value="'+esc(d)+'">'+esc(diffLabels[d]||d)+'</option>').join("");
el("expansion").addEventListener("change",render);
el("hero").addEventListener("change",render);
el("profile").addEventListener("change",render);
el("difficulty").addEventListener("change",render);
render();
})();
</script>
</body>
</html>`;
}
