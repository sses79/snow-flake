import assert from "node:assert/strict";
import test from "node:test";
import { dashboardQueries, referencedObjects } from "../lib/query-contract.ts";
import { getTenantConfig } from "../lib/tenant.ts";

test("every dashboard query reads only the selected tenant's secure views", () => {
  const tenant = getTenantConfig("trust_north");
  const queries = dashboardQueries(tenant, "happy", "school_001", "2019_summer");
  const allowedViews = new Set(Object.values(tenant.views));
  for (const [name, query] of Object.entries(queries)) {
    const objects = referencedObjects(query.sqlText);
    assert.ok(objects.length > 0, `${name} should read at least one object`);
    const warehouseObjects = objects.filter((object) => object.includes("."));
    assert.ok(warehouseObjects.length > 0, `${name} should read a warehouse object`);
    assert.ok(warehouseObjects.every((object) => allowedViews.has(object)), `${name} escaped the secure-view allowlist`);
    assert.doesNotMatch(query.sqlText, /\b(?:RAW|STAGING|CORE)\b/i);
  }
});

test("browser filters remain bind values and never become identifiers", () => {
  const tenant = getTenantConfig("trust_south");
  const queries = dashboardQueries(tenant, "happy", "school_004", "2019_summer");
  assert.deepEqual(queries.trend.binds, ["happy", "school_004"]);
  assert.deepEqual(queries.distribution.binds, ["happy", "2019_summer", "school_004"]);
  assert.doesNotMatch(queries.trend.sqlText, /school_004|happy/);
});

test("tenant selection resolves to a fixed view and role allowlist", () => {
  assert.equal(getTenantConfig("trust_north").role, "WELLBEING_DEMO_TRUST_NORTH_READER");
  assert.equal(getTenantConfig("trust_south").role, "WELLBEING_DEMO_TRUST_SOUTH_READER");
  assert.throws(() => getTenantConfig("trust_east"), /DASHBOARD_TENANT/);
});
