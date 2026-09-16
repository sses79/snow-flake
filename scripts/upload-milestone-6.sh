#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

node apps/generator/src/cli.ts >/dev/null

manifests=(
  generated-data/milestone-1/batch_m1_c17d965e5b1c.manifest.json
  generated-data/milestone-2/batch_m2_01_new_inserts.manifest.json
  generated-data/milestone-2/batch_m2_02_correction_duplicate.manifest.json
  generated-data/milestone-2/batch_m2_03_late_older_version.manifest.json
  generated-data/milestone-2/batch_m2_04_withdrawal.manifest.json
  generated-data/milestone-2/batch_m2_replay_late_older.manifest.json
  generated-data/milestone-6/batch_m6_01_schema_drift.manifest.json
)

for manifest in "${manifests[@]}"; do
  ./scripts/upload-batch-s3.sh "${manifest}"
done

if [[ "${1:-}" == "--include-rejected" ]]; then
  ./scripts/upload-batch-s3.sh generated-data/milestone-6/batch_m6_02_rejected_file.manifest.json
fi
