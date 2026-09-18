# Milestone 0 - Snowflake Account Connection and Guardrails

> **Project status:** This is the historical bootstrap runbook. The project was
> completed through Milestone 6 and is now in account-retirement/handover mode.
> Run these live commands only while the demo Snowflake account remains active.

## Outcome

At the end of this milestone:

- Snowflake CLI can connect using a named local connection.
- The demo has an isolated database, schemas, roles, and warehouses.
- Human administration and application access are separated.
- Warehouses are extra-small, initially suspended, and auto-suspend after inactivity.
- A resource monitor limits accidental credit consumption.
- Reader roles cannot access raw survey responses.
- Setup SQL can be rerun safely.

Do not put a password, private key, connection configuration, or account identifier in this repository.

## 1. Collect the non-secret account details

In Snowsight, open the account details and record these locally:

| Value              | Example form                     | Notes                                                           |
| ------------------ | -------------------------------- | --------------------------------------------------------------- |
| Account identifier | `myorg-myaccount`                | Prefer the organization-account form shown by Snowflake         |
| Username           | `TIM`                            | Your existing Snowflake user                                    |
| Authentication     | password + MFA, SSO, or key pair | Human password users should expect MFA                          |
| Bootstrap role     | `ACCOUNTADMIN` or equivalent     | Needed for the first resource monitor and grants                |
| Account edition    | Standard, Enterprise, etc.       | Record the available feature boundary; this project ultimately used tenant-specific secure views rather than a shared row-access policy |
| Cloud and region   | e.g. AWS `eu-west-2`             | Needed for storage-integration planning; the implemented AWS landing resources default to `eu-west-1` |

You do not need to send any credential or private key to the project or commit it to Git.

## 2. Install Snowflake CLI

On macOS with Homebrew:

```bash
brew install snowflake-cli
snow --version
```

Snowflake recommends a binary/package-manager installation. If Homebrew is not appropriate, use the official installer for the operating system.

Do not substitute the following command for this step:

```bash
curl -LsS https://ai.snowflake.com/static/cc-scripts/install.sh | sh
```

That official Snowflake script installs the separate Cortex Code CLI (`cortex`) into `~/.local/bin` and may modify the shell profile. It does not install the Snowflake CLI executable (`snow`) used by this project. Cortex Code is optional and is not required for any current milestone.

## 3. Create a named human connection

Use the interactive command so credentials are not copied into shell history:

```bash
snow connection add
```

Suggested values for a human user who signs in with a Snowflake password and second factor:

```text
connection name: wellbeing-admin
account:          <organization-account>
user:             <your-user>
role:             ACCOUNTADMIN
authenticator:    username_password_mfa
```

Leave database, schema, and warehouse unset initially because the demo objects do not exist yet. Do not store a plaintext password in the connection file. If the account uses SSO, use `externalbrowser` or the authenticator configured by the account administrator instead. Snowflake is rolling out mandatory strong authentication for human password users, so leaving the authenticator blank may fail even when the username and password are correct. Snowflake recommends supplying passwords through the supported environment variable rather than persisting them in the file.

For a TOTP-based second factor, read the current code without echoing it or writing it into shell history, then test the connection:

```bash
read -s "WELLBEING_TOTP?Current Snowflake TOTP: "
echo
snow connection test -c wellbeing-admin --mfa-passcode "$WELLBEING_TOTP"
snow sql -c wellbeing-admin --mfa-passcode "$WELLBEING_TOTP" \
  -q "select current_account(), current_user(), current_role();"
unset WELLBEING_TOTP
```

The TOTP is short-lived. Subsequent `snow sql` commands may require a new `--mfa-passcode` unless the account administrator enables client MFA caching. Never save a TOTP in the connection file.

### Optional: cache human MFA for local development

Snowflake can securely cache the MFA token in the operating-system keystore for up to four hours. This setting is account-wide, so confirm it is acceptable before enabling it on a shared or governed account.

Enable it once with `ACCOUNTADMIN`, using one current TOTP:

```bash
read -s "WELLBEING_TOTP?Current Snowflake TOTP: "
echo
snow sql -c wellbeing-admin --mfa-passcode "$WELLBEING_TOTP" \
  -q "ALTER ACCOUNT SET ALLOW_CLIENT_MFA_CACHING = TRUE;"
unset WELLBEING_TOTP
```

