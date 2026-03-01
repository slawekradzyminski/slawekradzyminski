import { readFile, writeFile } from "node:fs/promises";

const FEED_URL = "https://www.awesome-testing.com/feed.xml";
const README_PATH = "README.md";
const START = "<!-- BLOG-POST-LIST:START -->";
const END = "<!-- BLOG-POST-LIST:END -->";
const MAX_POSTS = 10;

function getTagValue(block, tag) {
  const cdata = block.match(
    new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, "s"),
  );
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}>(.*?)<\\/${tag}>`, "s"));
  return plain ? plain[1].trim() : "";
}

function formatDate(pubDate) {
  const d = new Date(pubDate);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function buildTable(items) {
  const header = ["| Date | Post |", "|---|---|"];
  const rows = items.map(
    (item) => `| ${item.date} | [${item.title}](${item.link}) |`,
  );
  return [...header, ...rows].join("\n");
}

async function main() {
  const xml = await fetch(FEED_URL).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch feed: ${r.status}`);
    return r.text();
  });

  const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(
    (m) => m[1],
  );

  const items = itemBlocks.slice(0, MAX_POSTS).map((block) => ({
    title: getTagValue(block, "title"),
    link: getTagValue(block, "link"),
    date: formatDate(getTagValue(block, "pubDate")),
  }));

  const table = buildTable(items);
  const readme = await readFile(README_PATH, "utf8");

  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`, "m");
  if (!pattern.test(readme)) {
    throw new Error(`README.md is missing markers:\n${START}\n${END}`);
  }

  const updated = readme.replace(pattern, `${START}\n${table}\n${END}`);
  await writeFile(README_PATH, updated, "utf8");

  console.log(`Updated ${README_PATH} with ${items.length} posts.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
