import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

type LandingManifest = {
  batch_id: string;
  schema_version: string;
  data_file: string;
  data_file_sha256: string;
  row_count: number;
  landing_key?: string;
};

export type LandingUpload = {
  batchId: string;
  schemaVersion: string;
  rowCount: number;
  dataPath: string;
  manifestPath: string;
  dataKey: string;
  manifestKey: string;
  dataSha256: string;
  manifestSha256: string;
};

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertSafeValue(name: string, value: string, pattern: RegExp): void {
  if (!pattern.test(value)) throw new Error(`Manifest ${name} is invalid`);
}

function deriveLandingKey(data: Buffer, batchId: string): string {
  const firstLine = gunzipSync(data).toString("utf8").split("\n")[0];
  if (!firstLine) throw new Error("Data file contains no events");
  const event = JSON.parse(firstLine) as {
    region?: string;
    collection?: string;
    source_updated_at?: string;
  };
  const region = event.region ?? "";
  const collection = event.collection ?? "";
  const date = event.source_updated_at?.slice(0, 10) ?? "";
  assertSafeValue("event region", region, /^[a-z0-9_-]+$/);
  assertSafeValue("event collection", collection, /^[a-z0-9_-]+$/);
  assertSafeValue("event source date", date, /^\d{4}-\d{2}-\d{2}$/);
  return `region=${region}/collection=${collection}/date=${date}/batch_id=${batchId}/submissions.ndjson.gz`;
}

export async function prepareLandingUpload(manifestPath: string): Promise<LandingUpload> {
  const manifestAbsolutePath = resolve(manifestPath);
  const manifestBytes = await readFile(manifestAbsolutePath);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as LandingManifest;
  assertSafeValue("batch_id", manifest.batch_id, /^[A-Za-z0-9_-]+$/);
  assertSafeValue("schema_version", manifest.schema_version, /^[0-9]+[.][0-9]+[.][0-9]+$/);
  assertSafeValue("data_file", manifest.data_file, /^[A-Za-z0-9_.-]+$/);
  if (basename(manifest.data_file) !== manifest.data_file) throw new Error("Manifest data_file must be a basename");
  if (!Number.isInteger(manifest.row_count) || manifest.row_count < 1) {
    throw new Error("Manifest row_count must be a positive integer");
  }

  const dataPath = resolve(dirname(manifestAbsolutePath), manifest.data_file);
  const data = await readFile(dataPath);
  const actualChecksum = sha256(data);
  if (actualChecksum !== manifest.data_file_sha256) {
    throw new Error(`Data checksum mismatch: expected ${manifest.data_file_sha256}, received ${actualChecksum}`);
  }
  const uncompressed = gunzipSync(data).toString("utf8").trimEnd();
  const physicalRowCount = uncompressed ? uncompressed.split("\n").length : 0;
  if (physicalRowCount !== manifest.row_count) {
    throw new Error(`Row-count mismatch: expected ${manifest.row_count}, received ${physicalRowCount}`);
  }
  const dataKey = manifest.landing_key ?? deriveLandingKey(data, manifest.batch_id);
  const expectedPrefix = "region=uk/collection=wellbeing_submissions/";
  if (
    !dataKey.startsWith(expectedPrefix) ||
    !dataKey.includes(`/batch_id=${manifest.batch_id}/`) ||
    !dataKey.endsWith("/submissions.ndjson.gz") ||
    dataKey.includes("..")
  ) {
    throw new Error("Manifest landing_key is outside the wellbeing landing contract");
  }

  return {
    batchId: manifest.batch_id,
    schemaVersion: manifest.schema_version,
    rowCount: manifest.row_count,
    dataPath,
    manifestPath: manifestAbsolutePath,
    dataKey,
    manifestKey: dataKey.replace(/submissions[.]ndjson[.]gz$/, "manifest.json"),
    dataSha256: actualChecksum,
    manifestSha256: sha256(manifestBytes)
  };
}
