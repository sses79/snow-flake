output "landing_bucket_name" {
  description = "S3 landing bucket name used by the upload workflow."
  value       = aws_s3_bucket.landing.id
}

output "landing_prefix" {
  description = "Immutable object prefix monitored by Snowpipe."
  value       = local.landing_prefix
}

output "snowflake_storage_role_arn" {
  description = "Pass this ARN to infra/snowflake/08_storage_integration.sql."
  value       = aws_iam_role.snowflake_storage.arn
}

output "snowflake_trust_configured" {
  description = "True after the Snowflake IAM principal and external ID are supplied."
  value       = nonsensitive(local.snowflake_trust_complete)
}

output "snowpipe_notification_configured" {
  description = "True after the Snowflake-managed SQS ARN is supplied."
  value       = var.snowpipe_notification_queue_arn != null
}
