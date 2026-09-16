#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

manifest_path="${1:-generated-data/milestone-6/batch_m6_01_schema_drift.manifest.json}"
dry_run="${2:-}"
upload_json="$(node apps/generator/src/landing-cli.ts "${manifest_path}")"

json_value() {
  node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(String(value[process.argv[2]]))' \
    "${upload_json}" "$1"
}

batch_id="$(json_value batchId)"
schema_version="$(json_value schemaVersion)"
row_count="$(json_value rowCount)"
data_path="$(json_value dataPath)"
manifest_absolute_path="$(json_value manifestPath)"
data_key="$(json_value dataKey)"
manifest_key="$(json_value manifestKey)"
data_sha256="$(json_value dataSha256)"
manifest_sha256="$(json_value manifestSha256)"

bucket="${WELLBEING_S3_BUCKET:-}"
if [[ -z "${bucket}" && -d infra/aws/.terraform ]]; then
  terraform_bucket="$(terraform -chdir=infra/aws output -raw landing_bucket_name 2>/dev/null || true)"
  if [[ "${terraform_bucket}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
    bucket="${terraform_bucket}"
  fi
fi
if [[ -z "${bucket}" && "${dry_run}" == "--dry-run" ]]; then
  bucket="milestone-6-local-check"
fi
: "${bucket:?Set WELLBEING_S3_BUCKET or apply infra/aws first}"

aws_region="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-west-1}}"
if [[ ! "${bucket}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "WELLBEING_S3_BUCKET is not a valid bucket name." >&2
  exit 1
fi

echo "Validated ${batch_id}: ${row_count} row(s), schema ${schema_version}."
echo "Landing destination: s3://${bucket}/${data_key}"
if [[ "${dry_run}" == "--dry-run" ]]; then
  exit 0
fi

put_immutable_object() {
  local source_path="$1"
  local object_key="$2"
  local checksum="$3"
  local content_type="$4"
  local existing_metadata

  if existing_metadata="$(aws s3api head-object \
    --region "${aws_region}" \
    --bucket "${bucket}" \
    --key "${object_key}" \
    --query 'Metadata.sha256' \
    --output text 2>/dev/null)"; then
    if [[ "${existing_metadata}" == "${checksum}" ]]; then
      echo "Already present with matching checksum: s3://${bucket}/${object_key}"
      return
    fi
    echo "Refusing to overwrite immutable key with different content: s3://${bucket}/${object_key}" >&2
    exit 1
  fi

  aws s3api put-object \
    --region "${aws_region}" \
    --bucket "${bucket}" \
    --key "${object_key}" \
    --body "${source_path}" \
    --if-none-match '*' \
    --content-type "${content_type}" \
    --server-side-encryption AES256 \
    --metadata "sha256=${checksum},batch_id=${batch_id},schema_version=${schema_version},row_count=${row_count}" \
    >/dev/null
  echo "Uploaded: s3://${bucket}/${object_key}"
}

# Publish the sidecar first and the data object last. Only the .ndjson.gz key
# matches the notification suffix, so Snowpipe sees a complete batch contract.
put_immutable_object "${manifest_absolute_path}" "${manifest_key}" "${manifest_sha256}" "application/json"
put_immutable_object "${data_path}" "${data_key}" "${data_sha256}" "application/gzip"
