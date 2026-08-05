/**
 * Guards the hashes and byte sizes the documentation records against the artifacts that
 * actually exist on disk.
 *
 * The submission dossier and the changelog quote the packaged `.pbiviz` hash, the icon,
 * logo, and screenshot hashes, and their byte sizes. Nothing verified any of it: a stale
 * value did not fail the build, it just sat there looking authoritative — and the packaged
 * hash is the number a human copies into the storefront release manifest when publishing.
 * This is the same record-it-but-never-assert-it pattern that previously let a stylesheet
 * ship empty and let sticky geometry go unmeasured.
 *
 * "Every hash in the docs must equal the current one" would be wrong: the dossier
 * deliberately lists superseded hashes so nobody republishes them, and the changelog is a
 * historical record. The rule enforced here is narrower and correct:
 *
 *   1. every SHA-256 in the scanned documents is either a live value or explicitly
 *      declared superseded — an unrecognised one is a value that went stale;
 *   2. every live value is actually recorded where it is required to be;
 *   3. no live value is also listed as superseded;
 *   4. a byte size quoted on the same line as a live hash matches that artifact;
 *   5. a hash quoted on a line that names an artifact's path is that artifact's hash.
 *
 * Pure and side-effect free so `tests/doc-hashes.test.ts` can prove it catches drift
 * without needing a build.
 */

const SHA256_PATTERN = /\b[0-9a-f]{64}\b/g;
const BYTES_PATTERN = /\b(\d{1,3}(?:,\d{3})*|\d+) bytes\b/g;
const SIZE_ROW_PATTERN = /^\s*\|\s*Size\s*\|/i;

function parseSize(text) {
  return Number.parseInt(text.replace(/,/g, ""), 10);
}

function formatSize(value) {
  return value.toLocaleString("en-US");
}

/**
 * Groups consecutive markdown table rows into blocks. A dossier table can put a value's
 * hash and its byte size on *different rows* (`| SHA-256 | … |` above `| Size | … |`), so a
 * line-scoped size check silently misses the size. Within a block that describes exactly
 * one live artifact, every size quoted anywhere in the block belongs to that artifact.
 */
function tableBlocks(lines) {
  const blocks = [];
  let current = null;
  lines.forEach((text, index) => {
    if (/^\s*\|/.test(text)) {
      if (!current) {
        current = { start: index + 1, rows: [] };
        blocks.push(current);
      }
      current.rows.push({ line: index + 1, text });
    } else {
      current = null;
    }
  });
  return blocks;
}

/**
 * @param {object} input
 * @param {Array<{path: string, text: string}>} input.documents
 * @param {Array<{label: string, sha256: string, sizeBytes: number, artifactPath?: string,
 *                requiredIn: string[]}>} input.liveValues
 * @param {Iterable<string>} input.supersededHashes
 * @returns {Array<{kind: string, file: string|null, line: number|null, message: string}>}
 */
function findRecordedValueDrift({ documents, liveValues, supersededHashes }) {
  const findings = [];
  const reported = new Set();
  const superseded = new Set(supersededHashes);
  const byHash = new Map(liveValues.map((value) => [value.sha256, value]));
  const seen = new Map(liveValues.map((value) => [value.sha256, new Set()]));

  function report(finding) {
    const key = `${finding.kind}|${finding.file}|${finding.line}|${finding.message}`;
    if (reported.has(key)) return;
    reported.add(key);
    findings.push(finding);
  }

  function checkSizes(document, line, text, live) {
    for (const size of text.match(BYTES_PATTERN) ?? []) {
      if (parseSize(size) === live.sizeBytes) continue;
      report({
        kind: "size-mismatch",
        file: document.path,
        line,
        message:
          `${document.path}:${line} quotes "${size}" for the current ${live.label}, ` +
          `but that artifact is ${formatSize(live.sizeBytes)} bytes.`
      });
    }
  }

  for (const value of liveValues) {
    if (superseded.has(value.sha256)) {
      report({
        kind: "live-value-listed-as-superseded",
        file: null,
        line: null,
        message:
          `${value.label} is the current artifact (${value.sha256}) but the documentation ` +
          "lists it among the superseded hashes that must never be published."
      });
    }
  }

  for (const document of documents) {
    const lines = document.text.split(/\r?\n/);
    lines.forEach((text, index) => {
      const lineNumber = index + 1;
      const hashes = text.match(SHA256_PATTERN) ?? [];

      for (const hash of hashes) {
        const live = byHash.get(hash);
        if (!live) {
          if (superseded.has(hash)) continue;
          report({
            kind: "unrecognised-hash",
            file: document.path,
            line: lineNumber,
            message:
              `${document.path}:${lineNumber} records SHA-256 ${hash}, which matches no current ` +
              "artifact and is not declared superseded. It is stale: update it to the current " +
              "value, or add it to the superseded list in docs/partner-center-submission.md."
          });
          continue;
        }

        seen.get(hash).add(document.path);
        checkSizes(document, lineNumber, text, live);
      }

      // A line that names an artifact and carries a hash must carry THAT artifact's hash,
      // so two live values cannot be transposed while both remain individually valid.
      for (const value of liveValues) {
        if (!value.artifactPath || !text.includes(value.artifactPath)) continue;
        for (const hash of hashes) {
          if (hash === value.sha256) continue;
          report({
            kind: "hash-attached-to-wrong-artifact",
            file: document.path,
            line: lineNumber,
            message:
              `${document.path}:${lineNumber} names ${value.artifactPath} but records ` +
              `SHA-256 ${hash}; that file hashes to ${value.sha256}.`
          });
        }
      }
    });

    for (const block of tableBlocks(lines)) {
      const present = new Set();
      for (const row of block.rows) {
        for (const hash of row.text.match(SHA256_PATTERN) ?? []) {
          if (byHash.has(hash)) present.add(hash);
        }
      }
      if (present.size !== 1) continue;
      const live = byHash.get([...present][0]);
      for (const row of block.rows) {
        // Only the row that states the artifact's own size. A block can quote other
        // measurements about the same artifact — "Packaged CSS | 5,167 bytes" sits in the
        // same table as the `.pbiviz` hash — and those are not its file size.
        if (!SIZE_ROW_PATTERN.test(row.text)) continue;
        checkSizes(document, row.line, row.text, live);
      }
    }
  }

  for (const value of liveValues) {
    for (const required of value.requiredIn) {
      if (seen.get(value.sha256).has(required)) continue;
      report({
        kind: "missing-record",
        file: required,
        line: null,
        message:
          `${required} does not record the current ${value.label} SHA-256 ${value.sha256}. ` +
          "The artifact changed and the documentation was not updated with it."
      });
    }
  }

  return findings;
}

/**
 * Reads the superseded hashes out of the dossier's own "Do not publish any earlier hash"
 * paragraph, so that list stays the single source of truth rather than being duplicated
 * into this script.
 */
function readSupersededHashes(dossier) {
  const start = dossier.indexOf("**Do not publish any earlier hash.**");
  if (start === -1) {
    throw new Error(
      "docs/partner-center-submission.md no longer declares its superseded hashes. That list is " +
        "what distinguishes a historical hash from a stale one, so the drift gate cannot run."
    );
  }
  const end = dossier.indexOf("\n\n", start);
  const paragraph = dossier.slice(start, end === -1 ? undefined : end);
  return new Set(paragraph.match(SHA256_PATTERN) ?? []);
}

module.exports = { findRecordedValueDrift, readSupersededHashes, SHA256_PATTERN };
