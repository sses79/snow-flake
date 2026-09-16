# Milestone 6: S3 and Snowpipe

Milestone 6 changes only the transport into the existing append-only raw
table. The envelope, dbt models, secure views, API, and dashboard remain the
same.

```text
generator + manifest
        |
        v
versioned encrypted S3 key
        |
   ObjectCreated notification
        v
Snowflake-managed SQS queue -> Snowpipe -> RAW -> dbt -> secure views
```

The adjacent `aws-auth` repository was inspected only for non-secret
conventions. It uses `eu-west-1` and normal AWS provider credential discovery,
so this Terraform root uses the same Region and derives the current account
with `aws_caller_identity`. No account number, AWS access key, Snowflake PAT,
or external ID is committed.

## What is provisioned

- a dedicated S3 bucket with versioning, default AES-256 server-side
  encryption, blocked public access, and bucket-owner-enforced ownership;
- a 30-day noncurrent-version retention rule and deletion protection;
- an IAM role that can list only the wellbeing prefix and read its object
  versions;
- a bootstrap deny-all trust policy, replaced only with Snowflake's exact IAM
  principal and external ID; and
- one S3 notification rule for `.ndjson.gz` objects under the contracted
  bucket, targeting Snowflake's managed SQS queue. The dedicated bucket and
  suffix avoid reserved-character ambiguity in S3 prefix filters; the stage,
  pipe pattern, and IAM policy still restrict reads to the contracted prefix.

Snowflake adds `WELLBEING_DEMO_S3_INTEGRATION`, `WELLBEING_S3_STAGE`, and
`WELLBEING_SUBMISSIONS_PIPE`. The pipe writes the same five raw columns as the
local loader and uses `METADATA$START_SCAN_TIME` as its load timestamp.

## Prerequisites

- AWS CLI authentication with permission to manage one S3 bucket and one IAM
  role/policy;
- Terraform 1.6 or newer;
- the working Snowflake CLI connection in `.env`; and
- `ACCOUNTADMIN` access for the one-time `CREATE INTEGRATION` delegation.

If the normal connection is a role-restricted loader PAT, point the one-time
DDL at a human administrative connection. This keeps MFA out of uploads and
dbt while limiting it to the setup/recovery boundary:

```dotenv
SNOWFLAKE_CONNECTION_NAME=wellbeing-loader-pat
SNOWFLAKE_ADMIN_CONNECTION_NAME=sses79
```

AWS authentication stays external. Use your existing default credentials,
SSO session, environment credential provider, or workload identity. Do not put
access keys in `.env` or `terraform.tfvars`.

## Deploy: three-phase handshake

The dependency is circular by design: Snowflake needs an AWS role ARN before
it can reveal its IAM principal, and AWS needs the Snowflake-created pipe
before it knows the managed SQS queue ARN.

First create the landing boundary. The role cannot be assumed yet because its
bootstrap trust policy explicitly denies everyone:

```bash
make aws-init
make aws-plan
make aws-apply
```

Then run the automated handshake:

```bash
make configure-snowpipe
```

The script creates the integration, captures its IAM principal/external ID,
applies the exact AWS trust, creates the stage and pipe, captures the managed
SQS ARN, and applies the S3 notification. Handshake values are written only to
mode-`0600` `infra/aws/terraform.auto.tfvars.json`; they are not printed and
the file is ignored. Keep this Terraform root as the sole owner of the
bucket's notification configuration because S3 replaces that configuration
atomically. `scripts/finalize-snowpipe.sh` remains available as a manual
fallback when an operator supplies all three values through environment
variables.

## Immutable upload contract

`make generate` now also creates two ignored Milestone 6 fixtures. The normal
upload publishes the baseline, every Milestone 2 mutation/replay, and the
optional-schema fixture:

```bash
make upload-milestone-6
```

Keys follow:

```text
region=uk/collection=wellbeing_submissions/date=YYYY-MM-DD/batch_id=<batch>/
  manifest.json
  submissions.ndjson.gz
```

The uploader verifies the manifest SHA-256 before network access, writes the
manifest first, and writes the notification-matching data object last. If a
key exists with the same checksum it is a no-op; a different checksum is
rejected rather than creating a disguised overwrite. S3 versioning remains a
recovery guard, not permission to mutate the contract.

## Schema-change and rejected-file exercises

The schema fixture repeats an existing immutable `event_id` and adds optional
`producer_metadata.contract_revision = 1.1`. Raw accepts the JSON field, while
the typed staging contract ignores it and still produces one logical event.
This proves compatible envelope evolution without changing curated counts.

Run the explicit failure exercise only when you want a red load-history row:

```bash
./scripts/upload-milestone-6.sh --include-rejected
snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -f infra/snowflake/10_snowpipe_acceptance.sql
```

The malformed gzipped NDJSON object is skipped as a file. `COPY_HISTORY`
records its non-loaded status, error count, and first error. The verification
script polls this surface and exits nonzero if the failure is not visible;
that is the demo alert boundary. A real deployment can route that same
condition into its existing pager or observability platform without placing
student data in an alert.

## Verify

Local-only checks require no cloud mutation:

```bash
./scripts/verify-milestone-6.sh --local
```

After both apply phases, the live gate uploads every valid immutable batch,
retries the same keys, waits for auto-ingest, builds dbt incrementally and with
`--full-refresh`, uploads the rejected fixture, and checks pipe/load history:

```bash
make verify-milestone-6
```

The gate proves that no manual `COPY` is needed for normal ingestion, the same
S3 key is loaded once, the replayed event remains one staging event, compatible
schema drift is retained in raw, and rejected data is observable. Each live
verification creates a timestamped batch key after the notification is active,
so an earlier run can never turn the auto-ingest assertion into a cached pass.

## Destructive recovery exercise

Normal downstream recovery is simply `dbt build --full-refresh` from raw. To
prove S3 is also a complete replay boundary, first confirm that
`make upload-milestone-6` completed, then run:

```bash
make recover-milestone-6
```

This deliberately pauses the pipe, truncates only the demo raw table, performs
a manual `FORCE = TRUE` replay of all valid landing files, rebuilds every dbt
relation with `--full-refresh`, and resumes the pipe even if the command fails.
The explicit confirmation flag inside the Make target prevents accidental use
of the lower-level script. Never point this exercise at a shared or production
table.

## Operations and cost

Use `infra/snowflake/10_snowpipe_acceptance.sql` for immediate 14-day status
and `MART_PIPELINE_HEALTH_SECURE` for the bounded operational surface.
`ACCOUNT_USAGE.COPY_HISTORY` covers both local COPY and Snowpipe, though it can
lag. Snowpipe uses Snowflake-managed serverless compute, so it does not resume
the three user warehouses; use copy/pipe usage history for its billed bytes and
credits.

Primary references:

- [Snowflake: automate Snowpipe for Amazon S3](https://docs.snowflake.com/en/user-guide/data-load-snowpipe-auto-s3)
- [Snowflake: COPY_HISTORY](https://docs.snowflake.com/en/sql-reference/functions/copy_history)
- [AWS: S3 event destinations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html)
- [Terraform: S3 bucket notification](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_notification)
