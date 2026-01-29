#!/usr/bin/env node
// Generates iosepta-samples.json by diffing Iosepta Mono variants against base Iosevka defaults.
// Uses Iosevka's variant parser to compute hot characters and feature overrides.

import fs from "fs";
import path from "path";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

const { values: args } = parseArgs({
	options: {
		"iosevka-dir": { type: "string" },
		"plan-file": { type: "string" },
		"plan-name": { type: "string" },
		"out-dir": { type: "string" },
	},
});

const iosevkaDir = args["iosevka-dir"];
const planFile = args["plan-file"];
const planName = args["plan-name"];
const outDir = args["out-dir"];

if (!iosevkaDir || !planFile || !planName || !outDir) {
	console.error(
		"Usage: generate-iosepta-samples.mjs --iosevka-dir=<path> --plan-file=<toml> --plan-name=<name> --out-dir=<path>",
	);
	process.exit(1);
}

// Resolve dependencies from the Iosevka directory
const iosevkaRequire = createRequire(
	path.join(path.resolve(iosevkaDir), "package.json"),
);
const toml = iosevkaRequire("@iarna/toml");
const VariantDataParser = await import(
	pathToFileURL(
		path.join(path.resolve(iosevkaDir), "packages", "param", "src", "variant.mjs"),
	).href
);

// Load Iosevka variant data
const variantsToml = fs.readFileSync(
	path.join(iosevkaDir, "params", "variants.toml"),
	"utf8",
);
const varDatRaw = toml.parse(variantsToml);

// Load build plan
const buildPlanToml = fs.readFileSync(planFile, "utf8");
const buildPlan = toml.parse(buildPlanToml);
const plan = buildPlan.buildPlans[planName];
if (!plan) {
	console.error(`Build plan "${planName}" not found`);
	process.exit(1);
}

// Parse with build plan composites
const parsed = VariantDataParser.parse(varDatRaw, {
	variantCompositesFromBuildPlan: {
		[planName]: plan.variants,
	},
});

// Mock para objects for slope resolution
const mockPara = {
	upright: {},
	italic: { isItalic: true },
};

function collectHotChars(variants, para, ...composites) {
	const hot = new Map();
	for (const composite of composites) {
		if (!composite) continue;
		for (const [prime, variant] of composite.decompose(para, variants.selectorTree)) {
			if (!prime.sampler && !prime.hotChars) continue;
			const key = `${prime.key}#${variant.key}`;
			const chars = prime.hotChars
				? [...prime.hotChars]
				: / /.test(prime.sampler || "")
					? prime.sampler.split(" ")
					: [...prime.sampler];
			for (const ch of chars) hot.set(ch, key);
		}
	}
	return hot;
}

function diffHotChars(defaultHot, customHot) {
	const out = new Set();
	for (const [ch, key] of customHot) {
		if (defaultHot.get(ch) !== key) out.add(ch);
	}
	return Array.from(out);
}

function featuresFromOverrides(variantsBlock) {
	const features = {};
	const addOverrides = obj => {
		if (!obj) return;
		for (const [primeKey, variantKey] of Object.entries(obj)) {
			const prime = parsed.primes.get(primeKey);
			const variant = prime?.variants.get(variantKey);
			if (!prime?.tag || !variant?.rank) continue;
			features[prime.tag] = variant.rank;
		}
	};
	addOverrides(variantsBlock.design);
	addOverrides(variantsBlock.upright);
	addOverrides(variantsBlock.italic);
	return features;
}

const defaultComp = parsed.defaultComposite;
const customComp = parsed.composites.get(`buildPlans.${planName}`);
if (!customComp) {
	console.error(`Composite buildPlans.${planName} not found`);
	process.exit(1);
}

const defaultUprightHot = collectHotChars(parsed, mockPara.upright, defaultComp);
const customUprightHot = collectHotChars(parsed, mockPara.upright, defaultComp, customComp);
const defaultItalicHot = collectHotChars(parsed, mockPara.italic, defaultComp);
const customItalicHot = collectHotChars(parsed, mockPara.italic, defaultComp, customComp);

const hotChars = {
	upright: diffHotChars(defaultUprightHot, customUprightHot),
	italic: diffHotChars(defaultItalicHot, customItalicHot),
};

const textGrid = [
	["ABC.DEF.GHI.JKL.MNO.PQRS.TUV.WXYZ", "abc.def.ghi.jkl.mno.pqrs.tuv.wxyz"],
	["!iIlL17|¦ ¢coO08BDQ $5SZ2zs ∂96µm", "float il1[]={1-2/3.4,5+6=7/8%90};"],
	["1234567890 ,._-+= >< «¯-¬_» ~–÷+×", "{*}[]()<>`+-=$/#_%^@\\&|~?'\" !,.;:"],
	["g9q¶ Þẞðþſß ΓΔΛαβγδηθικλμνξπτυφχψ", "ЖЗКНРУЭЯавжзклмнруфчьыэя <= != =="],
];

const config = {
	width: 600,
	height: 400,
	fontSize: 24,
	lineHeight: 1.25,
	textGrid,
	features: {
		ss18: 1,
		...featuresFromOverrides(plan.variants),
	},
	hotChars,
	themes: {
		light: { body: "#20242E", stress: "#048FBF" },
		dark: { body: "#DEE4E3", stress: "#03AEE9" },
	},
};

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "iosepta-samples.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
