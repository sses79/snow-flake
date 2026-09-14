import { resolve } from "node:path";
import { generateBatch } from "./generator.ts";
import { generateMutationBatches } from "./mutations.ts";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node apps/generator/src/cli.ts [--source PATH] [--output DIR] [--mutation-output DIR]");
  process.exit(0);
}
const valueAfter = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const result = await generateBatch({
  sourcePath: resolve(valueAfter("--source", "data/school-survey-2018-19-1.csv")),
  outputDir: resolve(valueAfter("--output", "generated-data/milestone-1"))
});
const mutationBatches = await generateMutationBatches({
  baselineDataPath: result.dataPath,
  outputDir: resolve(valueAfter("--mutation-output", "generated-data/milestone-2"))
});
console.log(JSON.stringify({
  baseline: {
    dataPath: result.dataPath,
    manifestPath: result.manifestPath,
    rowCount: result.manifest.row_count,
    checksum: result.manifest.data_file_sha256
  },
  mutationBatches: mutationBatches.map(({ scenario, dataPath, manifestPath, manifest }) => ({
    scenario,
    dataPath,
    manifestPath,
    rowCount: manifest.row_count,
    distinctEventCount: manifest.distinct_event_count,
    checksum: manifest.data_file_sha256
  }))
}, null, 2));
