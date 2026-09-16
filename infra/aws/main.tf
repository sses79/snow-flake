provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "demo"
      ManagedBy   = "terraform"
      Project     = "snowflake-school-wellbeing"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name              = coalesce(var.bucket_name, "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}")
  landing_prefix           = "region=uk/collection=wellbeing_submissions/"
  snowflake_trust_complete = var.snowflake_iam_user_arn != null && var.snowflake_external_id != null
}

check "snowflake_trust_values_are_paired" {
  assert {
    condition = (
      (var.snowflake_iam_user_arn == null && var.snowflake_external_id == null) ||
      (var.snowflake_iam_user_arn != null && var.snowflake_external_id != null)
    )
    error_message = "snowflake_iam_user_arn and snowflake_external_id must be supplied together."
  }
}

check "snowpipe_queue_matches_region" {
  assert {
    condition     = var.snowpipe_notification_queue_arn == null || strcontains(var.snowpipe_notification_queue_arn, ":sqs:${var.aws_region}:")
    error_message = "The Snowflake-managed SQS queue must be in aws_region."
  }
}

resource "aws_s3_bucket" "landing" {
  bucket        = local.bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "landing" {
  bucket = aws_s3_bucket.landing.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "landing" {
  bucket = aws_s3_bucket.landing.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "landing" {
  bucket = aws_s3_bucket.landing.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "landing" {
  bucket = aws_s3_bucket.landing.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "landing" {
  bucket = aws_s3_bucket.landing.id

  rule {
    id     = "expire-noncurrent-landing-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.landing]
}

data "aws_iam_policy_document" "snowflake_assume_role" {
  statement {
    sid     = local.snowflake_trust_complete ? "SnowflakeStorageIntegration" : "BootstrapDenyAll"
    effect  = local.snowflake_trust_complete ? "Allow" : "Deny"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = local.snowflake_trust_complete ? [var.snowflake_iam_user_arn] : ["*"]
    }

    dynamic "condition" {
      for_each = local.snowflake_trust_complete ? [var.snowflake_external_id] : []
      content {
        test     = "StringEquals"
        variable = "sts:ExternalId"
        values   = [condition.value]
      }
    }
  }
}

resource "aws_iam_role" "snowflake_storage" {
  name               = "${var.name_prefix}-snowflake-storage"
  assume_role_policy = data.aws_iam_policy_document.snowflake_assume_role.json
  description        = "Read-only Snowflake storage integration access to the wellbeing landing prefix"
}

data "aws_iam_policy_document" "snowflake_storage" {
  statement {
    sid       = "ListLandingPrefix"
    effect    = "Allow"
    actions   = ["s3:GetBucketLocation", "s3:ListBucket"]
    resources = [aws_s3_bucket.landing.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = [local.landing_prefix, "${local.landing_prefix}*"]
    }
  }

  statement {
    sid       = "ReadLandingObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion"]
    resources = ["${aws_s3_bucket.landing.arn}/${local.landing_prefix}*"]
  }
}

resource "aws_iam_role_policy" "snowflake_storage" {
  name   = "${var.name_prefix}-landing-read"
  role   = aws_iam_role.snowflake_storage.id
  policy = data.aws_iam_policy_document.snowflake_storage.json
}

# Snowflake creates and owns this SQS queue. The first apply intentionally
# omits the notification; finalize after SHOW PIPES returns its ARN.
resource "aws_s3_bucket_notification" "snowpipe" {
  count  = var.snowpipe_notification_queue_arn == null ? 0 : 1
  bucket = aws_s3_bucket.landing.id

  queue {
    id            = "snowpipe-auto-ingest"
    queue_arn     = var.snowpipe_notification_queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_suffix = ".ndjson.gz"
  }
}
