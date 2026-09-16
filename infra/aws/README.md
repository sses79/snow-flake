# AWS landing infrastructure

This Terraform root owns one dedicated S3 bucket, its read-only Snowflake IAM
role, and the bucket's notification configuration. Snowflake owns the SQS
queue; its ARN is returned by `SHOW PIPES`.

The setup is deliberately three phase because AWS must create the role before
Snowflake can return its trust principal, while Snowflake must create the pipe
before AWS can target the managed queue:

1. `terraform init && terraform apply` creates the protected bucket and a role
   whose bootstrap trust policy denies every principal.
2. Run `scripts/configure-snowpipe.sh`. It creates the integration, captures
   the Snowflake IAM principal/external ID into an ignored mode-`0600` file,
   and applies the exact AWS trust policy.
3. The same script creates the stage and pipe, captures the Snowflake-managed
   SQS ARN, and applies the S3 notification. Handshake values are not printed.

Terraform discovers the account from the active AWS CLI/provider credentials;
no AWS account ID or credential belongs in this repository. The default
Region, `eu-west-1`, matches the adjacent `aws-auth` project.

The bucket has versioning, default SSE-S3 encryption, blocked public access,
bucket-owner-enforced ownership, and a 30-day noncurrent-version retention
rule. `prevent_destroy` and `force_destroy = false` protect the replay source.
