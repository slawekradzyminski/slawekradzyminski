import { readFile, writeFile } from "node:fs/promises";

const FEED_URL = "https://www.awesome-testing.com/feed.xml";
const README_PATH = "README.md";
const START = "<!-- BLOG-POST-LIST:START -->";
const END = "<!-- BLOG-POST-LIST:END -->";
const MAX_POSTS = 10;
const FETCH_RETRIES = 3;
const FETCH_TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFeedXml(url) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "User-Agent": "Mozilla/5.0 (compatible; FeedFetcher-GitHubActions/1.0; +https://github.com/slawekradzyminski/slawekradzyminski)",
        },
      });

      if (response.ok) {
        return response.text();
      }

      const retryable =
        response.status === 403 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;

      lastError = new Error(`Failed to fetch feed: ${response.status}`);
      if (!retryable || attempt === FETCH_RETRIES) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_RETRIES) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(attempt * 2_000);
  }

  throw lastError ?? new Error("Failed to fetch feed");
}

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
  const xml = await fetchFeedXml(FEED_URL);

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
