#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

: "${SNOWFLAKE_STORAGE_IAM_USER_ARN:?Export the DESC INTEGRATION IAM user ARN}"
: "${SNOWFLAKE_STORAGE_EXTERNAL_ID:?Export the DESC INTEGRATION external ID}"
: "${SNOWPIPE_NOTIFICATION_QUEUE_ARN:?Export the SHOW PIPES notification_channel ARN}"

if [[ ! "${SNOWFLAKE_STORAGE_IAM_USER_ARN}" =~ ^arn:[^:]+:iam::[0-9]{12}:(user|role)/[A-Za-z0-9+=,.@_/-]+$ ]]; then
  echo "SNOWFLAKE_STORAGE_IAM_USER_ARN is not a valid IAM ARN." >&2
  exit 1
fi
if [[ ! "${SNOWPIPE_NOTIFICATION_QUEUE_ARN}" =~ ^arn:[^:]+:sqs:[^:]+:[0-9]{12}:[A-Za-z0-9_-]+$ ]]; then
  echo "SNOWPIPE_NOTIFICATION_QUEUE_ARN is not a valid SQS ARN." >&2
  exit 1
fi

node --input-type=module -e '
  import { writeFileSync } from "node:fs";
  const values = {
    snowflake_iam_user_arn: process.env.SNOWFLAKE_STORAGE_IAM_USER_ARN,
    snowflake_external_id: process.env.SNOWFLAKE_STORAGE_EXTERNAL_ID,
    snowpipe_notification_queue_arn: process.env.SNOWPIPE_NOTIFICATION_QUEUE_ARN
  };
  writeFileSync("infra/aws/terraform.auto.tfvars.json", `${JSON.stringify(values, null, 2)}\n`, { mode: 0o600 });
'

terraform -chdir=infra/aws apply

echo "Snowflake trust and the S3-to-Snowpipe notification are configured."
