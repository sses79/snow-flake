import { resolve } from "node:path";
import { generateBatch } from "./generator.ts";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node apps/generator/src/cli.ts [--source PATH] [--output DIR]");
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
console.log(JSON.stringify(result, null, 2));
