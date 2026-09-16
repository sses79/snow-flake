variable "aws_region" {
  description = "AWS Region for the landing bucket and Snowflake-managed SQS queue."
  type        = string
  default     = "eu-west-1"
}
variable "name_prefix" {
  description = "Lowercase prefix used for AWS resource names."
  type        = string
  default     = "sses79-wellbeing-demo"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,36}[a-z0-9]$", var.name_prefix))
    error_message = "name_prefix must be 4-38 lowercase letters, numbers, or hyphens."
  }
}

variable "bucket_name" {
  description = "Optional globally unique bucket name. Null derives one from the active AWS account and Region."
  type        = string
  default     = null
}

variable "snowflake_iam_user_arn" {
  description = "STORAGE_AWS_IAM_USER_ARN returned by DESC INTEGRATION. Leave null for the deny-all bootstrap trust policy."
  type        = string
  default     = null

  validation {
    condition     = var.snowflake_iam_user_arn == null || can(regex("^arn:[^:]+:iam::[0-9]{12}:(user|role)/", var.snowflake_iam_user_arn))
    error_message = "snowflake_iam_user_arn must be a valid IAM user or role ARN."
  }
}

variable "snowflake_external_id" {
  description = "STORAGE_AWS_EXTERNAL_ID returned by DESC INTEGRATION. Keep it in ignored local configuration."
  type        = string
  default     = null
  sensitive   = true
}

variable "snowpipe_notification_queue_arn" {
  description = "Snowflake-managed SQS ARN from SHOW PIPES. Null omits the S3 notification during bootstrap."
  type        = string
  default     = null

  validation {
    condition     = var.snowpipe_notification_queue_arn == null || can(regex("^arn:[^:]+:sqs:[^:]+:[0-9]{12}:[A-Za-z0-9_-]+$", var.snowpipe_notification_queue_arn))
    error_message = "snowpipe_notification_queue_arn must be a valid SQS queue ARN."
  }
}

variable "noncurrent_version_expiration_days" {
  description = "Days to retain noncurrent object versions for recovery."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_version_expiration_days >= 7
    error_message = "Retain noncurrent versions for at least seven days."
  }
}
