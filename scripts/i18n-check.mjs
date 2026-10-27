import fs from "node:fs";
import path from "node:path";
import { syncSourceCatalogs } from "./i18n-source.mjs";

const defaultRoot = path.resolve(import.meta.dirname, "..");
const statuses = new Set(["draft", "review", "published"]);
const directions = new Set(["ltr", "rtl"]);
const placeholderPattern = /\{\{?([A-Za-z_][\w]*)\}\}?/g;
const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function duplicateKeys(source, file) {
	const stack = [];
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (char === '"') {
			const start = index;
			for (index++; index < source.length; index++) {
				if (source[index] === "\\") { index++; continue; }
				if (source[index] === '"') break;
			}
			const current = stack.at(-1);
			if (current?.kind === "object" && current.expectKey) {
				const key = JSON.parse(source.slice(start, index + 1));
				if (current.keys.has(key)) throw new Error(`${file}: chave JSON duplicada: ${key}`);
				current.keys.add(key);
				current.expectKey = false;
			}
		} else if (char === "{") stack.push({ kind: "object", keys: new Set(), expectKey: true });
		else if (char === "[") stack.push({ kind: "array" });
		else if (char === "}" || char === "]") stack.pop();
		else if (char === "," && stack.at(-1)?.kind === "object") stack.at(-1).expectKey = true;
	}
}

function readJson(file) {
	const bytes = fs.readFileSync(file);
	if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) throw new Error(`${file}: BOM UTF-8 não permitido`);
	const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	const value = JSON.parse(source);
	duplicateKeys(source, file);
	return value;
}

function leaves(value, prefix = "", output = new Map()) {
	if (typeof value === "string") { output.set(prefix, value); return output; }
	if (Array.isArray(value)) {
		value.forEach((item, index) => { leaves(item, `${prefix}[${index}]`, output); });
		return output;
	}
	if (!value || typeof value !== "object") throw new Error(`Valor não textual em ${prefix}`);
	for (const [key, item] of Object.entries(value)) leaves(item, prefix ? `${prefix}.${key}` : key, output);
	return output;
}

function placeholders(text) {
	return [...text.matchAll(placeholderPattern)].map((match) => match[1]).sort().join(",");
}

function validMeta(meta, folder) {
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error(`${folder}: meta.json inválido`);
	if (typeof meta.code !== "string" || meta.code !== folder || Intl.getCanonicalLocales(meta.code)[0] !== meta.code)
		throw new Error(`${folder}: code deve coincidir com a pasta e usar BCP 47 canônico`);
	for (const key of ["name", "nativeName"])
		if (typeof meta[key] !== "string" || !meta[key].trim()) throw new Error(`${folder}: ${key} inválido`);
	if (!directions.has(meta.direction) || !statuses.has(meta.status) || meta.version !== 1)
		throw new Error(`${folder}: direction, status ou version inválidos`);
	if (meta.retained !== undefined && (!meta.retained || typeof meta.retained !== "object" || Array.isArray(meta.retained)))
		throw new Error(`${folder}: retained inválido`);
	return meta;
}

