#!/usr/bin/env npx tsx
// Generates iosepta-samples.json by diffing Iosepta Mono variants against base Iosevka defaults.
// Uses Iosevka's variant parser to compute hot characters and feature overrides.

import fs from "fs";
import path from "path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import * as toml from "@iarna/toml";

// Types for parsed TOML structures
interface VariantsBlock {
	design?: Record<string, string>;
	upright?: Record<string, string>;
	"upright-oblique"?: Record<string, string>;
	italic?: Record<string, string>;
	inherits?: string | string[];
}

interface BuildPlan {
	variants: VariantsBlock;
}

interface BuildPlans {
	buildPlans: Record<string, BuildPlan>;
}

interface CompositeConfig {
	design?: Record<string, string>;
	upright?: Record<string, string>;
	"upright-oblique"?: Record<string, string>;
	italic?: Record<string, string>;
}

interface VariantDataRaw {
	default: VariantsBlock;
	composite: Record<string, CompositeConfig>;
	prime: Record<string, unknown>;
}

// Types for Iosevka's variant parser
interface PrimeVariant {
	key: string;
	rank: number | null;
	description?: string;
}

interface Prime {
	key: string;
	tag?: string;
	sampler?: string;
	hotChars?: string[];
	isSpecial?: boolean;
	variants: Map<string, PrimeVariant>;
}

interface Composite {
	key: string;
	tag?: string;
}

interface ParsedVariantData {
	primes: Map<string, Prime>;
	composites: Map<string, Composite>;
}

interface VariantDataParser {
	parse(
		data: VariantDataRaw,
		argv?: { variantCompositesFromBuildPlan?: Record<string, VariantsBlock> }
	): ParsedVariantData;
}



interface HotCharsResult {
	hotChars: string[];
	hotCharFeatures: Record<string, Record<string, number>>;
}

interface FeaturesOptions {
	skipTags?: Set<string> | string[];
}

async function main(): Promise<void> {
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
			"Usage: generate-config.ts --iosevka-dir=<path> --plan-file=<toml> --plan-name=<name> --out-dir=<path>",
		);
		process.exit(1);
	}

	// Import Iosevka's variant parser
	const VariantDataParser: VariantDataParser = await import(
		pathToFileURL(
			path.join(path.resolve(iosevkaDir), "packages", "param", "src", "variant.mjs"),
		).href
	);

	// Load Iosevka variant data
	const variantsToml = fs.readFileSync(
		path.join(iosevkaDir, "params", "variants.toml"),
		"utf8",
	);
	const varDatRaw = toml.parse(variantsToml) as VariantDataRaw;

	// Load build plan
	const buildPlanToml = fs.readFileSync(planFile, "utf8");
	const buildPlan = toml.parse(buildPlanToml) as BuildPlans;
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

	function featuresFromOverrides(
		parsed: ParsedVariantData,
		variantsBlock: VariantsBlock | undefined,
		options: FeaturesOptions = {}
	): Record<string, number> {
		const features: Record<string, number> = {};
		const skipTags =
			options.skipTags instanceof Set
				? options.skipTags
				: new Set(options.skipTags ?? []);

		const addOverrides = (obj: Record<string, string> | undefined): void => {
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

		const addInherited = (compositeName: string | undefined): void => {
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

	function computeHotCharsSimple(slope: "upright" | "italic"): HotCharsResult {
		// 1. Default: [default.design] + [default.<slope>]
		const defaultCfg: Record<string, string> = { ...varDatRaw.default.design };
		const defaultSlope =
			slope === "italic" ? varDatRaw.default.italic : varDatRaw.default.upright;
		if (defaultSlope) Object.assign(defaultCfg, defaultSlope);

		// 2. Custom: ss18 base + build plan overrides
		const ss18 = varDatRaw.composite.ss18;
		const customCfg: Record<string, string> = { ...ss18.design };
		const ss18Slope =
			slope === "italic" ? ss18.italic : ss18.upright || ss18["upright-oblique"];
		if (ss18Slope) Object.assign(customCfg, ss18Slope);
		const planDesign = plan.variants.design;
		if (planDesign) Object.assign(customCfg, planDesign);
		const planSlope =
			slope === "italic"
				? plan.variants.italic
				: plan.variants.upright || plan.variants["upright-oblique"];
		if (planSlope) Object.assign(customCfg, planSlope);

		// 3. Diff
		const hotChars: string[] = [];
		const hotCharFeatures: Record<string, Record<string, number>> = {};
		for (const [primeKey, variantKey] of Object.entries(customCfg)) {
			if (defaultCfg[primeKey] === variantKey) continue;
			const prime = parsed.primes.get(primeKey);
			if (!prime || prime.isSpecial) continue;
			const chars: string[] = prime.hotChars
				? [...prime.hotChars]
				: / /.test(prime.sampler || "")
					? (prime.sampler as string).split(" ")
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

	const textGrid: string[][] = [
		["ABC.DEF.GHI.JKL.MNO.PQRS.TUV.WXYZ", "abc.def.ghi.jkl.mno.pqrs.tuv.wxyz"],
		["!iIlL17|¦ ¢coO08BDQ $5SZ2zs ∂96µm", "float il1[]={1-2/3.4,5+6=7/8%90};"],
		["1234567890 ,._-+= >< «¯-¬_» ~–÷+×", "{*}[]()<>`+-=$/#_%^@\\&|~?'\" !,.;:"],
		["g9q¶ Þẞðþſß ΓΔΛαβγδηθικλμνξπτυφχψ", "ЖЗКНРУЭЯавжзклмнруфчьыэя <= != =="],
	];

	const baseFeatures: Record<string, number> = {
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
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
