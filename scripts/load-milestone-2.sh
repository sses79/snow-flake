#!/usr/bin/env bash
set -euo pipefail

manifests=(
  "generated-data/milestone-2/batch_m2_01_new_inserts.manifest.json"
  "generated-data/milestone-2/batch_m2_02_correction_duplicate.manifest.json"
  "generated-data/milestone-2/batch_m2_03_late_older_version.manifest.json"
  "generated-data/milestone-2/batch_m2_04_withdrawal.manifest.json"
  "generated-data/milestone-2/batch_m2_replay_late_older.manifest.json"
)

for manifest in "${manifests[@]}"; do
  ./scripts/load-batch.sh "$manifest"
done
