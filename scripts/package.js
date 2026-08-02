const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const staging = path.join(root, ".package-staging");
const output = path.join(dist, "atlyn-cohort-retention.pbiviz");

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function run(command, args, options = {}) {
  childProcess.execFileSync(command, args, {
    cwd: options.cwd || root,
    stdio: "inherit"
  });
}

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });
try {
  if (process.platform === "win32") {
    run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx webpack --mode production"]);
  } else {
    run("npx", ["webpack", "--mode", "production"]);
  }
  copy(path.join(root, "pbiviz.json"), path.join(staging, "pbiviz.json"));
  copy(path.join(root, "capabilities.json"), path.join(staging, "capabilities.json"));
  copy(path.join(root, "style", "visual.less"), path.join(staging, "style", "visual.less"));
  copy(path.join(dist, "visual.js"), path.join(staging, "visual.js"));
  copy(path.join(root, "assets", "icon.png"), path.join(staging, "assets", "icon.png"));
  fs.rmSync(output, { force: true });
  if (process.platform === "win32") {
    run("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Compress-Archive -Path '${staging}\\*' -DestinationPath '${output}' -Force`
    ]);
  } else {
    run("zip", ["-qr", output, "."], { cwd: staging });
  }
  const metadata = {
    guid: JSON.parse(fs.readFileSync(path.join(root, "pbiviz.json"), "utf8")).visual.guid,
    privileges: JSON.parse(fs.readFileSync(path.join(root, "capabilities.json"), "utf8")).privileges,
    package: path.relative(root, output)
  };
  fs.writeFileSync(path.join(dist, "package-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`Created ${path.relative(root, output)}`);
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
