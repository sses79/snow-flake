# Power BI dashboard runbook

This runbook records the proven Power BI Service path for the Milestone 1
wellbeing trend report. Power BI imports a tenant-filtered secure Snowflake
view through a dedicated key-pair identity; it never receives access to the
shared mart table or the other tenant's view.

```text
MARTS.MART_SCHOOL_WELLBEING_TREND
              |
              +-- secure north view -- north reader role -- Power BI
              |
              `-- secure south view -- south reader role
```

Power BI Desktop and an on-premises gateway are not required for this small
cloud-to-cloud import.

## Snowflake prerequisites

1. Complete the Milestone 1 build so
   `MARTS.MART_SCHOOL_WELLBEING_TREND` contains rows.
2. Apply the rerunnable tenant-view setup after dbt has built the mart:

   ```bash
   set -a
   source .env
   set +a
   snow sql -c "$SNOWFLAKE_CONNECTION_NAME" \
     -f infra/snowflake/05_tenant_reader_views.sql
   ```

3. Use a dedicated Snowflake connector user with:
   - `DEFAULT_ROLE = WELLBEING_DEMO_TRUST_NORTH_READER`;
   - `DEFAULT_WAREHOUSE = WELLBEING_DEMO_APP_WH`;
   - the north reader role granted directly; and
   - its RSA public key registered in Snowflake.
4. Keep the matching PKCS#8 private key outside the repository. Both
   encrypted and unencrypted PEM private keys are supported by Power BI.

The executable SQL deliberately removes schema-wide `ALL VIEWS` and `FUTURE
VIEWS` grants. Each reader role receives `SELECT` only on its matching view:

- north: `MARTS.MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND`;
- south: `MARTS.MART_TRUST_SOUTH_SCHOOL_WELLBEING_TREND`.

Do not grant either reader role the shared
`MARTS.MART_SCHOOL_WELLBEING_TREND` table. It contains both trusts.

## Create the Power BI connection

In [Power BI Service](https://app.powerbi.com), open the target workspace and
choose **New → Report → Get data → Snowflake**.

Use these settings:

| Setting | Value |
|---|---|
| Server | `<lowercase-org>-<lowercase-account>.snowflakecomputing.com` |
| Warehouse | `WELLBEING_DEMO_APP_WH` |
| Mode | Import |
| Authentication kind | Key-pair |
| Username | Dedicated connector user's login name |
| Private key | Matching private PEM/PKCS#8 file |
| Passphrase | Only when the private key is encrypted |
| Privacy level | Organizational |
| Gateway | None |
| Allow gateway/VNet use | Unchecked |
| Advanced role | Leave blank when the default role is configured |

The server hostname must be entered in lowercase. Power BI's Snowflake ADBC
connection validation returned a generic `Invalid credentials` error for the
same valid organization/account hostname in uppercase, before Snowflake saw a
login attempt.

In Navigator, select only:

```text
SCHOOL_WELLBEING_DEMO
  -> MARTS
  -> MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND
```

Choose **Create a report** to move directly from Power Query into the report
editor. Opening the standalone semantic-model editor is not supported for all
Pro workspace/region combinations. If model editing is required and Power BI
shows that limitation, use a Fabric-capacity workspace or Power BI Desktop;
the report itself does not require model editing for the basic visuals below.

## Build the report

The report answers: *which fictional schools show a rising adverse-response
rate between consecutive survey periods?*

### Trend line

Create a line chart with:

- X-axis: `SURVEY_PERIOD`;
- Y-axis: `ADVERSE_RESPONSE_RATE`, aggregated as **Average**;
- Legend: `SCHOOL_ID`; and
- `Show value as`: **No calculation**.

Format the rate as a percentage at the visual level. Set the Y-axis minimum to
`0`; `0.20` is a useful maximum for the current fixture and makes its roughly
12–16% values legible. Keep a `QUESTION_CODE` slicer so a viewer can inspect
one question rather than unintentionally averaging unlike questions.

### Detail table

Add:

- `SCHOOL_ID`;
- `QUESTION_CODE`;
- `SURVEY_PERIOD`;
- `ANSWERED_RESPONSE_COUNT`; and
- `ADVERSE_RESPONSE_RATE`.

A period-over-period rate-change measure is optional in the Pro web-only
report because report/model measure authoring varies by workspace capacity.
The canonical calculation and ordering are documented in
[`milestone-1-vertical-slice.md`](milestone-1-vertical-slice.md#product-question).

### Filters and disclosure

Add dropdown slicers for:

- `TRUST_ID`;
- `SCHOOL_CLASSIFICATION`;
- `SURVEY_PERIOD`; and
- `QUESTION_CODE`.

Add a prominent text box containing:

```text
SYNTHETIC DATA — demonstration only
```

## Save the report

In the Power BI web editor, choose **File → Save as**, name the report
`School Wellbeing Trends`, and select the `School Wellbeing Demo` workspace.
Saving in Power BI Service is the publishing step; no separate Desktop
publish action is required.

## Verification and troubleshooting

The completed integration was verified on 2026-08-25:

- the local private key fingerprint matched the public key registered on the
  connector user;
- direct RSA key-pair login selected the expected reader role and warehouse;
- Power BI authenticated from Microsoft-hosted addresses with
  `RSA_KEYPAIR` through the Snowflake Go/ADBC driver;
- Power BI successfully discovered columns and previewed the north secure
  view;
- the north view returned 1,188 `trust_north` rows;
- the south view returned 1,188 `trust_south` rows;
- each reader role was denied access to the other tenant's view; and
- rerunning `05_tenant_reader_views.sql` preserved the same grants.

Common failure modes:

| Symptom | Cause and resolution |
|---|---|
| `Invalid credentials` with password | Snowflake requires MFA; use the configured key pair. |
| `Invalid credentials` with no Snowflake login event | Enter the full Snowflake hostname in lowercase and create a fresh Power BI cloud connection. |
| Other databases appear in Navigator | Names can be discoverable without object access; the reader role still sees only its tenant view inside this project's `MARTS` schema. |
| `Opening this semantic model is not supported` | Web model editing is unavailable for that Pro workspace/region; create the report directly or use Fabric capacity/Desktop. |
| `Cannot load model` after successful Snowflake preview | The Snowflake path is healthy; recreate the model/report in a supported Fabric-capacity workspace. |

The Power BI report is useful Milestone 1 evidence and an early product
validation. It does not replace Milestone 3's planned Next.js dashboard or
Milestone 4's row-access policy, cohort suppression, and operational evidence.