Keep this connection setting:

```toml
authenticator = "USERNAME_PASSWORD_MFA"
```

Authenticate once more with a current TOTP. Subsequent connections should reuse the OS-keystore token until it expires:

```bash
snow sql -c wellbeing-admin -q "select current_user(), current_role();"
```

Disable account-side caching if it is no longer wanted:

```sql
ALTER ACCOUNT UNSET ALLOW_CLIENT_MFA_CACHING;
```

MFA caching is for interactive human development. Automated dbt, CI, and dashboard workloads should use a separate service user with key-pair or workload-identity authentication.

On macOS and Linux, Snowflake CLI requires its configuration file to be readable and writable only by its owner (`0600`). The CLI normally manages this, but verify it if a permissions error appears.

## 4. Use an explicit object boundary

All demo-owned Snowflake objects use these names:

```text
Database
  SCHOOL_WELLBEING_DEMO

Schemas
  RAW
  STAGING
  CORE
  MARTS
  GOVERNANCE

Warehouses
  WELLBEING_DEMO_LOAD_WH
  WELLBEING_DEMO_TRANSFORM_WH
  WELLBEING_DEMO_APP_WH

Roles
  WELLBEING_DEMO_ADMIN
  WELLBEING_DEMO_LOADER
  WELLBEING_DEMO_TRANSFORMER
  WELLBEING_DEMO_TRUST_NORTH_READER
  WELLBEING_DEMO_TRUST_SOUTH_READER
  WELLBEING_DEMO_OBSERVER

Resource monitor
  WELLBEING_DEMO_MONITOR
```

Do not reuse an existing production database, schema, role, warehouse, or resource monitor.

## 5. Create the role hierarchy

Executable repository script: [`infra/snowflake/00_roles.sql`](../infra/snowflake/00_roles.sql).

Run the repository script from the `ACCOUNTADMIN` connection. It uses `SECURITYADMIN` to create and connect roles, then switches back to `ACCOUNTADMIN` for global privileges that only it can delegate. `IF NOT EXISTS` makes creation safe to rerun.

```sql
USE ROLE SECURITYADMIN;

CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_ADMIN
  COMMENT = 'Owns and administers the isolated school wellbeing demo';
CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_LOADER
  COMMENT = 'Loads immutable source batches into RAW';
CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_TRANSFORMER
  COMMENT = 'Builds tested dbt models from RAW to MARTS';
CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_TRUST_NORTH_READER
  COMMENT = 'Reads north tenant secure views only';
CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_TRUST_SOUTH_READER
  COMMENT = 'Reads south tenant secure views only';
CREATE ROLE IF NOT EXISTS WELLBEING_DEMO_OBSERVER
  COMMENT = 'Reads only the operational health surface';

GRANT ROLE WELLBEING_DEMO_LOADER TO ROLE WELLBEING_DEMO_ADMIN;
GRANT ROLE WELLBEING_DEMO_TRANSFORMER TO ROLE WELLBEING_DEMO_ADMIN;
GRANT ROLE WELLBEING_DEMO_TRUST_NORTH_READER TO ROLE WELLBEING_DEMO_ADMIN;
GRANT ROLE WELLBEING_DEMO_TRUST_SOUTH_READER TO ROLE WELLBEING_DEMO_ADMIN;
GRANT ROLE WELLBEING_DEMO_OBSERVER TO ROLE WELLBEING_DEMO_ADMIN;
GRANT ROLE WELLBEING_DEMO_ADMIN TO ROLE SYSADMIN;

USE ROLE ACCOUNTADMIN;

GRANT CREATE DATABASE ON ACCOUNT TO ROLE WELLBEING_DEMO_ADMIN;
GRANT CREATE WAREHOUSE ON ACCOUNT TO ROLE WELLBEING_DEMO_ADMIN;

-- Grant the working admin role to the authenticated bootstrap user.
SET DEMO_BOOTSTRAP_USER = CURRENT_USER();
GRANT ROLE WELLBEING_DEMO_ADMIN
  TO USER IDENTIFIER($DEMO_BOOTSTRAP_USER);
```

The child roles contain narrowly scoped runtime privileges. The admin role inherits them, and `SYSADMIN` inherits the complete custom hierarchy. Do not grant custom roles to `PUBLIC`.

