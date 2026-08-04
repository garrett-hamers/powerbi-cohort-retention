const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const outputPath = path.join(dist, "publication-readiness.json");
const sourceIconPath = path.join(root, "assets", "icon.png");
const partnerCenterLogoPath = path.join(root, "assets", "partner-center-logo-300.png");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function toRelative(absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function readPngDimensions(bytes, relativePath) {
  if (bytes.length < 24) {
    throw new Error(`Invalid PNG (too small): ${relativePath}`);
  }
  if (!bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Invalid PNG signature: ${relativePath}`);
  }
  const chunkType = bytes.subarray(12, 16).toString("ascii");
  if (chunkType !== "IHDR") {
    throw new Error(`Invalid PNG IHDR header: ${relativePath}`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function describePng(absolutePath, { required }) {
  const relativePath = toRelative(absolutePath);
  if (!fs.existsSync(absolutePath)) {
    if (required) {
      throw new Error(`Required PNG asset is missing: ${relativePath}`);
    }
    return {
      path: relativePath,
      exists: false
    };
  }

  const bytes = fs.readFileSync(absolutePath);
  const dimensions = readPngDimensions(bytes, relativePath);
  return {
    path: relativePath,
    exists: true,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

function buildBlockers(sourceIcon, partnerCenterLogo) {
  const blockers = [];

  if (sourceIcon.width === 1 && sourceIcon.height === 1) {
    blockers.push(
      "assets/icon.png is still a 1x1 placeholder; replace it with a production icon source before submission."
    );
  }

  if (!partnerCenterLogo.exists) {
    blockers.push(
      "Missing Partner Center logo at assets/partner-center-logo-300.png (required 300x300 PNG submission asset)."
    );
    return blockers;
  }

  if (partnerCenterLogo.width !== 300 || partnerCenterLogo.height !== 300) {
    blockers.push(
      `Partner Center logo must be exactly 300x300; found ${partnerCenterLogo.width}x${partnerCenterLogo.height}.`
    );
  }

  return blockers;
}

function main() {
  const enforce = process.argv.includes("--enforce");
  const sourceIcon = describePng(sourceIconPath, { required: true });
  const partnerCenterLogo = describePng(partnerCenterLogoPath, { required: false });
  const blockers = buildBlockers(sourceIcon, partnerCenterLogo);

  const metadata = {
    status: blockers.length === 0 ? "ready-for-owner-review" : "blocked",
    sourceIcon,
    partnerCenterLogo,
    blockers
  };

  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Wrote ${toRelative(outputPath)}`);

  if (blockers.length > 0) {
    console.log("Publication readiness blockers:");
    for (const blocker of blockers) {
      console.log(`- ${blocker}`);
    }
  } else {
    console.log("Publication readiness assets passed.");
  }

  if (enforce && blockers.length > 0) {
    throw new Error("Publication readiness asset enforcement failed.");
  }
}

main();
