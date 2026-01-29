export function featuresFromOverrides(parsed, variantsBlock, options = {}) {
	const features = {};
	const skipTags = options.skipTags instanceof Set
		? options.skipTags
		: new Set(options.skipTags ?? []);
	const addOverrides = obj => {
		if (!obj) return;
		for (const [primeKey, variantKey] of Object.entries(obj)) {
			const prime = parsed.primes.get(primeKey);
			const variant = prime?.variants.get(variantKey);
			if (!prime?.tag || variant?.rank == null) continue;
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