## 6. Create the database, schemas, and warehouses

Executable repository script: [`infra/snowflake/01_foundation.sql`](../infra/snowflake/01_foundation.sql).

Run as the custom admin role:

```sql
USE ROLE WELLBEING_DEMO_ADMIN;

CREATE DATABASE IF NOT EXISTS SCHOOL_WELLBEING_DEMO
  COMMENT = 'Synthetic and public school wellbeing learning demo';

CREATE SCHEMA IF NOT EXISTS SCHOOL_WELLBEING_DEMO.RAW
  COMMENT = 'Append-only source envelopes and load metadata';
CREATE SCHEMA IF NOT EXISTS SCHOOL_WELLBEING_DEMO.STAGING
  COMMENT = 'Typed source changes';
CREATE SCHEMA IF NOT EXISTS SCHOOL_WELLBEING_DEMO.CORE
  COMMENT = 'Conformed facts and dimensions';
CREATE SCHEMA IF NOT EXISTS SCHOOL_WELLBEING_DEMO.MARTS
  COMMENT = 'Aggregate secure product views';
CREATE SCHEMA IF NOT EXISTS SCHOOL_WELLBEING_DEMO.GOVERNANCE
  COMMENT = 'Policies, mappings, and audit helpers';

CREATE WAREHOUSE IF NOT EXISTS WELLBEING_DEMO_LOAD_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'School wellbeing demo ingestion only';

CREATE WAREHOUSE IF NOT EXISTS WELLBEING_DEMO_TRANSFORM_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'School wellbeing dbt transformations only';

CREATE WAREHOUSE IF NOT EXISTS WELLBEING_DEMO_APP_WH
  WAREHOUSE_SIZE = XSMALL
  AUTO_SUSPEND = 60
  AUTO_RESUME = TRUE
  INITIALLY_SUSPENDED = TRUE
  COMMENT = 'School wellbeing dashboard queries only';

-- Correct important settings if the warehouses already existed.
ALTER WAREHOUSE WELLBEING_DEMO_LOAD_WH SET
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
ALTER WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH SET
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
ALTER WAREHOUSE WELLBEING_DEMO_APP_WH SET
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE;
```

Keep all three as standard, single-cluster warehouses. Separate warehouses make workload cost and access visible even though each is small.

## 7. Create the raw loading objects

Executable repository script: [`infra/snowflake/02_raw_objects.sql`](../infra/snowflake/02_raw_objects.sql).

The dataset adapter will produce one complete JSON change envelope per line, so the file format must not strip an outer array.

```sql
USE ROLE WELLBEING_DEMO_ADMIN;
USE DATABASE SCHOOL_WELLBEING_DEMO;
USE SCHEMA RAW;

CREATE FILE FORMAT IF NOT EXISTS WELLBEING_NDJSON_FORMAT
  TYPE = JSON
  COMPRESSION = AUTO
  STRIP_OUTER_ARRAY = FALSE
  ALLOW_DUPLICATE = FALSE
  COMMENT = 'One wellbeing submission change envelope per line';

CREATE STAGE IF NOT EXISTS WELLBEING_INTERNAL_STAGE
  FILE_FORMAT = WELLBEING_NDJSON_FORMAT
  COMMENT = 'Local-first immutable source batches';

CREATE TABLE IF NOT EXISTS MONGO_WELLBEING_SUBMISSIONS (
  ENVELOPE VARIANT NOT NULL,
  SOURCE_FILE STRING NOT NULL,
  SOURCE_FILE_ROW_NUMBER NUMBER NOT NULL,
  LOADED_AT TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  LOAD_RUN_ID STRING
)
COMMENT = 'Append-only Mongo-shaped wellbeing submission changes';

CREATE TABLE IF NOT EXISTS SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS (
  RUN_ID STRING NOT NULL,
  BATCH_ID STRING NOT NULL,
  SOURCE_FILE STRING NOT NULL,
  STATUS STRING NOT NULL,
  EXPECTED_ROW_COUNT NUMBER NOT NULL,
  OBSERVED_BATCH_ROW_COUNT NUMBER,
  STARTED_AT TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  COMPLETED_AT TIMESTAMP_TZ,
  EXIT_CODE NUMBER,
  CONSTRAINT PIPELINE_RUNS_STATUS_CHECK
    CHECK (STATUS IN ('RUNNING', 'SUCCEEDED', 'FAILED'))
)
COMMENT = 'Operational batch attempts without row-level survey content or credentials';
```

