import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const strategySchema = new URL("../schemas/strategy-spec.schema.json", import.meta.url);
const resultSchema = new URL("../schemas/specialist-result.schema.json", import.meta.url);

test("strategy specification schema requires falsifiable rules and validation", async () => {
  const schema = JSON.parse(await readFile(strategySchema, "utf8"));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  for (const key of ["hypothesis", "data_requirements", "rules", "execution_assumptions", "validation_plan", "risk_limits", "failure_modes"]) {
    assert.ok(schema.required.includes(key), "Strategy schema must require " + key);
  }
  assert.ok(schema.properties.validation_plan.properties.walk_forward);
  assert.ok(schema.properties.execution_assumptions.properties.spread_slippage_model);
  assert.ok(schema.properties.risk_limits);
});

test("specialist result contract requires provenance, status and limitations", async () => {
  const schema = JSON.parse(await readFile(resultSchema, "utf8"));
  for (const key of ["module_id", "module_version", "run_id", "as_of", "status", "source_refs", "input_snapshot_ids", "observations", "limitations", "warnings", "confidence_basis", "required_followups"]) {
    assert.ok(schema.required.includes(key), "Specialist contract must require " + key);
  }
  assert.ok(schema.properties.status.enum.includes("NOT_CONNECTED"));
  assert.ok(schema.properties.status.enum.includes("STALE"));
});
