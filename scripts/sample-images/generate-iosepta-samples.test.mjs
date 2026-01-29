import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(".");
const scriptPath = path.join(
  repoRoot,
  "scripts",
  "sample-images",
  "generate-iosepta-samples.mjs",
);

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

test("includes upright-oblique overrides in generated features", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "iosepta-samples-"));
  const iosevkaDir = path.join(tempDir, "iosevka");
  const outDir = path.join(tempDir, "out");
  const planFile = path.join(tempDir, "plan.toml");
  const planName = "test-plan";

  writeFile(path.join(iosevkaDir, "package.json"), "{}\n");
  writeFile(path.join(iosevkaDir, "params", "variants.toml"), "{}\n");
  writeFile(
    path.join(iosevkaDir, "node_modules", "@iarna", "toml", "index.js"),
    "module.exports = { parse: JSON.parse };\n",
  );

  writeFile(
    path.join(iosevkaDir, "packages", "param", "src", "variant.mjs"),
    [
      "export function parse(_varDatRaw, options) {",
      "  const planName = Object.keys(options?.variantCompositesFromBuildPlan ?? {})[0];",
      "  const composite = { tag: 'dummy', decompose: () => [] };",
      "  return {",
      "    primes: new Map([",
      "      ['cv01', { tag: 'cv01', variants: new Map([['alt', { rank: 2 }]]) }],",
      "    ]),",
      "    composites: new Map([",
      "      [`buildPlans.${planName}`, composite],",
      "    ]),",
      "    defaultComposite: composite,",
      "    selectorTree: {},",
      "  };",
      "}",
      "",
    ].join("\n"),
  );

  writeFile(
    planFile,
    JSON.stringify(
      {
        buildPlans: {
          [planName]: {
            variants: {
              "upright-oblique": { cv01: "alt" },
            },
          },
        },
      },
      null,
      2,
    ) + "\n",
  );

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      `--iosevka-dir=${iosevkaDir}`,
      `--plan-file=${planFile}`,
      `--plan-name=${planName}`,
      `--out-dir=${outDir}`,
    ],
    { encoding: "utf8" },
  );

  assert.equal(
    result.status,
    0,
    `expected success, got ${result.status}: ${result.stderr}`,
  );

  const outputPath = path.join(outDir, "iosepta-samples.json");
  const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(output.features.cv01, 2);
});