Raw remains append-only. Do not add destructive deduplication, update, or delete logic to this table.

## 8. Grant the minimum working privileges

Executable repository script: [`infra/snowflake/03_grants.sql`](../infra/snowflake/03_grants.sql).

```sql
USE ROLE WELLBEING_DEMO_ADMIN;

GRANT USAGE ON WAREHOUSE WELLBEING_DEMO_LOAD_WH
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT USAGE ON WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON WAREHOUSE WELLBEING_DEMO_APP_WH
  TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
GRANT USAGE ON WAREHOUSE WELLBEING_DEMO_APP_WH
  TO ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;

GRANT USAGE ON DATABASE SCHOOL_WELLBEING_DEMO
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.RAW
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT READ, WRITE ON STAGE SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_INTERNAL_STAGE
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT INSERT, SELECT ON TABLE SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.GOVERNANCE
  TO ROLE WELLBEING_DEMO_LOADER;
GRANT SELECT, INSERT, UPDATE ON TABLE
  SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS
  TO ROLE WELLBEING_DEMO_LOADER;

GRANT USAGE ON DATABASE SCHOOL_WELLBEING_DEMO
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.RAW
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT SELECT ON TABLE SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.GOVERNANCE
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT SELECT ON TABLE SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.STAGING
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.CORE
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT CREATE TABLE, CREATE VIEW ON SCHEMA SCHOOL_WELLBEING_DEMO.STAGING
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT CREATE TABLE, CREATE VIEW ON SCHEMA SCHOOL_WELLBEING_DEMO.CORE
  TO ROLE WELLBEING_DEMO_TRANSFORMER;
GRANT CREATE TABLE, CREATE VIEW ON SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  TO ROLE WELLBEING_DEMO_TRANSFORMER;

GRANT USAGE ON DATABASE SCHOOL_WELLBEING_DEMO
  TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
GRANT USAGE ON DATABASE SCHOOL_WELLBEING_DEMO
  TO ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  TO ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;

-- Deliberately do not grant ALL or FUTURE views. After dbt builds the marts,
-- 05_tenant_reader_views.sql grants each role only its own secure views.

GRANT USAGE ON WAREHOUSE WELLBEING_DEMO_APP_WH
  TO ROLE WELLBEING_DEMO_OBSERVER;
GRANT USAGE ON DATABASE SCHOOL_WELLBEING_DEMO
  TO ROLE WELLBEING_DEMO_OBSERVER;
GRANT USAGE ON SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  TO ROLE WELLBEING_DEMO_OBSERVER;
```

The loader receives `SELECT` on raw for post-load reconciliation and narrowly
scoped writes to the non-sensitive run-audit table. It has no update, delete,
truncate, or schema-creation privilege on raw. The executable script also gives
the transformer bounded Snowflake Account Usage database roles needed by the
Milestone 5 health mart; tenant readers never receive those roles.

## 9. Add the cost monitor

Executable repository script: [`infra/snowflake/04_cost_monitor.sql`](../infra/snowflake/04_cost_monitor.sql). Pass the chosen quota at execution time with Snowflake CLI's `-D "credit_quota=<positive number>"` template variable.

Choose the quota yourself based on the account's budget and other workloads. Do not paste an arbitrary quota into production.

Run as `ACCOUNTADMIN`, replacing `<MONTHLY_CREDIT_QUOTA>` with the approved numeric value:

```sql
USE ROLE ACCOUNTADMIN;

CREATE RESOURCE MONITOR IF NOT EXISTS WELLBEING_DEMO_MONITOR
  WITH CREDIT_QUOTA = <MONTHLY_CREDIT_QUOTA>
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 50 PERCENT DO NOTIFY
    ON 80 PERCENT DO NOTIFY
    ON 90 PERCENT DO SUSPEND
    ON 100 PERCENT DO SUSPEND_IMMEDIATE;

ALTER WAREHOUSE WELLBEING_DEMO_LOAD_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;
ALTER WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;
ALTER WAREHOUSE WELLBEING_DEMO_APP_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;
```

All three warehouses share this quota. Heavy use by one can suspend the others, which is desirable for a single bounded demo but should be reconsidered for independent production workloads. Enable account notification emails in Snowsight if you want the `NOTIFY` actions to reach you.

