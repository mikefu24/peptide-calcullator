const fs = require("fs");
const path = require("path");

const outDir = "dist";
const files = [
  "index.html",
  "styles.css",
  "chemistry-data.js",
  "side-reactions-data.js",
  "impurity-data.js",
  "mechanism-animations.js",
  "app.js",
  "icon.svg",
  "README.md",
  "vercel.json",
  ".nojekyll",
];

fs.rmSync(outDir, { force: true, recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(file, path.join(outDir, file));
}

console.log(`Build complete: ${outDir}/`);

require("../build-offline.js");
