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
	tag?: string;
	inherits?: string | string[];
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
	hotTokens: string[];
	hotCharFeatures: Record<string, Record<string, number>>;
	hotTokenFeatures: Record<string, Record<string, number>>;
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
	const planData = toml.parse(buildPlanToml) as BuildPlans;
	const buildPlans = planData.buildPlans || {};
	const plan = buildPlans[planName];
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

	/**
	 * Recursively resolves variants.inherits into merged design configs.
	 * Handles: string, array, and "buildPlans.X" references.
	 * Returns an array of resolved configs to be merged in order.
	 * Closes over varDatRaw and buildPlans from outer scope.
	 */
	function resolveInherits(
		inherits: string | string[] | undefined,
		slope?: "upright" | "italic" | "oblique",
		visited: Set<string> = new Set()
	): Record<string, string>[] {
		if (!inherits) return [];

		const names = Array.isArray(inherits) ? inherits : [inherits];
		return names.flatMap(name => {
			// Cycle detection
			if (visited.has(name)) {
				throw new Error(`Circular inherits detected: ${name} is already in the resolution chain`);
			}
			visited.add(name);
			if (name.startsWith("buildPlans.")) {
				// Resolve from private-build-plans.toml
				const refPlanName = name.slice("buildPlans.".length);
				const refPlan = buildPlans[refPlanName];
				if (!refPlan) throw new Error(`Cannot find build plan: ${refPlanName}`);

				// Recursively resolve that plan's inherits
				const bases = resolveInherits(
					refPlan.variants?.inherits,
					slope,
					visited
				);

				// Merge: bases + refPlan.variants.design + refPlan.variants[slope]
				const planDesign = refPlan.variants?.design ?? {};
				const planSlope = slope ? (refPlan.variants?.[slope] ?? {}) : {};
				return [...bases, Object.assign({}, planDesign, planSlope)];
			}

			// It's a composite name (e.g., "ss18", "slab")
			const comp = varDatRaw.composite?.[name];
			if (!comp) throw new Error(`Cannot find composite: ${name}`);

			// Recursively resolve the composite's own inherits (from variants.toml)
			const parentCfgs = resolveInherits(
				comp.inherits,
				slope,
				visited
			);

			// Merge: parents + comp.design + comp[slope]
			const compDesign = comp.design ?? {};
			const compSlope = slope ? (comp[slope] ?? {}) : {};
			return [...parentCfgs, Object.assign({}, compDesign, compSlope)];
		});
	}

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

		// 2. Resolve what inherits provides on top of Iosevka defaults
		const inherits = plan.variants?.inherits;
		const baseParts = resolveInherits(inherits, slope);
		const inheritedCfg = Object.assign({}, ...baseParts);

		// Build the base config: default + inherited
		const baseCfg = { ...defaultCfg };
		Object.assign(baseCfg, inheritedCfg);

		// 3. Build the custom config: base + plan overrides
		const customCfg = { ...baseCfg };
		if (plan.variants?.design) Object.assign(customCfg, plan.variants.design);
		const planSlope =
			slope === "italic"
				? plan.variants?.italic
				: plan.variants?.upright || plan.variants?.["upright-oblique"];
		if (planSlope) Object.assign(customCfg, planSlope);

		// 4. Diff customCfg vs defaultCfg (shows all changes from baseline Iosevka, including inherited ss18)
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

		// Separate single-char and multi-char hot items
		const singleCharHots: string[] = [];
		const multiCharTokens: string[] = [];
		const singleCharFeatures: Record<string, Record<string, number>> = {};
		const tokenFeatures: Record<string, Record<string, number>> = {};

		for (const ch of hotChars) {
			if (ch.length === 1) {
				singleCharHots.push(ch);
				if (hotCharFeatures[ch]) {
					singleCharFeatures[ch] = hotCharFeatures[ch];
				}
			} else {
				multiCharTokens.push(ch);
				if (hotCharFeatures[ch]) {
					tokenFeatures[ch] = hotCharFeatures[ch];
				}
			}
		}

		// Sort tokens by descending length for greedy matching
		multiCharTokens.sort((a, b) => b.length - a.length);

		return {
			hotChars: singleCharHots,
			hotTokens: multiCharTokens,
			hotCharFeatures: singleCharFeatures,
			hotTokenFeatures: tokenFeatures,
		};
	}

	const uprightResult = computeHotCharsSimple("upright");
	const italicResult = computeHotCharsSimple("italic");

	const hotChars = {
		upright: uprightResult.hotChars,
		italic: italicResult.hotChars,
	};

	const hotTokens = {
		upright: uprightResult.hotTokens,
		italic: italicResult.hotTokens,
	};

	const hotCharFeatures = {
		upright: uprightResult.hotCharFeatures,
		italic: italicResult.hotCharFeatures,
	};

	const hotTokenFeatures = {
		upright: uprightResult.hotTokenFeatures,
		italic: italicResult.hotTokenFeatures,
	};

	const textGrid: string[][] = [
		["ABC.DEF.GHI.JKL.MNO.PQRS.TUV.WXYZ", "abc.def.ghi.jkl.mno.pqrs.tuv.wxyz"],
		["!iIlL17|¦ ¢coO08BDQ $5SZ2zs ∂96µm", "float il1[]={1-2/3.4,5+6=7/8%90};"],
		["1234567890 ,._-+= >< «¯-¬_» ~–÷+×", "{*}[]()<>`+-=$/#_%^@\\&|~?'\" !,.;:"],
		["g9q¶ Þẞðþſß ΓΔΛαβγδηθικλμνξπτυφχψ", "ЖЗКНРУЭЯавжзклмнруфчьыэя <= != =="],
	];

	// Derive baseFeatures from resolved inherits
	const baseFeatures: Record<string, number> = {};
	const inherits = plan.variants?.inherits;
	const inheritNames = Array.isArray(inherits) ? inherits : inherits ? [inherits] : [];
	for (const name of inheritNames) {
		if (name.startsWith("buildPlans.")) continue; // Build plan refs don't have ssNN tags
		const comp = varDatRaw.composite?.[name];
		if (comp?.tag) {
			baseFeatures[comp.tag] = 1; // e.g., { ss18: 1 } or { ss18: 1, cv99: 1 }
		}
	}
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
		hotTokenFeatures,
		features: {
			...baseFeatures,
			...overrideFeatures,
		},
		hotChars,
		hotTokens,
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
