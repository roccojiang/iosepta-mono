#!/usr/bin/env node
// Validates the sample config JSON produced by generate-iosepta-samples.mjs.

import fs from "fs";

const file = process.argv[2];
if (!file) {
	console.error("Usage: validate-sample-config.mjs <config.json>");
	process.exit(1);
}

let data;
try {
	data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
	console.error(`Failed to read/parse ${file}: ${e.message}`);
	process.exit(1);
}

const errors = [];

const validateFeatureMap = (value, label, { allowEmpty = false } = {}) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		errors.push(`${label} must be an object of tag -> numeric value`);
		return;
	}
	const entries = Object.entries(value);
	if (!allowEmpty && entries.length === 0) {
		errors.push(`${label} must not be empty`);
		return;
	}
	for (const [tag, val] of entries) {
		if (typeof tag !== "string" || tag.length !== 4) {
			errors.push(`feature tag "${tag}" must be a 4-char string`);
			break;
		}
		if (typeof val !== "number" || !Number.isFinite(val)) {
			errors.push(`feature value for "${tag}" must be a number`);
			break;
		}
	}
};

const validateHotCharFeatures = (value, label) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		errors.push(`${label} must be an object with upright/italic maps`);
		return;
	}
	for (const slope of ["upright", "italic"]) {
		const map = value[slope];
		if (!map || typeof map !== "object" || Array.isArray(map)) {
			errors.push(`${label}.${slope} must be an object`);
			continue;
		}
		for (const [ch, feats] of Object.entries(map)) {
			if (typeof ch !== "string" || ch.length === 0) {
				errors.push(`${label}.${slope} contains invalid character key`);
				break;
			}
			validateFeatureMap(feats, `${label}.${slope}.${ch}`, { allowEmpty: false });
		}
	}
};

if (!Array.isArray(data.textGrid) || data.textGrid.length === 0) {
	errors.push("textGrid must be a non-empty array of [left,right] rows");
} else {
	for (const row of data.textGrid) {
		if (!Array.isArray(row) || row.length !== 2) {
			errors.push("each textGrid row must be an array of two strings");
			break;
		}
		if (row.some(cell => typeof cell !== "string")) {
			errors.push("each textGrid cell must be a string");
			break;
		}
	}
}
if (!data.hotChars || typeof data.hotChars !== "object") {
	errors.push("hotChars must be an object");
} else {
	for (const slope of ["upright", "italic"]) {
		if (!Array.isArray(data.hotChars[slope])) {
			errors.push(`hotChars.${slope} must be an array`);
		}
	}
}
if (!data.features) {
	errors.push("features must be an object of tag -> numeric value");
} else {
	validateFeatureMap(data.features, "features", { allowEmpty: false });
}

if (data.baseFeatures !== undefined) {
	validateFeatureMap(data.baseFeatures, "baseFeatures", { allowEmpty: false });
}

if (data.hotCharFeatures !== undefined) {
	validateHotCharFeatures(data.hotCharFeatures, "hotCharFeatures");
}
for (const key of ["width", "height", "fontSize", "lineHeight"]) {
	if (typeof data[key] !== "number" || data[key] <= 0) {
		errors.push(`${key} must be a positive number`);
	}
}
if (!data.themes || typeof data.themes !== "object") {
	errors.push("themes must be an object");
}

if (errors.length) {
	console.error("Validation failed:");
	for (const e of errors) console.error("  - " + e);
	process.exit(1);
}

console.log("Sample config is valid.");
