const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const outputPath = path.join(dist, "publication-readiness.json");
const sourceIconPath = path.join(root, "assets", "icon.png");
const partnerCenterLogoPath = path.join(root, "assets", "partner-center-logo-300.png");
const screenshotDirectory = path.join(root, "assets", "screenshots");
const eulaPath = path.join(root, "EULA.md");
const dossierPath = path.join(root, "docs", "partner-center-submission.md");
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Microsoft AppSource / Partner Center submission requirements.
 * https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store
 *
 * The 20x20 icon size is the Power BI visualization-pane icon requirement from
 * https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure
 * and is a different asset from the 300x300 Partner Center listing logo.
 */
const ICON_SIZE = 20;
const LOGO_SIZE = 300;
const SCREENSHOT_WIDTH = 1366;
const SCREENSHOT_HEIGHT = 768;
const SCREENSHOT_MAX_BYTES = 1024 * 1024;
const SCREENSHOT_MIN_COUNT = 1;
const SCREENSHOT_MAX_COUNT = 5;
const MINIMUM_DESCRIPTION_LENGTH = 120;

/** Partner Center listing URLs that pbiviz.json has no field for. */
const PRIVACY_POLICY_URL = "https://atlyn.io/legal/privacy";
const TERMS_URL = "https://atlyn.io/legal/terms";

/** RFC 2606 / RFC 6761 reserved names that Partner Center validation rejects. */
const RESERVED_TLDS = ["example", "invalid", "test", "localhost"];

/** Requirements only the account owner can satisfy outside this repository. */
const OWNER_ACTIONS = [
  "Open samples/atlyn-cohort-retention-sample.pbip in Power BI Desktop, confirm the visual renders and the data refreshes with no credential prompt, then File > Save As > Power BI report (.pbix) and upload that .pbix to Partner Center. The PBIP is generated and validated in this repository; the .pbix conversion cannot be done headlessly because a .pbix model is a binary Analysis Services backup image.",
  "Confirm during that Desktop step that Power BI accepts the hyphenated visual GUID. The official tooling generates GUIDs that are valid JavaScript identifiers, and this one is not; see the GUID risk section of docs/partner-center-submission.md.",
  "Create or confirm the Microsoft Partner Center account and the Power BI visual offer, configured as a FREE offer with no paid or transactable billing.",
  "Paste the privacy policy URL, support URL, and EULA into the Partner Center offer listing, and upload the logo and screenshots.",
  "Re-publish the release manifest and the Azure Blob artifact, because the packaged .pbiviz hash changed when the placeholder icon was replaced with the production icon."
];

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

function describeScreenshots() {
  if (!fs.existsSync(screenshotDirectory)) return [];
  return fs
    .readdirSync(screenshotDirectory)
    .filter((entry) => entry.toLowerCase().endsWith(".png"))
    .sort()
    .map((entry) => describePng(path.join(screenshotDirectory, entry), { required: true }));
}

function isHttpsUrl(value) {
  return typeof value === "string" && value.startsWith("https://") && value.length > 8;
}

function hasReservedTld(email) {
  if (typeof email !== "string" || !email.includes("@")) return false;
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  return RESERVED_TLDS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}

function describeSubmission(pbiviz) {
  const description = pbiviz.visual?.description ?? "";
  return {
    name: pbiviz.visual?.name ?? null,
    displayName: pbiviz.visual?.displayName ?? null,
    guid: pbiviz.visual?.guid ?? null,
    version: pbiviz.visual?.version ?? null,
    apiVersion: pbiviz.apiVersion ?? null,
    description,
    descriptionLength: description.length,
    supportUrl: pbiviz.visual?.supportUrl ?? null,
    gitHubUrl: pbiviz.visual?.gitHubUrl ?? null,
    authorName: pbiviz.author?.name ?? null,
    authorEmail: pbiviz.author?.email ?? null,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    termsUrl: TERMS_URL
  };
}

