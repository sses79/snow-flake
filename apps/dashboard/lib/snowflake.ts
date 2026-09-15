import "server-only";

import { readFileSync } from "node:fs";
import snowflake, { type Connection, type ConnectionOptions } from "snowflake-sdk";
import type { QueryDefinition } from "./query-contract";
import { getTenantConfig } from "./tenant";

export type QueryRow = Record<string, unknown>;

let connectionPromise: Promise<Connection> | null = null;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function connectionOptions(): ConnectionOptions {
  const tenant = getTenantConfig();
  const authenticator = (process.env.SNOWFLAKE_DASHBOARD_AUTHENTICATOR ?? "PROGRAMMATIC_ACCESS_TOKEN").toUpperCase();
  const options: ConnectionOptions = {
    account: required("SNOWFLAKE_ACCOUNT"),
    username: required("SNOWFLAKE_DASHBOARD_USER"),
    authenticator,
    role: tenant.role,
    warehouse: process.env.SNOWFLAKE_APP_WAREHOUSE ?? "WELLBEING_DEMO_APP_WH",
    database: process.env.SNOWFLAKE_DATABASE ?? "SCHOOL_WELLBEING_DEMO",
    schema: "MARTS",
    application: "WELLBEING_DEMO_DASHBOARD",
    clientSessionKeepAlive: false
  };

  if (authenticator === "PROGRAMMATIC_ACCESS_TOKEN") {
    const token = process.env.SNOWFLAKE_DASHBOARD_TOKEN?.trim();
    const tokenPath = process.env.SNOWFLAKE_DASHBOARD_PAT_FILE?.trim();
    options.token = token ?? (tokenPath ? readFileSync(tokenPath, "utf8").trim() : undefined);
    if (!options.token) {
      throw new Error("Set SNOWFLAKE_DASHBOARD_TOKEN or SNOWFLAKE_DASHBOARD_PAT_FILE on the server");
    }
  } else if (authenticator === "SNOWFLAKE_JWT") {
    options.privateKeyPath = required("SNOWFLAKE_DASHBOARD_PRIVATE_KEY_PATH");
    const passphrase = process.env.SNOWFLAKE_DASHBOARD_PRIVATE_KEY_PASSPHRASE;
    if (passphrase) options.privateKeyPass = passphrase;
  } else {
    throw new Error("Dashboard authentication must use PROGRAMMATIC_ACCESS_TOKEN or SNOWFLAKE_JWT");
  }

  return options;
}

function connect(): Promise<Connection> {
  if (!connectionPromise) {
    const connection = snowflake.createConnection(connectionOptions());
    connectionPromise = new Promise((resolve, reject) => {
      connection.connect((error, establishedConnection) => {
        if (error) {
          connectionPromise = null;
          reject(new Error("The dashboard could not connect to Snowflake", { cause: error }));
          return;
        }
        resolve(establishedConnection);
      });
    });
  }
  return connectionPromise;
}

export async function querySnowflake(query: QueryDefinition): Promise<QueryRow[]> {
  const connection = await connect();
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: query.sqlText,
      binds: query.binds,
      complete(error, _statement, rows) {
        if (error) {
          reject(new Error("A dashboard query failed", { cause: error }));
          return;
        }
        resolve((rows ?? []) as QueryRow[]);
      }
    });
  });
}
