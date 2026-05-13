import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "llms-full.txt",
  "agents.txt",
  "manifest.webmanifest",
  ".well-known/accord.json",
  ".well-known/security.txt",
  "assets/logo.svg",
  "assets/og-card.svg"
];

const requiredHtmlSnippets = [
  "<title>Accord Protocol",
  "rel=\"canonical\" href=\"https://accordprotocol.ai/\"",
  "application/ld+json",
  "FAQPage",
  "SoftwareSourceCode",
  "og:image",
  "twitter:card",
  "href=\"/llms.txt\"",
  "href=\"/.well-known/accord.json\"",
  "NOT CERTIFIED FOR MAINNET"
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    failures.push(`Missing ${file}`);
  }
}

const htmlPath = join(root, "index.html");
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");
  for (const snippet of requiredHtmlSnippets) {
    if (!html.includes(snippet)) {
      failures.push(`index.html missing ${snippet}`);
    }
  }
}

try {
  JSON.parse(readFileSync(join(root, ".well-known/accord.json"), "utf8"));
  JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
} catch (error) {
  failures.push(`Invalid JSON: ${error.message}`);
}

if (failures.length) {
  console.error("Site check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Site check passed: SEO, agent discovery and core assets are present.");
