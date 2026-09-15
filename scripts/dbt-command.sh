#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
environment_file="${ENV_FILE:-${repository_root}/.env}"

if [[ ! -f "${environment_file}" ]]; then
    echo "Missing ${environment_file}; copy .env.example and configure Snowflake." >&2
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

# Local development may reuse the server-side PAT. Hosted deployments should
# set workload-specific variables and identities as documented in Milestone 5.
if [[ -n "${SNOWFLAKE_DBT_TOKEN:-}" ]]; then
    export SNOWFLAKE_TOKEN="${SNOWFLAKE_DBT_TOKEN}"
    export SNOWFLAKE_USER="${SNOWFLAKE_DBT_USER:-${SNOWFLAKE_USER:-}}"
    export SNOWFLAKE_AUTHENTICATOR="programmatic_access_token"
elif [[ -n "${SNOWFLAKE_DBT_PAT_FILE:-}" ]]; then
    if [[ ! -f "${SNOWFLAKE_DBT_PAT_FILE}" ]]; then
        echo "dbt PAT file does not exist: ${SNOWFLAKE_DBT_PAT_FILE}" >&2
        exit 1
    fi
    IFS= read -r SNOWFLAKE_TOKEN < "${SNOWFLAKE_DBT_PAT_FILE}"
    export SNOWFLAKE_TOKEN
    export SNOWFLAKE_USER="${SNOWFLAKE_DBT_USER:-${SNOWFLAKE_USER:-}}"
    export SNOWFLAKE_AUTHENTICATOR="programmatic_access_token"
elif [[ -n "${SNOWFLAKE_DASHBOARD_TOKEN:-}" ]]; then
    export SNOWFLAKE_TOKEN="${SNOWFLAKE_DASHBOARD_TOKEN}"
    export SNOWFLAKE_USER="${SNOWFLAKE_DASHBOARD_USER:-${SNOWFLAKE_USER:-}}"
    export SNOWFLAKE_AUTHENTICATOR="programmatic_access_token"
elif [[ -n "${SNOWFLAKE_DASHBOARD_PAT_FILE:-}" ]]; then
    if [[ ! -f "${SNOWFLAKE_DASHBOARD_PAT_FILE}" ]]; then
        echo "Dashboard PAT file does not exist: ${SNOWFLAKE_DASHBOARD_PAT_FILE}" >&2
        exit 1
    fi
    IFS= read -r SNOWFLAKE_TOKEN < "${SNOWFLAKE_DASHBOARD_PAT_FILE}"
    export SNOWFLAKE_TOKEN
    export SNOWFLAKE_USER="${SNOWFLAKE_DASHBOARD_USER:-${SNOWFLAKE_USER:-}}"
    export SNOWFLAKE_AUTHENTICATOR="programmatic_access_token"
elif [[ -n "${SNOWFLAKE_PAT_FILE:-}" ]]; then
    if [[ ! -f "${SNOWFLAKE_PAT_FILE}" ]]; then
        echo "PAT file does not exist: ${SNOWFLAKE_PAT_FILE}" >&2
        exit 1
    fi
    IFS= read -r SNOWFLAKE_TOKEN < "${SNOWFLAKE_PAT_FILE}"
    export SNOWFLAKE_TOKEN
    export SNOWFLAKE_AUTHENTICATOR="programmatic_access_token"
fi

if [[ $# -eq 0 ]]; then
    echo "Usage: scripts/dbt-command.sh <dbt-command> [arguments...]" >&2
    exit 2
fi

dbt_executable="${DBT:-${repository_root}/.venv/bin/dbt}"
exec "${dbt_executable}" "$@" --project-dir "${repository_root}/dbt" --profiles-dir "${repository_root}/dbt"
