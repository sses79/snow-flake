import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { EXPECTED_RESPONSES, generateBatch } from "../src/generator.ts";
import { generateMutationBatches } from "../src/mutations.ts";

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
