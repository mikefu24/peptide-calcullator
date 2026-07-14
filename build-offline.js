/* ============================================================================
   build-offline.js
   由多文件版生成「离线单文件版」：内联 CSS + 全部 JS + 数据。
   运行 Run:  node build-offline.js
   输出 Output:  dist/保护肽分子量计算器-离线版.html
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const scripts = ["chemistry-data.js", "side-reactions-data.js", "impurity-data.js", "mechanism-animations.js", "app.js"];
let html = read("index.html");
const css = read("styles.css");

// NOTE: use function replacements so `$` sequences in CSS/JS (e.g. `$$`, `$&`,
// `` $` ``) are NOT interpreted as String.replace special patterns.
html = html.replace('<link rel="stylesheet" href="./styles.css" />', () => `<style>\n${css}\n</style>`);
for (const s of scripts) {
  const tag = `<script src="./${s}"></script>`;
  if (!html.includes(tag)) throw new Error(`missing script tag: ${tag}`);
  const js = read(s).replace(/<\/script>/g, "<\\/script>");
  html = html.replace(tag, () => `<script>\n${js}\n</script>`);
}

// inline the favicon (icon.svg) as a data URI so the offline file is self-contained
const iconData = "data:image/svg+xml," + encodeURIComponent(read("icon.svg"));
html = html.replace(/href="\.\/icon\.svg"/g, () => `href="${iconData}"`);

const banner = `<!-- ====================================================================
     保护肽分子量计算器 · 离线单文件版 (Offline single-file build)
     双击本文件即可在任意现代浏览器离线打开，无需联网、无需服务器、无需安装。
     由 build-offline.js 自动生成，请勿手动编辑；如需修改请改多文件版后重新构建。
     副产物数据来源: Side Reactions in Peptide Synthesis (Yang, Y., Academic Press, 2016), Appendix I.
==================================================================== -->\n`;
html = html.replace("<!doctype html>", `<!doctype html>\n${banner}`);

const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "保护肽分子量计算器-离线版.html");
fs.writeFileSync(out, html);
const leftovers = [...html.matchAll(/(?:src|href)="(\.\/[^"]+|[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
console.log(`✅ wrote dist/保护肽分子量计算器-离线版.html  (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);
console.log(leftovers.length ? `⚠ local refs left: ${leftovers.join(", ")}` : "✅ fully self-contained (no local refs)");
