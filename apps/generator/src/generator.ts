import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readCsv } from "./csv.ts";

export const SOURCE_SHA256 = "c17d965e5b1cc6068b43250f495c0c1f3fd39e0d5818d3f801d67bd86637a82e";
export const EXPECTED_RESPONSES = 21_954;
export const EXPECTED_COLUMNS = 569;
export const SCHEMA_VERSION = "1.0.0";
export const DEMO_SEED = "school-wellbeing-demo-m1-v1";

type Question = { position: number; name: string };

export const QUESTIONS: Question[] = [
  { position: 293, name: "sad_or_upset" },
  { position: 294, name: "lonely" },
  { position: 295, name: "confident" },
  { position: 296, name: "stressed_or_anxious" },
  { position: 297, name: "happy" },
  { position: 298, name: "bad_tempered_or_angry" },
  { position: 303, name: "happiness_with_number_of_good_friends" },
  { position: 304, name: "bullying_frequency" },
  { position: 400, name: "school_belonging" },
  { position: 401, name: "school_helps_when_worried" },
  { position: 402, name: "enjoys_school" },
  { position: 403, name: "school_is_welcoming_and_caring" },
  { position: 406, name: "relationship_with_school_staff" },
  { position: 407, name: "safety_school_toilets" },
  { position: 408, name: "safety_travelling_to_from_school" },
  { position: 409, name: "safety_during_lessons" },
  { position: 410, name: "safety_outside_lessons" },
  { position: 530, name: "healthy_lifestyle_encouragement" }
];

