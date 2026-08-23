import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { EXPECTED_RESPONSES, generateBatch } from "../src/generator.ts";

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