## 10. Run the acceptance checks

### Connection and role hierarchy

```sql
SELECT CURRENT_ACCOUNT(), CURRENT_USER(), CURRENT_ROLE();
SHOW ROLES LIKE 'WELLBEING_DEMO%';
SHOW GRANTS TO ROLE WELLBEING_DEMO_LOADER;
SHOW GRANTS TO ROLE WELLBEING_DEMO_TRANSFORMER;
SHOW GRANTS TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
SHOW GRANTS TO ROLE WELLBEING_DEMO_OBSERVER;
```

### Warehouse guardrails

```sql
SHOW WAREHOUSES LIKE 'WELLBEING_DEMO_%';
SHOW RESOURCE MONITORS LIKE 'WELLBEING_DEMO_MONITOR';
```

Verify all three warehouses show:

- `X-Small` size;
- auto-suspend of 60 seconds;
- auto-resume enabled;
- the shared demo resource monitor.

### Positive loader check

```sql
USE ROLE WELLBEING_DEMO_LOADER;
USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
SELECT COUNT(*)
FROM SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS;
```

Expected before Milestone 1: `0`.

### Positive transformer check

```sql
USE ROLE WELLBEING_DEMO_TRANSFORMER;
USE WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH;
SELECT COUNT(*)
FROM SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS;
```

Expected before Milestone 1: `0`.

### Negative reader check

```sql
USE ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
USE WAREHOUSE WELLBEING_DEMO_APP_WH;
SELECT COUNT(*)
FROM SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS;
```

Expected: an insufficient-privileges error. This failure is an acceptance test.

Repeat with the south reader role.

### Idempotency check

Run the role, database, warehouse, object, and grant setup a second time. Expected:

- no duplicate objects;
- no replacement or data loss;
- no broader privileges;
- warehouse settings remain guarded;
- raw row count remains unchanged.

Avoid `CREATE OR REPLACE` in bootstrap SQL because replacement can destroy or reset existing objects and grants.

## 11. Service authentication boundary

Use the human connection only for administration and local learning. Milestone
5 implemented credential-less service-user definitions in
[`06_service_identities.sql`](../infra/snowflake/06_service_identities.sql) for
the loader, transformer, both dashboards, and observer. A deployment must still
attach its approved network policy and PAT, key pair, or workload identity.
Snowflake CLI and the official Node.js driver both support key-pair
authentication.

The dashboard service user should receive only one tenant reader role and `WELLBEING_DEMO_APP_WH`; it should never receive loader, transformer, admin, or raw privileges. Never place a private key in the repository or browser bundle.

## 12. Safe teardown design

Do not run teardown as part of normal builds. The repository intentionally has
no automated Snowflake teardown. An object-only teardown would need an explicit
confirmation and exact names for:

1. suspend and drop the three demo warehouses;
2. drop `SCHOOL_WELLBEING_DEMO`;
3. drop the demo resource monitor;
4. drop the pipe, external stage, storage integration, audit objects, and
   service users added by later milestones; and
5. revoke and drop only the six `WELLBEING_DEMO_*` roles.

Never use a wildcard, environment-variable-expanded database name, or account-wide cleanup command for teardown.

For full account retirement, do not substitute object teardown for formal
cancellation. Follow
[`project-outcomes-and-lessons.md`](project-outcomes-and-lessons.md#snowflake-account-closure-checklist):
retain or migrate the AWS boundary first, cancel separate subscriptions, and
ask Snowflake Support to close a trial, self-service, or last organization
account.

## Completion checklist

- [x] `snow connection test -c wellbeing-admin` succeeds.
- [x] The custom role hierarchy exists and is inherited by `SYSADMIN`.
- [x] The isolated database and five schemas exist.
- [x] All three warehouses are X-Small, initially suspended, and auto-suspend.
- [x] The chosen resource monitor is attached to all three warehouses.
- [x] The internal stage, JSON format, and empty raw table exist.
- [x] Loader and transformer can query the raw table.
- [x] Both tenant readers are denied access to raw.
- [x] Re-running setup makes no destructive or privilege-expanding change.
- [x] No secret or account-specific connection file exists in the repository.

When every box passes, Milestone 0 is complete and Milestone 1 can load the first normalized survey batch.
