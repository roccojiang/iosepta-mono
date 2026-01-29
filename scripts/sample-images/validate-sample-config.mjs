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

if (!Array.isArray(data.textGrid) || data.textGrid.length === 0) {
	errors.push("textGrid must be a non-empty array of strings");
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
if (!Array.isArray(data.features) || data.features.length === 0) {
	errors.push("features must be a non-empty array");
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
