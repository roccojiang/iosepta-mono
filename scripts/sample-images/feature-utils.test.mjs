import assert from "node:assert/strict";
import test from "node:test";

import { featuresFromOverrides } from "./feature-utils.mjs";

const parsed = {
	primes: new Map([
		[
			"testprime",
			{
				tag: "cv01",
				variants: new Map([
					["rank-zero", { rank: 0 }],
					["rank-one", { rank: 1 }],
					["rank-null", { rank: null }],
				]),
			},
		],
	]),
	composites: new Map([
		["ss18", { tag: "ss18" }],
		["no-tag", {}],
	]),
};

test("featuresFromOverrides keeps rank 0 variants", () => {
	const features = featuresFromOverrides(
		parsed,
		{ design: { testprime: "rank-zero" } },
	);

	assert.equal(features.cv01, 0);
});

test("featuresFromOverrides skips null rank variants", () => {
	const features = featuresFromOverrides(
		parsed,
		{ design: { testprime: "rank-null" } },
	);

	assert.equal("cv01" in features, false);
});

test("featuresFromOverrides adds inherited composite tag", () => {
	const features = featuresFromOverrides(parsed, { inherits: "ss18" });

	assert.equal(features.ss18, 1);
});

test("featuresFromOverrides does not duplicate inherited tag", () => {
	const features = featuresFromOverrides(parsed, { inherits: "ss18" }, {
		skipTags: new Set(["ss18"]),
	});

	assert.equal("ss18" in features, false);
});
