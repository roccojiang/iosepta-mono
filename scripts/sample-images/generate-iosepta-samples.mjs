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

function featuresFromOverrides(parsed, variantsBlock, options = {}) {
	const features = {};
	const skipTags = options.skipTags instanceof Set
		? options.skipTags
		: new Set(options.skipTags ?? []);
	const addOverrides = obj => {
		if (!obj) return;
		for (const [primeKey, variantKey] of Object.entries(obj)) {
			const prime = parsed.primes.get(primeKey);
			const variant = prime?.variants.get(variantKey);
			if (!prime?.tag || variant?.rank === null || variant?.rank === undefined) {
				continue;
			}
			features[prime.tag] = variant.rank;
		}
	};
	const addInherited = compositeName => {
		if (!compositeName) return;
		const composite = parsed.composites.get(compositeName);
		const tag = composite?.tag;
		if (!tag) return;
		if (features[tag] !== undefined || skipTags.has(tag)) return;
		features[tag] = 1;
	};

	if (variantsBlock) {
		addOverrides(variantsBlock.design);
		addOverrides(variantsBlock.upright);
		addOverrides(variantsBlock["upright-oblique"]);
		addOverrides(variantsBlock.italic);

		const inherits = variantsBlock.inherits;
		if (Array.isArray(inherits)) {
			for (const name of inherits) addInherited(name);
		} else {
			addInherited(inherits);
		}
	}

	return features;
}

function computeHotCharsSimple(slope) {
	// 1. Default: [default.design] + [default.<slope>]
	const defaultCfg = { ...varDatRaw.default.design };
	const defaultSlope = slope === "italic" ? varDatRaw.default.italic : varDatRaw.default.upright;
	if (defaultSlope) Object.assign(defaultCfg, defaultSlope);

	// 2. Custom: ss18 base + build plan overrides
	const ss18 = varDatRaw.composite.ss18;
	const customCfg = { ...ss18.design };
	const ss18Slope = slope === "italic" ? ss18.italic : (ss18.upright || ss18["upright-oblique"]);
	if (ss18Slope) Object.assign(customCfg, ss18Slope);
	const planDesign = plan.variants.design;
	if (planDesign) Object.assign(customCfg, planDesign);
	const planSlope = slope === "italic" ? plan.variants.italic : (plan.variants.upright || plan.variants["upright-oblique"]);
	if (planSlope) Object.assign(customCfg, planSlope);

	// 3. Diff
	const hotChars = [];
	const hotCharFeatures = {};
	for (const [primeKey, variantKey] of Object.entries(customCfg)) {
		if (defaultCfg[primeKey] === variantKey) continue;
		const prime = parsed.primes.get(primeKey);
		if (!prime || prime.isSpecial) continue;
		const chars = prime.hotChars
			? [...prime.hotChars]
			: / /.test(prime.sampler || "")
				? prime.sampler.split(" ")
				: [...(prime.sampler || "")];
		const variant = prime.variants.get(variantKey);
		for (const ch of chars) {
			hotChars.push(ch);
			if (prime.tag && variant?.rank != null) {
				hotCharFeatures[ch] = { [prime.tag]: variant.rank };
			}
		}
	}
	return { hotChars, hotCharFeatures };
}

const uprightResult = computeHotCharsSimple("upright");
const italicResult = computeHotCharsSimple("italic");

const hotChars = {
	upright: uprightResult.hotChars,
	italic: italicResult.hotChars,
};

const hotCharFeatures = {
	upright: uprightResult.hotCharFeatures,
	italic: italicResult.hotCharFeatures,
};

const textGrid = [
	["ABC.DEF.GHI.JKL.MNO.PQRS.TUV.WXYZ", "abc.def.ghi.jkl.mno.pqrs.tuv.wxyz"],
	["!iIlL17|¦ ¢coO08BDQ $5SZ2zs ∂96µm", "float il1[]={1-2/3.4,5+6=7/8%90};"],
	["1234567890 ,._-+= >< «¯-¬_» ~–÷+×", "{*}[]()<>`+-=$/#_%^@\\&|~?'\" !,.;:"],
	["g9q¶ Þẞðþſß ΓΔΛαβγδηθικλμνξπτυφχψ", "ЖЗКНРУЭЯавжзклмнруфчьыэя <= != =="],
];

const baseFeatures = {
	ss18: 1,
};
const overrideFeatures = featuresFromOverrides(parsed, plan.variants, {
	skipTags: new Set(Object.keys(baseFeatures)),
});

const config = {
	width: 1200,
	height: 200,
	fontSize: 24,
	lineHeight: 1.25,
	textGrid,
	baseFeatures,
	hotCharFeatures,
	features: {
		...baseFeatures,
		...overrideFeatures,
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
