import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { SCHEMA_VERSION } from "./generator.ts";

type AnswerValue = string | null;

type WellbeingPayload = {
  trust_id: string;
  school_id: string;
  school_classification?: string | null;
  year_group?: string | null;
  survey_period?: string | null;
  submitted_at?: string | null;
  answers?: Record<string, AnswerValue>;
  provenance?: Record<string, unknown>;
};

type WellbeingEnvelope = {
  event_id: string;
  collection: string;
  document_id: string;
  operation: "upsert" | "delete";
  source_version: number;
  source_updated_at: string;
  extracted_at: string;
  batch_id: string;
  region: string;
  schema_version: string;
  payload: WellbeingPayload;
};

type MutationBatchDefinition = {
  batchId: string;
  scenario: string;
  envelopes: WellbeingEnvelope[];
  expected: Record<string, unknown>;
};

export type GenerateMutationOptions = {
  baselineDataPath: string;
  outputDir: string;
};

export type MutationBatchResult = {
  scenario: string;
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
    expected: Record<string, unknown>;
  };
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function eventId(documentId: string, sourceVersion: number): string {
  return `evt_${sha256(`${documentId}:${sourceVersion}`).slice(0, 32)}`;
}

function addHours(timestamp: string, hours: number): string {
  return new Date(Date.parse(timestamp) + hours * 3_600_000).toISOString();
}

function cloneEnvelope(envelope: WellbeingEnvelope): WellbeingEnvelope {
  return structuredClone(envelope);
}

function withDeliveryMetadata(
  envelope: WellbeingEnvelope,
  batchId: string,
  extractedAt: string
): WellbeingEnvelope {
  return { ...envelope, batch_id: batchId, extracted_at: extractedAt };
}

async function readBaselineEnvelopes(dataPath: string): Promise<WellbeingEnvelope[]> {
  const contents = gunzipSync(await readFile(dataPath)).toString("utf8").trimEnd();
  return contents.split("\n").slice(0, 4).map((line) => JSON.parse(line) as WellbeingEnvelope);
}

