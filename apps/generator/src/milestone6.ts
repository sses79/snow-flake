import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { SCHEMA_VERSION } from "./generator.ts";
import type { WellbeingEnvelope } from "./mutations.ts";

type ExtendedEnvelope = WellbeingEnvelope & {
  producer_metadata: {
    contract_revision: string;
    optional_field_added_for: string;
  };
};

export type Milestone6Fixture = {
  scenario: "optional_schema_change" | "rejected_file";
  dataPath: string;
  manifestPath: string;
  manifest: {
    batch_id: string;
    scenario: string;
    schema_version: string;
    data_file: string;
    data_file_sha256: string;
    row_count: number;
    distinct_event_count: number;
    landing_key: string;
    expected: Record<string, unknown>;
  };
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeFixture(
  outputDir: string,
  scenario: Milestone6Fixture["scenario"],
  batchId: string,
  contents: Buffer,
  expected: Record<string, unknown>,
  landingDate = "2019-07-17"
): Promise<Milestone6Fixture> {
  const dataFile = `${batchId}.ndjson.gz`;
  const manifestFile = `${batchId}.manifest.json`;
  const landingKey = [
    "region=uk",
    "collection=wellbeing_submissions",
    `date=${landingDate}`,
    `batch_id=${batchId}`,
    "submissions.ndjson.gz"
  ].join("/");
  const manifest = {
    batch_id: batchId,
    scenario,
    schema_version: SCHEMA_VERSION,
    data_file: dataFile,
    data_file_sha256: sha256(contents),
    row_count: 1,
    distinct_event_count: scenario === "optional_schema_change" ? 1 : 0,
    landing_key: landingKey,
    expected
  };
  await writeFile(join(outputDir, dataFile), contents);
  await writeFile(join(outputDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    scenario,
    dataPath: join(outputDir, dataFile),
    manifestPath: join(outputDir, manifestFile),
    manifest
  };
}

export async function generateMilestone6Fixtures(options: {
  baselineDataPath: string;
  outputDir: string;
}): Promise<Milestone6Fixture[]> {
  const baselineContents = gunzipSync(await readFile(options.baselineDataPath)).toString("utf8").trimEnd();
  const firstLine = baselineContents.split("\n")[0];
  if (!firstLine) throw new Error("Baseline batch must contain at least one event");

  const baseline = JSON.parse(firstLine) as WellbeingEnvelope;
  const batchId = "batch_m6_01_schema_drift";
  const extended: ExtendedEnvelope = {
    ...structuredClone(baseline),
    batch_id: batchId,
    extracted_at: "2019-07-17T09:00:00.000Z",
    producer_metadata: {
      contract_revision: "1.1",
      optional_field_added_for: "milestone_6_schema_drift_exercise"
    }
  };
  const validContents = gzipSync(`${JSON.stringify(extended)}\n`, {
    level: 9,
    mtime: 0
  } as Parameters<typeof gzipSync>[1]);
  const rejectedContents = gzipSync('{"event_id":"intentionally_incomplete"\n', {
    level: 9,
    mtime: 0
  } as Parameters<typeof gzipSync>[1]);

  await mkdir(options.outputDir, { recursive: true });
  return Promise.all([
    writeFixture(options.outputDir, "optional_schema_change", batchId, validContents, {
      replayed_event_id: extended.event_id,
      raw_rows: 1,
      logical_event_count_change: 0,
      producer_contract_revision: "1.1"
    }),
    writeFixture(
      options.outputDir,
      "rejected_file",
      "batch_m6_02_rejected_file",
      rejectedContents,
      { copy_history_status: "Load failed", raw_rows: 0 }
    )
  ]);
}

export async function generateMilestone6LiveFixture(options: {
  baselineDataPath: string;
  outputDir: string;
  now?: Date;
}): Promise<Milestone6Fixture> {
  const baselineContents = gunzipSync(await readFile(options.baselineDataPath)).toString("utf8").trimEnd();
  const firstLine = baselineContents.split("\n")[0];
  if (!firstLine) throw new Error("Baseline batch must contain at least one event");

  const baseline = JSON.parse(firstLine) as WellbeingEnvelope;
  const now = options.now ?? new Date();
  const timestamp = now.toISOString();
  const batchId = `batch_m6_live_${timestamp.replace(/[-:.]/g, "")}`;
  const extended: ExtendedEnvelope = {
    ...structuredClone(baseline),
    batch_id: batchId,
    extracted_at: timestamp,
    producer_metadata: {
      contract_revision: "1.1",
      optional_field_added_for: "milestone_6_live_auto_ingest"
    }
  };
  const contents = gzipSync(`${JSON.stringify(extended)}\n`, {
    level: 9,
    mtime: 0
  } as Parameters<typeof gzipSync>[1]);
  await mkdir(options.outputDir, { recursive: true });
  return writeFixture(
    options.outputDir,
    "optional_schema_change",
    batchId,
    contents,
    {
      replayed_event_id: extended.event_id,
      raw_rows: 1,
      logical_event_count_change: 0,
      producer_contract_revision: "1.1"
    },
    timestamp.slice(0, 10)
  );
}
