import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { EXPECTED_RESPONSES, generateBatch } from "../src/generator.ts";
import { generateMutationBatches } from "../src/mutations.ts";
import { generateMilestone6Fixtures, generateMilestone6LiveFixture } from "../src/milestone6.ts";
import { prepareLandingUpload } from "../src/landing.ts";

const sourcePath = "data/school-survey-2018-19-1.csv";

test("generates a reconciled, deterministic Milestone 1 batch", async () => {
  const first = await generateBatch({ sourcePath, outputDir: await mkdtemp(join(tmpdir(), "wellbeing-a-")) });
  const second = await generateBatch({ sourcePath, outputDir: await mkdtemp(join(tmpdir(), "wellbeing-b-")) });
  assert.equal(first.manifest.row_count, EXPECTED_RESPONSES);
  assert.equal(first.manifest.data_file_sha256, second.manifest.data_file_sha256);
  assert.equal(first.manifest.data_dictionary.length, 569);
  assert.equal(first.manifest.questions[1].broad_label, "How often do you feel the following?");
  assert.match(first.manifest.questions[1].normalized_field_name, /lonely$/);

  const lines = gunzipSync(await readFile(first.dataPath)).toString("utf8").trimEnd().split("\n");
  assert.equal(lines.length, EXPECTED_RESPONSES);
  const event = JSON.parse(lines[0]);
  assert.match(event.event_id, /^evt_[a-f0-9]{32}$/);
  assert.ok(["trust_north", "trust_south"].includes(event.payload.trust_id));
  assert.equal(Object.keys(event.payload.answers).length, 18);
  assert.equal(event.payload.provenance.trust_id, "generated_for_demo");
});

async function readEvents(dataPath: string) {
  return gunzipSync(await readFile(dataPath)).toString("utf8").trimEnd().split("\n").map((line) => JSON.parse(line));
}

test("generates deterministic Milestone 2 mutation and replay batches", async () => {
  const baseline = await generateBatch({
    sourcePath,
    outputDir: await mkdtemp(join(tmpdir(), "wellbeing-m2-baseline-"))
  });
  const first = await generateMutationBatches({
    baselineDataPath: baseline.dataPath,
    outputDir: await mkdtemp(join(tmpdir(), "wellbeing-m2-a-"))
  });
  const second = await generateMutationBatches({
    baselineDataPath: baseline.dataPath,
    outputDir: await mkdtemp(join(tmpdir(), "wellbeing-m2-b-"))
  });

  assert.deepEqual(first.map(({ scenario }) => scenario), [
    "new_inserts",
    "correction_plus_exact_duplicate",
    "late_older_version",
    "withdrawal_tombstone",
    "same_business_event_new_delivery"
  ]);
  assert.deepEqual(
    first.map(({ manifest }) => manifest.data_file_sha256),
    second.map(({ manifest }) => manifest.data_file_sha256)
  );

  const [inserts, corrections, lateVersions, withdrawals, replays] =
    await Promise.all(first.map(({ dataPath }) => readEvents(dataPath)));
  assert.equal(inserts.length, 2);
  assert.notEqual(inserts[0].document_id, inserts[1].document_id);
  assert.equal(corrections.length, 2);
  assert.deepEqual(corrections[0], corrections[1]);
  assert.equal(corrections[0].source_version, 3);
  assert.equal(lateVersions[0].document_id, corrections[0].document_id);
  assert.equal(lateVersions[0].source_version, 2);
  assert.ok(lateVersions[0].source_updated_at < corrections[0].source_updated_at);
  assert.equal(withdrawals[0].operation, "delete");
  assert.equal(withdrawals[0].payload.answers, undefined);
  assert.equal(replays[0].event_id, lateVersions[0].event_id);
  assert.notEqual(replays[0].batch_id, lateVersions[0].batch_id);
});

test("generates deterministic Milestone 6 schema-drift and rejected-file fixtures", async () => {
  const baseline = await generateBatch({
    sourcePath,
    outputDir: await mkdtemp(join(tmpdir(), "wellbeing-m6-baseline-"))
  });
  const outputDir = await mkdtemp(join(tmpdir(), "wellbeing-m6-"));
  const fixtures = await generateMilestone6Fixtures({ baselineDataPath: baseline.dataPath, outputDir });

  assert.deepEqual(fixtures.map(({ scenario }) => scenario), ["optional_schema_change", "rejected_file"]);
  const schemaEvents = await readEvents(fixtures[0].dataPath);
  assert.equal(schemaEvents.length, 1);
  assert.equal(schemaEvents[0].producer_metadata.contract_revision, "1.1");
  assert.equal(schemaEvents[0].event_id, (await readEvents(baseline.dataPath))[0].event_id);
  const rejectedText = gunzipSync(await readFile(fixtures[1].dataPath)).toString("utf8");
  assert.throws(() => JSON.parse(rejectedText), SyntaxError);

  const upload = await prepareLandingUpload(fixtures[0].manifestPath);
  assert.equal(upload.dataSha256, fixtures[0].manifest.data_file_sha256);
  assert.equal(
    upload.dataKey,
    "region=uk/collection=wellbeing_submissions/date=2019-07-17/batch_id=batch_m6_01_schema_drift/submissions.ndjson.gz"
  );
  assert.ok(upload.manifestKey.endsWith("/manifest.json"));

  const live = await generateMilestone6LiveFixture({
    baselineDataPath: baseline.dataPath,
    outputDir,
    now: new Date("2026-09-15T20:00:00.000Z")
  });
  assert.equal(live.manifest.batch_id, "batch_m6_live_20260915T200000000Z");
  assert.ok(live.manifest.landing_key.includes("/date=2026-09-15/"));
});