async function writeBatch(
  outputDir: string,
  definition: MutationBatchDefinition
): Promise<MutationBatchResult> {
  const lines = definition.envelopes.map((envelope) => JSON.stringify(envelope));
  const compressed = gzipSync(`${lines.join("\n")}\n`, { level: 9, mtime: 0 } as Parameters<typeof gzipSync>[1]);
  const dataFile = `${definition.batchId}.ndjson.gz`;
  const manifestFile = `${definition.batchId}.manifest.json`;
  const manifest = {
    batch_id: definition.batchId,
    scenario: definition.scenario,
    schema_version: SCHEMA_VERSION,
    data_file: dataFile,
    data_file_sha256: sha256(compressed),
    row_count: lines.length,
    distinct_event_count: new Set(definition.envelopes.map(({ event_id }) => event_id)).size,
    expected: definition.expected
  };
  await writeFile(join(outputDir, dataFile), compressed);
  await writeFile(join(outputDir, manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    scenario: definition.scenario,
    dataPath: join(outputDir, dataFile),
    manifestPath: join(outputDir, manifestFile),
    manifest
  };
}

export async function generateMutationBatches(
  options: GenerateMutationOptions
): Promise<MutationBatchResult[]> {
  const [correctionBase, withdrawalBase, insertBaseA, insertBaseB] =
    await readBaselineEnvelopes(options.baselineDataPath);
  if (!correctionBase || !withdrawalBase || !insertBaseA || !insertBaseB) {
    throw new Error("Baseline batch must contain at least four events");
  }
  if (!correctionBase.payload.answers) {
    throw new Error("Correction fixture requires baseline answers");
  }

  const insertBatchId = "batch_m2_01_new_inserts";
  const newInserts = [insertBaseA, insertBaseB].map((source, index) => {
    const inserted = cloneEnvelope(source);
    inserted.document_id = `submission_${sha256(`milestone-2-new-${index + 1}`).slice(0, 32)}`;
    inserted.event_id = eventId(inserted.document_id, 1);
    inserted.source_version = 1;
    inserted.source_updated_at = addHours(source.source_updated_at, 24 * (index + 1));
    inserted.extracted_at = new Date(Date.UTC(2019, 6, 16, 9, index)).toISOString();
    inserted.batch_id = insertBatchId;
    inserted.payload.provenance = {
      scenario: "new_insert",
      generated_for_demo: true
    };
    return inserted;
  });

  const correctionBatchId = "batch_m2_02_correction_duplicate";
  const corrected = cloneEnvelope(correctionBase);
  const originalHappy = correctionBase.payload.answers.happy;
  const correctedHappy = originalHappy?.toLowerCase() === "never" ? "Every day" : "Never";
  corrected.source_version = 3;
  corrected.event_id = eventId(corrected.document_id, corrected.source_version);
  corrected.source_updated_at = addHours(correctionBase.source_updated_at, 2);
  corrected.extracted_at = new Date(Date.UTC(2019, 6, 16, 10)).toISOString();
  corrected.batch_id = correctionBatchId;
  corrected.payload.answers = { ...corrected.payload.answers, happy: correctedHappy };
  corrected.payload.provenance = {
    scenario: "corrected_submission",
    generated_for_demo: true
  };

  const lateBatchId = "batch_m2_03_late_older_version";
  const lateOlder = cloneEnvelope(correctionBase);
  lateOlder.source_version = 2;
  lateOlder.event_id = eventId(lateOlder.document_id, lateOlder.source_version);
  lateOlder.source_updated_at = addHours(correctionBase.source_updated_at, 1);
  lateOlder.extracted_at = new Date(Date.UTC(2019, 6, 16, 11)).toISOString();
  lateOlder.batch_id = lateBatchId;
  lateOlder.payload.answers = {
    ...lateOlder.payload.answers,
    happy: correctedHappy === "Never" ? "Every day" : "Never"
  };
  lateOlder.payload.provenance = {
    scenario: "late_older_version",
    generated_for_demo: true
  };

  const withdrawalBatchId = "batch_m2_04_withdrawal";
  const withdrawal: WellbeingEnvelope = {
    event_id: eventId(withdrawalBase.document_id, 2),
    collection: withdrawalBase.collection,
    document_id: withdrawalBase.document_id,
    operation: "delete",
    source_version: 2,
    source_updated_at: addHours(withdrawalBase.source_updated_at, 2),
    extracted_at: new Date(Date.UTC(2019, 6, 16, 12)).toISOString(),
    batch_id: withdrawalBatchId,
    region: withdrawalBase.region,
    schema_version: SCHEMA_VERSION,
    payload: {
      trust_id: withdrawalBase.payload.trust_id,
      school_id: withdrawalBase.payload.school_id,
      provenance: {
        scenario: "withdrawal",
        generated_for_demo: true
      }
    }
  };

  const replayBatchId = "batch_m2_replay_late_older";
  const replay = withDeliveryMetadata(
    lateOlder,
    replayBatchId,
    new Date(Date.UTC(2019, 6, 16, 13)).toISOString()
  );

  const definitions: MutationBatchDefinition[] = [
    {
      batchId: insertBatchId,
      scenario: "new_inserts",
      envelopes: newInserts,
      expected: { new_document_count: 2 }
    },
    {
      batchId: correctionBatchId,
      scenario: "correction_plus_exact_duplicate",
      envelopes: [corrected, cloneEnvelope(corrected)],
      expected: {
        document_id: corrected.document_id,
        winning_source_version: 3,
        corrected_question: "happy",
        corrected_answer: correctedHappy
      }
    },
    {
      batchId: lateBatchId,
      scenario: "late_older_version",
      envelopes: [lateOlder],
      expected: {
        document_id: lateOlder.document_id,
        late_source_version: 2,
        winning_source_version: 3
      }
    },
    {
      batchId: withdrawalBatchId,
      scenario: "withdrawal_tombstone",
      envelopes: [withdrawal],
      expected: {
        document_id: withdrawal.document_id,
        winning_operation: "delete"
      }
    },
    {
      batchId: replayBatchId,
      scenario: "same_business_event_new_delivery",
      envelopes: [replay],
      expected: {
        replayed_event_id: replay.event_id,
        original_data_file: basename(`${lateBatchId}.ndjson.gz`)
      }
    }
  ];

  await mkdir(options.outputDir, { recursive: true });
  return Promise.all(definitions.map((definition) => writeBatch(options.outputDir, definition)));
}