export function inspectLocales(root = defaultRoot, { checkSources = true } = {}) {
	if (checkSources && root === defaultRoot) syncSourceCatalogs(true);
	const localeDir = path.join(root, "locales");
	const baseDir = path.join(localeDir, "pt-BR");
	const namespaces = fs.readdirSync(baseDir).filter((name) => name.endsWith(".json") && name !== "meta.json").map((name) => path.basename(name, ".json")).sort();
	if (!namespaces.length) throw new Error("pt-BR sem namespaces");
	const base = Object.fromEntries(namespaces.map((namespace) => [namespace, leaves(readJson(path.join(baseDir, `${namespace}.json`)))]));
	const folders = fs.readdirSync(localeDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
	const seen = new Set();
	const errors = [];
	const report = [];
	for (const folder of folders) {
		try {
			const dir = path.join(localeDir, folder);
			const meta = validMeta(readJson(path.join(dir, "meta.json")), folder);
			const folded = meta.code.toLowerCase();
			if (seen.has(folded)) throw new Error(`Código duplicado: ${meta.code}`);
			seen.add(folded);
			const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "meta.json");
			for (const file of files)
				if (!namespaces.includes(path.basename(file, ".json"))) errors.push(`${folder}: namespace desconhecido: ${file}`);
			const summary = { code: meta.code, status: meta.status, namespaces: {}, total: 0, translated: 0, retained: 0, pending: 0 };
			const usedRetained = new Set();
			for (const namespace of namespaces) {
				const file = path.join(dir, `${namespace}.json`);
				const source = base[namespace];
				const current = fs.existsSync(file) ? leaves(readJson(file)) : new Map();
				const plurals = new Set([...source.keys()].filter((key) => pluralSuffix.test(key)).map((key) => key.replace(pluralSuffix, "")));
				const categories = new Intl.PluralRules(meta.code).resolvedOptions().pluralCategories;
				const required = new Map([...source].filter(([key]) => !pluralSuffix.test(key)));
				for (const stem of plurals) for (const category of categories)
					required.set(`${stem}_${category}`, source.get(`${stem}_${category}`) ?? source.get(`${stem}_other`) ?? "");
				let translated = 0;
				let retained = 0;
				let pending = 0;
				const pendingDetails = [];
				for (const key of current.keys())
					if (!source.has(key) && !(pluralSuffix.test(key) && plurals.has(key.replace(pluralSuffix, "")))) errors.push(`${folder}/${namespace}: chave extra: ${key}`);
				for (const [key, reference] of required) {
					const value = current.get(key);
					if (typeof value !== "string" || !value.trim()) { pending++; pendingDetails.push(`${key}: ausente ou vazio`); continue; }
					if (placeholders(value) !== placeholders(reference)) errors.push(`${folder}/${namespace}: parâmetros divergentes: ${key}`);
					if (folder !== "pt-BR" && value === reference) {
						if (meta.retained?.[`${namespace}:${key}`]) { retained++; usedRetained.add(`${namespace}:${key}`); }
						else { pending++; pendingDetails.push(`${key}: igual ao português sem justificativa (${JSON.stringify(reference)})`); }
					} else translated++;
				}
				summary.namespaces[namespace] = { translated, retained, total: required.size, pending, pendingDetails, coverage: required.size ? Math.round(100 * (translated + retained) / required.size) : 100 };
				summary.total += required.size;
				summary.translated += translated;
				summary.retained += retained;
				summary.pending += pending;
				if (meta.status === "published" && pending) errors.push(`${folder}/${namespace}: ${pending} textos obrigatórios pendentes`);
			}
			for (const [key, reason] of Object.entries(meta.retained ?? {}))
				if (typeof reason !== "string" || !reason.trim() || !usedRetained.has(key)) errors.push(`${folder}: justificativa retained inválida ou desnecessária: ${key}`);
			report.push(summary);
		} catch (error) { errors.push(`${folder}: ${error.message}`); }
	}
	if (!report.some((entry) => entry.code === "pt-BR" && entry.status === "published")) errors.push("pt-BR precisa estar publicado");
	return { namespaces, report, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
	try {
		const result = inspectLocales();
		for (const locale of result.report) {
			console.log(`${locale.code} (${locale.status}): ${locale.translated} traduzidos, ${locale.retained} preservados, ${locale.pending} pendentes, total ${locale.total}`);
			for (const [namespace, data] of Object.entries(locale.namespaces)) {
				console.log(`  ${namespace}: ${data.translated} traduzidos, ${data.retained} preservados, ${data.pending} pendentes / ${data.total} (${data.coverage}% concluído)`);
				if (process.argv.includes("--details")) for (const detail of data.pendingDetails) console.log(`    ${detail}`);
			}
		}
		for (const error of result.errors) console.error(`i18n: ${error}`);
		if (!process.argv.includes("--report") && result.errors.length) process.exitCode = 1;
	} catch (error) { console.error(`i18n: ${error.message}`); process.exitCode = 1; }
}
