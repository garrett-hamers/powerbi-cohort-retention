/**
 * Re-queries https://github.com/microsoft/json-schemas and reports drift against the
 * checked-in snapshot in scripts/fabric-schemas.js.
 *
 * Deliberately NOT part of `npm run package` or CI: the offline snapshot is what gates
 * the build, so a GitHub outage can never fail a release. Run this by hand when a new
 * Fabric schema version is needed.
 *
 * Usage: npm run schemas:verify
 */

const { PUBLISHED_SCHEMA_VERSIONS, SCHEMA_REPOSITORY } = require("./fabric-schemas");

const API = `https://api.github.com/repos/${SCHEMA_REPOSITORY}/contents`;

async function listPublishedVersions(family) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "atlyn-schema-check" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`${API}/${family}`, { headers });
  if (!response.ok) throw new Error(`${family} -> HTTP ${response.status}`);
  const entries = await response.json();
  return entries
    .filter((entry) => entry.type === "dir" && /^\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareVersions);
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

async function main() {
  let drifted = false;
  for (const [family, snapshot] of Object.entries(PUBLISHED_SCHEMA_VERSIONS)) {
    const live = await listPublishedVersions(family);
    const missing = live.filter((version) => !snapshot.includes(version));
    const stale = snapshot.filter((version) => !live.includes(version));
    if (missing.length === 0 && stale.length === 0) {
      console.log(`ok   ${family} (${live.length} versions)`);
      continue;
    }
    drifted = true;
    console.log(`DRIFT ${family}`);
    if (missing.length > 0) console.log(`      newly published: ${missing.join(" ")}`);
    if (stale.length > 0) console.log(`      snapshot lists unpublished: ${stale.join(" ")}`);
    console.log(`      live: ${live.join(" ")}`);
  }

  if (drifted) {
    console.log("\nUpdate PUBLISHED_SCHEMA_VERSIONS in scripts/fabric-schemas.js to match.");
    process.exitCode = 1;
    return;
  }
  console.log("\nSchema registry matches the published versions.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