function buildSubmissionBlockers(submission) {
  const blockers = [];
  const required = [
    ["visual.name", submission.name],
    ["visual.displayName", submission.displayName],
    ["visual.guid", submission.guid],
    ["visual.description", submission.description],
    ["visual.supportUrl", submission.supportUrl],
    ["author.name", submission.authorName],
    ["author.email", submission.authorEmail]
  ];

  for (const [field, value] of required) {
    if (typeof value !== "string" || value.trim() === "") {
      blockers.push(`pbiviz.json is missing the required submission field ${field}.`);
    }
  }

  if (!/^\d+\.\d+\.\d+\.\d+$/.test(submission.version ?? "")) {
    blockers.push(`pbiviz.json version must have four numeric parts; found ${submission.version}.`);
  }
  if (submission.descriptionLength < MINIMUM_DESCRIPTION_LENGTH) {
    blockers.push(
      `pbiviz.json description must be at least ${MINIMUM_DESCRIPTION_LENGTH} characters of listing copy; found ${submission.descriptionLength}.`
    );
  }
  if (!isHttpsUrl(submission.supportUrl)) {
    blockers.push(`Support URL must start with https://; found ${submission.supportUrl}.`);
  }
  if (!isHttpsUrl(submission.privacyPolicyUrl)) {
    blockers.push(
      `Privacy policy URL must start with https://; found ${submission.privacyPolicyUrl}.`
    );
  }
  if (hasReservedTld(submission.authorEmail)) {
    blockers.push(
      `Author email ${submission.authorEmail} uses an RFC 2606 reserved domain and will fail submission.`
    );
  }

  return blockers;
}

function buildAssetBlockers(sourceIcon, partnerCenterLogo, screenshots) {
  const blockers = [];

  if (sourceIcon.width !== ICON_SIZE || sourceIcon.height !== ICON_SIZE) {
    blockers.push(
      `assets/icon.png must be exactly ${ICON_SIZE}x${ICON_SIZE}; found ${sourceIcon.width}x${sourceIcon.height}.`
    );
  }

  if (!partnerCenterLogo.exists) {
    blockers.push(
      `Missing Partner Center logo at assets/partner-center-logo-300.png (required ${LOGO_SIZE}x${LOGO_SIZE} PNG submission asset).`
    );
  } else if (partnerCenterLogo.width !== LOGO_SIZE || partnerCenterLogo.height !== LOGO_SIZE) {
    blockers.push(
      `Partner Center logo must be exactly ${LOGO_SIZE}x${LOGO_SIZE}; found ${partnerCenterLogo.width}x${partnerCenterLogo.height}.`
    );
  }

  if (screenshots.length < SCREENSHOT_MIN_COUNT || screenshots.length > SCREENSHOT_MAX_COUNT) {
    blockers.push(
      `assets/screenshots must contain ${SCREENSHOT_MIN_COUNT} to ${SCREENSHOT_MAX_COUNT} PNG screenshots; found ${screenshots.length}.`
    );
  }

  for (const screenshot of screenshots) {
    if (screenshot.width !== SCREENSHOT_WIDTH || screenshot.height !== SCREENSHOT_HEIGHT) {
      blockers.push(
        `${screenshot.path} must be exactly ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}; found ${screenshot.width}x${screenshot.height}.`
      );
    }
    if (screenshot.sizeBytes > SCREENSHOT_MAX_BYTES) {
      blockers.push(
        `${screenshot.path} is ${screenshot.sizeBytes} bytes, above the ${SCREENSHOT_MAX_BYTES}-byte AppSource limit.`
      );
    }
  }

  if (!fs.existsSync(eulaPath)) {
    blockers.push("Missing EULA.md; AppSource requires an end user license agreement.");
  }
  if (!fs.existsSync(dossierPath)) {
    blockers.push("Missing docs/partner-center-submission.md submission dossier.");
  }

  return blockers;
}

function main() {
  const enforce = process.argv.includes("--enforce");
  const pbiviz = JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8"));
  const submission = describeSubmission(pbiviz);
  const sourceIcon = describePng(sourceIconPath, { required: true });
  const partnerCenterLogo = describePng(partnerCenterLogoPath, { required: false });
  const screenshots = describeScreenshots();
  const blockers = [
    ...buildSubmissionBlockers(submission),
    ...buildAssetBlockers(sourceIcon, partnerCenterLogo, screenshots)
  ];

  const metadata = {
    status: blockers.length === 0 ? "ready-for-owner-review" : "blocked",
    submission,
    sourceIcon,
    partnerCenterLogo,
    screenshots,
    eula: { path: toRelative(eulaPath), exists: fs.existsSync(eulaPath) },
    dossier: { path: toRelative(dossierPath), exists: fs.existsSync(dossierPath) },
    blockers,
    ownerActions: OWNER_ACTIONS
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
    console.log("Remaining owner-controlled actions (outside this repository):");
    for (const action of OWNER_ACTIONS) {
      console.log(`- ${action}`);
    }
  }

  if (enforce && blockers.length > 0) {
    throw new Error("Publication readiness asset enforcement failed.");
  }
}

main();
