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
const parsed = VariantDataParser.parse(varDatRaw);

// Load build plan
const buildPlanToml = fs.readFileSync(planFile, "utf8");
const buildPlan = toml.parse(buildPlanToml);
const plan = buildPlan.buildPlans[planName];
if (!plan) {
	console.error(`Build plan "${planName}" not found`);
	process.exit(1);
}

// Mock para objects for slope resolution
const mockPara = {
	upright: {},
	italic: { isItalic: true },
};

// Build composite for a given slope using default + optional user composites
function buildComposite(para, ...composites) {
	const hotCharsMap = new Map();
	const compositionMap = new Map();
	for (const composite of composites) {
		if (!composite) continue;
		for (const [prime, variant] of composite.decompose(
			para,
			parsed.selectorTree,
		)) {
			if (!prime.sampler) continue;
			const key = prime.key + "#" + variant.key;
			for (const ch of prime.hotChars || [...(prime.sampler || "")]) {
				hotCharsMap.set(ch, key);
			}
			compositionMap.set(prime.key, variant.key);
		}
	}
	return { hotCharsMap, compositionMap };
}

// For each slope, diff user composite vs default to find hot characters
function computeHotChars(slope) {
	const para = mockPara[slope];
	const defaultResult = buildComposite(para, parsed.defaultComposite);

	// Build the user composite from the build plan's variants section
	// The Composite class expects: { inherits, design, upright, italic, ... }
	const userComposite = new UserComposite(plan.variants);
	const userResult = buildComposite(
		para,
		parsed.defaultComposite,
		userComposite,
	);

	// Hot chars are those whose resolved variant differs from default
	const hotChars = new Set();
	for (const [ch, key] of userResult.hotCharsMap) {
		if (defaultResult.hotCharsMap.get(ch) !== key) {
			hotChars.add(ch);
		}
	}
	return [...hotChars];
}

// Minimal Composite-like class that can decompose user variant config
class UserComposite {
	constructor(cfg) {
		this.inherits = cfg.inherits;
		this.design = cfg.design;
		this.upright = cfg.upright || cfg["upright-oblique"];
		this.italic = cfg.italic;
	}
	decompose(para, selTree) {
		const ans = [];
		// Resolve inherited composite first
		if (this.inherits) {
			const inherited = parsed.composites.get(this.inherits);
			if (inherited) {
				ans.push(...inherited.decompose(para, selTree));
			}
		}
		// Merge design + slope-specific overrides
		const cfg = Object.assign(
			{},
			this.design,
			para.isItalic ? this.italic : this.upright,
		);
		for (const [k, v] of Object.entries(cfg)) {
			const pv = selTree.get(k, v);
			if (pv) ans.push(pv);
			else console.warn(`Warning: cannot resolve variant ${k}=${v}`);
		}
		return ans;
	}
}

// Extract OpenType feature tags from the composites involved
function computeFeatures() {
	const tags = new Set();
	// The inherited composite (e.g. ss18) has a tag
	if (plan.variants.inherits) {
		const comp = parsed.composites.get(plan.variants.inherits);
		if (comp && comp.tag) tags.add(comp.tag);
	}
	// Individual design overrides use cv/ss tags from their primes
	const designOverrides = plan.variants.design || {};
	for (const [primeKey, variantKey] of Object.entries(designOverrides)) {
		const prime = parsed.primes.get(primeKey);
		if (prime && prime.tag) tags.add(prime.tag);
	}
	return [...tags].sort();
}

// Build text grid - representative sample text
const textGrid = [
	"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
	"abcdefghijklmnopqrstuvwxyz",
	"0123456789  !@#$%^&*()-+=",
	"{}[]|\\:;\"'<>,.?/~`_      ",
	"                          ",
	"fn main() {               ",
	"    let x: i32 = 42;      ",
	"    if x != 0 && x <= 100 {",
	"        println!(\"ok\");   ",
	"    }                      ",
	"}                          ",
];

// Layout parameters
const fontSize = 32;
const lineHeight = 1.5;
const charsPerLine = Math.max(...textGrid.map(l => l.length));
const width = Math.ceil(charsPerLine * fontSize * 0.6) + 80; // approx char width + padding
const height = Math.ceil(textGrid.length * fontSize * lineHeight) + 80;

const config = {
	width,
	height,
	fontSize,
	lineHeight,
	textGrid,
	features: computeFeatures(),
	hotChars: {
		upright: computeHotChars("upright"),
		italic: computeHotChars("italic"),
	},
	themes: {
		light: {
			background: "#ffffff",
			body: "#333333",
			stress: "#0969da",
		},
		dark: {
			background: "#0d1117",
			body: "#c9d1d9",
			stress: "#58a6ff",
		},
	},
};

fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "iosepta-samples.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`  Features: ${config.features.join(", ")}`);
console.log(`  Hot chars (upright): ${config.hotChars.upright.length}`);
console.log(`  Hot chars (italic): ${config.hotChars.italic.length}`);
