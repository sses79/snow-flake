-- Milestone 6 phase 1: AWS storage integration.
-- Required Snowflake CLI template variables:
--   -D "aws_role_arn=arn:aws:iam::<account>:role/<role>"
--   -D "s3_bucket=<bucket-name>"

USE ROLE ACCOUNTADMIN;

GRANT CREATE INTEGRATION ON ACCOUNT
  TO ROLE WELLBEING_DEMO_ADMIN;

USE ROLE WELLBEING_DEMO_ADMIN;

CREATE STORAGE INTEGRATION IF NOT EXISTS WELLBEING_DEMO_S3_INTEGRATION
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = 'S3'
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = '<% aws_role_arn %>'
  STORAGE_ALLOWED_LOCATIONS = (
    's3://<% s3_bucket %>/region=uk/collection=wellbeing_submissions/'
  )
  COMMENT = 'Read-only Milestone 6 wellbeing landing integration';

ALTER STORAGE INTEGRATION WELLBEING_DEMO_S3_INTEGRATION SET
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = '<% aws_role_arn %>'
  STORAGE_ALLOWED_LOCATIONS = (
    's3://<% s3_bucket %>/region=uk/collection=wellbeing_submissions/'
  );

GRANT USAGE ON INTEGRATION WELLBEING_DEMO_S3_INTEGRATION
  TO ROLE WELLBEING_DEMO_LOADER;

DESC INTEGRATION WELLBEING_DEMO_S3_INTEGRATION;
