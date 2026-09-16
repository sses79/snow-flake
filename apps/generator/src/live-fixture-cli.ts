import { resolve } from "node:path";
import { generateMilestone6LiveFixture } from "./milestone6.ts";

const fixture = await generateMilestone6LiveFixture({
  baselineDataPath: resolve(process.argv[2] ?? "generated-data/milestone-1/batch_m1_c17d965e5b1c.ndjson.gz"),
  outputDir: resolve(process.argv[3] ?? "generated-data/milestone-6/live")
});

console.log(fixture.manifestPath);
