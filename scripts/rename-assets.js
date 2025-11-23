// scripts/rename-assets.js
import fs from "fs";
import path from "path";

const distDir = "dist";
const oldDir = path.join(distDir, "_astro");
const newDir = path.join(distDir, "static");

if (fs.existsSync(oldDir)) {
  fs.renameSync(oldDir, newDir);
  console.log(`📂 Renamed ${oldDir} → ${newDir}`);
}

let rewrittenCount = 0;
let rewrittenFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else {
      let content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("/_astro/")) {
        const updated = content.replace(/\/_astro\//g, "/static/");
        fs.writeFileSync(fullPath, updated);
        rewrittenCount++;
        rewrittenFiles.push(fullPath);
        console.log(`✏️ Rewrote references in: ${fullPath}`);
      }
    }
  }
}

walk(distDir);

if (rewrittenCount > 0) {
  console.log(`✅ Rewrite complete. Files modified: ${rewrittenCount}`);
  rewrittenFiles.forEach(f => console.log(" - " + f));
} else {
  console.log("ℹ️ No files contained '/_astro/' references.");
}