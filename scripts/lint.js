const fs = require("fs");
const { execFileSync } = require("child_process");

const requiredFiles = ["index.html", "styles.css", "app.js", "acceptance.test.js"];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

execFileSync(process.execPath, ["--check", "app.js"], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", "acceptance.test.js"], { stdio: "inherit" });

const html = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("styles.css", "utf8");
const js = fs.readFileSync("app.js", "utf8");

[
  '<meta name="viewport"',
  'id="sequenceInput"',
  'id="calculateButton"',
  'id="copyReport"',
  'id="exampleSelect"',
].forEach((needle) => {
  if (!html.includes(needle)) {
    throw new Error(`HTML lint failed: missing ${needle}`);
  }
});

[
  "prefers-color-scheme: dark",
  '[data-theme="light"]',
  '[data-theme="dark"]',
  "@media (max-width: 720px)",
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
].forEach((needle) => {
  if (!js.includes(needle)) {
    throw new Error(`JS lint failed: missing friendly error text ${needle}`);
  }
});

console.log("Lint checks passed.");