const PERIODS = [
  { name: "2018_autumn", start: Date.UTC(2018, 9, 1) },
  { name: "2019_spring", start: Date.UTC(2019, 0, 7) },
  { name: "2019_summer", start: Date.UTC(2019, 3, 22) }
] as const;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableNumber(value: string): number {
  return Number.parseInt(sha256(`${DEMO_SEED}:${value}`).slice(0, 8), 16);
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export type GenerateOptions = { sourcePath: string; outputDir: string };

export async function generateBatch(options: GenerateOptions) {
  const source = await readFile(options.sourcePath);
  const actualChecksum = sha256(source);
  if (actualChecksum !== SOURCE_SHA256) {
    throw new Error(`Source checksum mismatch: expected ${SOURCE_SHA256}, received ${actualChecksum}`);
  }

  const rows = await readCsv(options.sourcePath);
  if (rows.length !== EXPECTED_RESPONSES + 2) {
    throw new Error(`Expected ${EXPECTED_RESPONSES + 2} physical CSV rows, received ${rows.length}`);
  }
  const [broadHeaders, itemHeaders, ...responses] = rows;
  if (broadHeaders.length !== EXPECTED_COLUMNS || itemHeaders.length !== EXPECTED_COLUMNS) {
    throw new Error(`Expected ${EXPECTED_COLUMNS} columns in both header rows`);
  }
  const invalidWidth = responses.findIndex((row) => row.length !== EXPECTED_COLUMNS);
  if (invalidWidth !== -1) throw new Error(`Response ${invalidWidth + 1} does not have ${EXPECTED_COLUMNS} columns`);
  const sourceIds = responses.map((row) => row[1].trim());
  if (sourceIds.some((id) => !id) || new Set(sourceIds).size !== EXPECTED_RESPONSES) {
    throw new Error(`Expected ${EXPECTED_RESPONSES} distinct nonblank source IDs`);
  }
  const authorities = new Set(responses.map((row) => row[3].trim()));
  if (authorities.size !== 1 || !authorities.has("Leeds")) {
    throw new Error(`Expected the single local authority Leeds, received ${[...authorities].join(", ")}`);
  }

  let activeBroadLabel: string | null = null;
  const normalizedHeaderCounts = new Map<string, number>();
  const reconstructedHeaders = broadHeaders.map((broadLabel, position) => {
    if (broadLabel.trim() && !broadLabel.startsWith("Unnamed:")) activeBroadLabel = broadLabel.trim();
    const itemLabel = itemHeaders[position].trim();
    const baseName = normalizeHeader([activeBroadLabel, itemLabel].filter(Boolean).join(" ")) || `column_${position}`;
    const occurrence = (normalizedHeaderCounts.get(baseName) ?? 0) + 1;
    normalizedHeaderCounts.set(baseName, occurrence);
    return {
      position,
      broad_label: activeBroadLabel,
      item_label: itemLabel,
      normalized_field_name: occurrence === 1 ? baseName : `${baseName}_${occurrence}`
    };
  });

  const batchId = `batch_m1_${SOURCE_SHA256.slice(0, 12)}`;
  let minTimestamp = "";
  let maxTimestamp = "";
  const lines = responses.map((row, index) => {
    const sourceId = row[1].trim();
    const assignment = stableNumber(`school:${sourceId}`) % 4;
    const schoolNumber = assignment + 1;
    const trustId = assignment < 2 ? "trust_north" : "trust_south";
    const schoolId = `school_${String(schoolNumber).padStart(3, "0")}`;
    const period = PERIODS[stableNumber(`period:${sourceId}`) % PERIODS.length];
    const minuteOffset = stableNumber(`time:${sourceId}`) % (70 * 24 * 60);
    const submittedAt = new Date(period.start + minuteOffset * 60_000).toISOString();
    const sourceUpdatedAt = new Date(Date.parse(submittedAt) + 3_600_000).toISOString();
    const extractedAt = new Date(Date.UTC(2019, 6, 15, 12, 0, 0) + index).toISOString();
    minTimestamp = !minTimestamp || sourceUpdatedAt < minTimestamp ? sourceUpdatedAt : minTimestamp;
    maxTimestamp = !maxTimestamp || sourceUpdatedAt > maxTimestamp ? sourceUpdatedAt : maxTimestamp;
    const documentHash = sha256(`${SOURCE_SHA256}:${sourceId}`).slice(0, 32);
    const documentId = `submission_${documentHash}`;
    const answers = Object.fromEntries(
      QUESTIONS.map(({ position, name }) => [name, row[position].trim() || null])
    );
    const envelope = {
      event_id: `evt_${sha256(`${documentId}:1`).slice(0, 32)}`,
      collection: "wellbeing_submissions",
      document_id: documentId,
      operation: "upsert",
      source_version: 1,
      source_updated_at: sourceUpdatedAt,
      extracted_at: extractedAt,
      batch_id: batchId,
      region: "uk",
      schema_version: SCHEMA_VERSION,
      payload: {
        trust_id: trustId,
        school_id: schoolId,
        school_classification: row[2].trim() || null,
        year_group: normalizeHeader(row[4]) || null,
        survey_period: period.name,
        submitted_at: submittedAt,
        answers,
        provenance: {
          source_row_number: index + 3,
          source_file_sha256: SOURCE_SHA256,
          trust_id: "generated_for_demo",
          school_id: "generated_for_demo",
          survey_period: "generated_for_demo",
          timestamps: "generated_for_demo"
        }
      }
    };
    return JSON.stringify(envelope);
  });

  const ndjson = `${lines.join("\n")}\n`;
  const compressed = gzipSync(ndjson, { level: 9, mtime: 0 } as Parameters<typeof gzipSync>[1]);
  await mkdir(options.outputDir, { recursive: true });
  const dataFile = `${batchId}.ndjson.gz`;
  const manifestFile = `${batchId}.manifest.json`;
  await writeFile(join(options.outputDir, dataFile), compressed);
  const manifest = {
    batch_id: batchId,
    schema_version: SCHEMA_VERSION,
    generation_seed: DEMO_SEED,
    source: { file: basename(options.sourcePath), sha256: SOURCE_SHA256 },
    data_file: dataFile,
    data_file_sha256: sha256(compressed),
    row_count: lines.length,
    min_source_updated_at: minTimestamp,
    max_source_updated_at: maxTimestamp,
    data_dictionary: reconstructedHeaders,
    questions: QUESTIONS.map(({ position, name }) => ({
      ...reconstructedHeaders[position],
      normalized_name: name
    }))
  };
  await writeFile(join(options.outputDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dataPath: join(options.outputDir, dataFile), manifestPath: join(options.outputDir, manifestFile), manifest };
}
