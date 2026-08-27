const fs = require("fs");
const { execFileSync } = require("child_process");

const requiredFiles = ["index.html", "styles.css", "chemistry-data.js", "side-reactions-data.js", "app.js", "acceptance.test.js"];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

execFileSync(process.execPath, ["--check", "app.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "chemistry-data.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "side-reactions-data.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "impurity-data.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "mechanism-animations.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "acceptance.test.js"], { stdio: "inherit" });

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const js = fs.readFileSync("app.js", "utf8");
const data = fs.readFileSync("chemistry-data.js", "utf8");
const sideData = fs.readFileSync("side-reactions-data.js", "utf8");

[
  '<meta name="viewport"',
  'id="seqInput"',
  'id="btnCalc"',
  'id="btnCopy"',
  'id="exampleSelect"',
  'id="kaiserPhoto"',
  'id="deltaInput"',
  'id="deltaResults"',
  'side-reactions-data.js',
  'impurity-data.js',
  'mechanism-animations.js',
].forEach((needle) => {
  if (!html.includes(needle)) {
    throw new Error(`HTML lint failed: missing ${needle}`);
  }
});

[
  "prefers-color-scheme: dark",
  '[data-theme="light"]',
  '[data-theme="dark"]',
  "@media (min-width: 720px)",
  "@media (max-width: 520px)",
].forEach((needle) => {
  if (!css.includes(needle)) {
    throw new Error(`CSS lint failed: missing ${needle}`);
  }
});

[
  "Unknown amino acid:",
  "Unknown protecting group:",
  "Missing C-terminal group",
  "Parentheses not closed",
  "Invalid sequence separator",
  "chemistryLibrary",
  "peptideTemplates",
].forEach((needle) => {
  if (!js.includes(needle) && !data.includes(needle) && !sideData.includes(needle)) {
    throw new Error(`JS lint failed: missing friendly error text ${needle}`);
  }
});

[
  "sideReactionMassDeltas",
  "Aspartimide/Glutarimide formation",
  "Pbf derivatization",
].forEach((needle) => {
  if (!sideData.includes(needle)) {
    throw new Error(`Side reaction data lint failed: missing ${needle}`);
  }
});

console.log("Lint checks passed.");
