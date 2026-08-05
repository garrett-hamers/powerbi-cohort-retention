interface LiveValue {
  label: string;
  sha256: string;
  sizeBytes: number;
  artifactPath?: string;
  requiredIn: string[];
}

interface Finding {
  kind: string;
  file: string | null;
  line: number | null;
  message: string;
}

// The scripts are plain CommonJS with no bundled types, matching how the other suites
// reach into `scripts/`; the surface used here is two functions.
const { findRecordedValueDrift, readSupersededHashes } = require("../scripts/doc-hash-gate") as {
  findRecordedValueDrift(input: {
    documents: Array<{ path: string; text: string }>;
    liveValues: LiveValue[];
    supersededHashes: Iterable<string>;
  }): Finding[];
  readSupersededHashes(dossier: string): Set<string>;
};

/**
 * The submission dossier and the changelog quote artifact hashes and byte sizes. Nothing
 * verified them until now: a stale value did not fail the build, it sat there looking
 * authoritative — and the packaged hash is the number a human copies into the storefront
 * release manifest when publishing.
 *
 * `scripts/certification-audit.js` runs this gate against real bytes inside
 * `npm run package`. These tests pin its behaviour on synthetic documents, so the negative
 * cases stay covered without needing a build, and so nobody can weaken the rule into one
 * that passes on the drift it exists to catch.
 */

const LIVE = "a".repeat(64);
const STALE = "b".repeat(64);
const SUPERSEDED = "c".repeat(64);
const SHOT_ONE = "d".repeat(64);
const SHOT_TWO = "e".repeat(64);

function packagedValue(overrides: Partial<LiveValue> = {}): LiveValue {
  return {
    label: "packaged .pbiviz",
    sha256: LIVE,
    sizeBytes: 21831,
    requiredIn: ["docs/partner-center-submission.md", "CHANGELOG.md"],
    ...overrides
  };
}

function run(
  documents: Array<{ path: string; text: string }>,
  liveValues: LiveValue[] = [packagedValue()]
): Finding[] {
  return findRecordedValueDrift({
    documents,
    liveValues,
    supersededHashes: new Set([SUPERSEDED])
  });
}

