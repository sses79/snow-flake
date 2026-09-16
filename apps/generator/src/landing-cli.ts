import { prepareLandingUpload } from "./landing.ts";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node apps/generator/src/landing-cli.ts MANIFEST_PATH");
  process.exit(1);
}

console.log(JSON.stringify(await prepareLandingUpload(manifestPath)));
