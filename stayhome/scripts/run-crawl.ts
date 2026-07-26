import "dotenv/config";
import { runResortCrawl } from "../src/crawlers/run";
import { ResortSlug } from "../src/generated/prisma/enums";

// Manual crawl trigger for local verification. No `search` body → exercises the
// defaultSearch() path, same as the admin RefreshButton.
async function main() {
  const result = await runResortCrawl(ResortSlug.LOTTE, { triggeredBy: "MANUAL" });
  console.log("RESULT:", JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