describe("recorded-value drift gate", () => {
  test("passes when every recorded value matches the artifacts", () => {
    const findings = run([
      {
        path: "docs/partner-center-submission.md",
        text: `| SHA-256 | \`${LIVE}\` |\n| Size | 21,831 bytes |\nSuperseded: \`${SUPERSEDED}\`.`
      },
      { path: "CHANGELOG.md", text: `The artifact is \`${LIVE}\` at 21,831 bytes.` }
    ]);
    expect(findings).toEqual([]);
  });

  test("catches a hash left behind after the bytes changed", () => {
    // The exact failure mode: the package was rebuilt, the docs were not touched.
    const findings = run([
      { path: "docs/partner-center-submission.md", text: `| SHA-256 | \`${STALE}\` |` },
      { path: "CHANGELOG.md", text: `The artifact is \`${STALE}\` at 21,831 bytes.` }
    ]);
    expect(findings.map((finding) => finding.kind).sort()).toEqual([
      "missing-record",
      "missing-record",
      "unrecognised-hash",
      "unrecognised-hash"
    ]);
    const stale = findings.find((finding) => finding.kind === "unrecognised-hash");
    expect(stale?.file).toBe("docs/partner-center-submission.md");
    expect(stale?.line).toBe(1);
    expect(stale?.message).toContain(STALE);
    expect(stale?.message).toContain("stale");
  });

  test("reports the file and line of each divergence", () => {
    const findings = run([
      {
        path: "docs/partner-center-submission.md",
        text: `intro\n| SHA-256 | \`${LIVE}\` |\nfiller\n| old | \`${STALE}\` |`
      },
      { path: "CHANGELOG.md", text: `\`${LIVE}\`` }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: "unrecognised-hash",
      file: "docs/partner-center-submission.md",
      line: 4
    });
  });

  test("allows hashes the dossier explicitly declares superseded", () => {
    // Historical values are the whole reason "every hash must equal the current one" is the
    // wrong rule: the dossier lists them precisely so nobody republishes them.
    const findings = run([
      { path: "docs/partner-center-submission.md", text: `\`${LIVE}\`\ndo not publish \`${SUPERSEDED}\`` },
      { path: "CHANGELOG.md", text: `\`${LIVE}\` and historically \`${SUPERSEDED}\`` }
    ]);
    expect(findings).toEqual([]);
  });

  test("catches a byte size that was not updated alongside its hash", () => {
    const findings = run([
      { path: "docs/partner-center-submission.md", text: `| \`${LIVE}\` | 20,684 bytes |` },
      { path: "CHANGELOG.md", text: `\`${LIVE}\` at 21,831 bytes` }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("size-mismatch");
    expect(findings[0].message).toContain("20,684 bytes");
    expect(findings[0].message).toContain("21,831 bytes");
  });

  test("catches a size on a different table row from its hash", () => {
    // Section 9 of the dossier is a vertical table: the hash and the byte size sit on
    // separate rows, so a line-scoped check reads clean while the size is wrong.
    const findings = run([
      {
        path: "docs/partner-center-submission.md",
        text: [
          "| Field | Value |",
          "| --- | --- |",
          `| SHA-256 | \`${LIVE}\` |`,
          "| Size | 20,684 bytes |"
        ].join("\n")
      },
      { path: "CHANGELOG.md", text: `\`${LIVE}\` at 21,831 bytes` }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "size-mismatch", line: 4 });
  });

  test("does not attribute other measurements in the same table to the artifact's size", () => {
    // Section 9 quotes both the .pbiviz size and the size of the CSS inside it. Only the
    // Size row is the artifact's own file size.
    const findings = run([
      {
        path: "docs/partner-center-submission.md",
        text: [
          "| Field | Value |",
          "| --- | --- |",
          `| SHA-256 | \`${LIVE}\` |`,
          "| Size | 21,831 bytes |",
          "| Packaged CSS | 5,167 bytes, inline as `content.css` |"
        ].join("\n")
      },
      { path: "CHANGELOG.md", text: `\`${LIVE}\` at 21,831 bytes` }
    ]);
    expect(findings).toEqual([]);
  });

  test("does not attribute one row's size to another artifact in a multi-value table", () => {
    // The screenshot table lists several artifacts in one block, so block-wide size
    // attribution would be wrong there; only the per-row pairing applies.
    const findings = run(
      [
        {
          path: "docs/partner-center-submission.md",
          text: [
            "| # | Path | Size | SHA-256 |",
            "| --- | --- | --- | --- |",
            `| 1 | assets/screenshots/01.png | 46,901 bytes | \`${SHOT_ONE}\` |`,
            `| 2 | assets/screenshots/02.png | 45,279 bytes | \`${SHOT_TWO}\` |`
          ].join("\n")
        },
        { path: "CHANGELOG.md", text: `\`${LIVE}\` at 21,831 bytes` }
      ],
      [
        packagedValue({ requiredIn: ["CHANGELOG.md"] }),
        {
          label: "screenshot 1",
          sha256: SHOT_ONE,
          sizeBytes: 46901,
          artifactPath: "assets/screenshots/01.png",
          requiredIn: ["docs/partner-center-submission.md"]
        },
        {
          label: "screenshot 2",
          sha256: SHOT_TWO,
          sizeBytes: 45279,
          artifactPath: "assets/screenshots/02.png",
          requiredIn: ["docs/partner-center-submission.md"]
        }
      ]
    );
    expect(findings).toEqual([]);
  });

  test("catches a live hash attached to the wrong artifact", () => {
    // Two screenshots transposed: both hashes are individually live and both files are
    // recorded, so only the path-to-hash pairing can catch it.
    const findings = run(
      [
        {
          path: "docs/partner-center-submission.md",
          text:
            `| 1 | assets/screenshots/01.png | 46,901 bytes | \`${SHOT_TWO}\` |\n` +
            `| 2 | assets/screenshots/02.png | 45,279 bytes | \`${SHOT_ONE}\` |`
        },
        { path: "CHANGELOG.md", text: `\`${LIVE}\` at 21,831 bytes` }
      ],
      [
        packagedValue({ requiredIn: ["CHANGELOG.md"] }),
        {
          label: "screenshot 1",
          sha256: SHOT_ONE,
          sizeBytes: 46901,
          artifactPath: "assets/screenshots/01.png",
          requiredIn: ["docs/partner-center-submission.md"]
        },
        {
          label: "screenshot 2",
          sha256: SHOT_TWO,
          sizeBytes: 45279,
          artifactPath: "assets/screenshots/02.png",
          requiredIn: ["docs/partner-center-submission.md"]
        }
      ]
    );
    expect(findings.map((finding) => finding.kind).sort()).toEqual([
      "hash-attached-to-wrong-artifact",
      "hash-attached-to-wrong-artifact",
      "size-mismatch",
      "size-mismatch"
    ]);
    expect(findings.filter((finding) => finding.kind === "hash-attached-to-wrong-artifact")).toEqual([
      expect.objectContaining({ line: 1 }),
      expect.objectContaining({ line: 2 })
    ]);
  });

  test("catches a document that never records the current value at all", () => {
    // Deleting the stale line instead of updating it must not read as a pass.
    const findings = run([
      { path: "docs/partner-center-submission.md", text: `| SHA-256 | \`${LIVE}\` |` },
      { path: "CHANGELOG.md", text: "no hash here" }
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "missing-record", file: "CHANGELOG.md" });
  });

  test("catches the current value being listed as one that must never be published", () => {
    const findings = findRecordedValueDrift({
      documents: [
        { path: "docs/partner-center-submission.md", text: `\`${LIVE}\`` },
        { path: "CHANGELOG.md", text: `\`${LIVE}\`` }
      ],
      liveValues: [packagedValue()],
      supersededHashes: new Set([LIVE])
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("live-value-listed-as-superseded");
  });
});

describe("superseded-hash registry", () => {
  test("reads the list out of the dossier so the doc stays the source of truth", () => {
    const dossier = [
      "Some prose.",
      "",
      `**Do not publish any earlier hash.** Superseded: \`${SUPERSEDED}\` (20,684 bytes) and`,
      `\`${STALE}\` (20,652 bytes).`,
      "",
      `Unrelated later paragraph mentioning \`${LIVE}\`.`
    ].join("\n");
    const hashes = readSupersededHashes(dossier);
    expect(hashes).toEqual(new Set([SUPERSEDED, STALE]));
    // The paragraph boundary matters: a later mention must not be swept in as historical.
    expect(hashes.has(LIVE)).toBe(false);
  });

  test("fails loudly if the dossier stops declaring the list", () => {
    // Silently returning an empty set would turn every historical hash into a build
    // failure, and the natural "fix" would be to weaken the gate.
    expect(() => readSupersededHashes("no such paragraph")).toThrow(/superseded hashes/i);
  });
});
