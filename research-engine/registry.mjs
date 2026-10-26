import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const STAGES = ["IDEA", "SPECIFIED", "DATA_VALIDATED", "BACKTESTED", "OUT_OF_SAMPLE", "WALK_FORWARD", "RED_TEAM_REVIEW", "PAPER_TRIAL", "REVIEWED_CANDIDATE", "REJECTED", "NEEDS_DATA"];
const NEXT = {
  IDEA: ["SPECIFIED", "REJECTED", "NEEDS_DATA"],
  SPECIFIED: ["DATA_VALIDATED", "REJECTED", "NEEDS_DATA"],
  DATA_VALIDATED: ["BACKTESTED", "REJECTED", "NEEDS_DATA"],
  BACKTESTED: ["OUT_OF_SAMPLE", "REJECTED", "NEEDS_DATA"],
  OUT_OF_SAMPLE: ["WALK_FORWARD", "REJECTED", "NEEDS_DATA"],
  WALK_FORWARD: ["RED_TEAM_REVIEW", "REJECTED", "NEEDS_DATA"],
  RED_TEAM_REVIEW: ["PAPER_TRIAL", "REJECTED", "NEEDS_DATA"],
  PAPER_TRIAL: ["REVIEWED_CANDIDATE", "REJECTED", "NEEDS_DATA"],
  REVIEWED_CANDIDATE: [],
  REJECTED: [],
  NEEDS_DATA: ["DATA_VALIDATED", "REJECTED"]
};

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function digest(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " must be a non-empty string");
}
function assertStage(stage) {
  if (!STAGES.includes(stage)) throw new TypeError("Unknown research stage: " + stage);
}
function validateStrategy(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new TypeError("Strategy specification must be an object");
  for (const key of ["strategy_id", "version", "name", "hypothesis", "markets", "timeframes", "data_requirements", "rules", "execution_assumptions", "validation_plan", "risk_limits", "failure_modes"]) {
    if (!(key in spec)) throw new TypeError("Missing required strategy field: " + key);
  }
  requireString(spec.strategy_id, "strategy_id");
  requireString(spec.version, "version");
  requireString(spec.hypothesis, "hypothesis");
  for (const key of ["markets", "timeframes", "data_requirements", "failure_modes"]) {
    if (!Array.isArray(spec[key]) || spec[key].length === 0) throw new TypeError(key + " must be a non-empty array");
  }
  for (const key of ["entry", "exit", "invalidation", "no_trade_conditions"]) {
    if (!Array.isArray(spec.rules?.[key]) || spec.rules[key].length === 0) throw new TypeError("rules." + key + " must be a non-empty array");
  }
  for (const key of ["fill_model", "fees_model", "spread_slippage_model"]) requireString(spec.execution_assumptions?.[key], "execution_assumptions." + key);
  for (const key of ["benchmark", "train_window", "validation_window", "test_window"]) requireString(spec.validation_plan?.[key], "validation_plan." + key);
  if (typeof spec.validation_plan.walk_forward !== "boolean") throw new TypeError("validation_plan.walk_forward must be boolean");
  if (!spec.risk_limits || typeof spec.risk_limits !== "object" || !Object.keys(spec.risk_limits).length) throw new TypeError("risk_limits must define at least one limit");
  return structuredClone(spec);
}
function hashRecord(record) {
  const { record_hash, ...body } = record;
  return digest(body);
}

export class ResearchRegistry {
  constructor({ filePath, clock = () => new Date() } = {}) {
    if (filePath !== undefined && (typeof filePath !== "string" || !filePath.trim())) throw new TypeError("filePath must be a non-empty path");
    this.filePath = filePath ? path.resolve(filePath) : null;
    this.clock = clock;
    this.records = [];
  }

  async load() {
    if (!this.filePath) return this.list();
    let raw;
    try { raw = await readFile(this.filePath, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return this.list(); throw error; }
    const parsed = raw.split("\n").filter(Boolean).map(line => JSON.parse(line));
    let previous = null;
    for (const record of parsed) {
      if (record.previous_hash !== previous) throw new Error("Registry chain broken at record " + record.record_id);
      if (record.record_hash !== hashRecord(record)) throw new Error("Registry record hash mismatch: " + record.record_id);
      previous = record.record_hash;
    }
    this.records = parsed;
    return this.list();
  }

  list() {
    return this.records.map(record => structuredClone(record));
  }

  get(recordId) {
    const record = this.records.find(item => item.record_id === recordId);
    return record ? structuredClone(record) : null;
  }

  async #append(type, payload) {
    const body = {
      record_id: randomUUID(),
      record_type: type,
      created_at: this.clock().toISOString(),
      previous_hash: this.records.length ? this.records[this.records.length - 1].record_hash : null,
      payload: structuredClone(payload)
    };
    const record = { ...body, record_hash: digest(body) };
    if (this.filePath) {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, JSON.stringify(record) + "\n", { encoding: "utf8", flag: "a" });
    }
    this.records.push(record);
    return structuredClone(record);
  }

  async registerStrategy(spec) {
    const clean = validateStrategy(spec);
    const key = clean.strategy_id + "@" + clean.version;
    if (this.records.some(r => r.record_type === "STRATEGY_REGISTERED" && r.payload.key === key)) {
      throw new Error("Strategy version already registered: " + key + ". Register a new version instead of editing history.");
    }
    return this.#append("STRATEGY_REGISTERED", { key, spec: clean, spec_hash: digest(clean), stage: "IDEA" });
  }

  async recordExperiment({ strategyKey, datasetId, codeVersion, config, metrics, limitations = [], passed = false, gate }) {
    for (const [key, value] of Object.entries({ strategyKey, datasetId, codeVersion, gate })) requireString(value, key);
    if (!config || typeof config !== "object" || !metrics || typeof metrics !== "object") throw new TypeError("config and metrics must be objects");
    const strategy = this.records.find(r => r.record_type === "STRATEGY_REGISTERED" && r.payload.key === strategyKey);
    if (!strategy) throw new Error("Unknown strategy version: " + strategyKey);
    return this.#append("EXPERIMENT_RECORDED", {
      strategy_key: strategyKey, strategy_spec_hash: strategy.payload.spec_hash,
      dataset_id: datasetId, code_version: codeVersion, config: structuredClone(config),
      metrics: structuredClone(metrics), limitations: [...limitations], gate, passed: Boolean(passed)
    });
  }

  async transition(strategyKey, toStage, { evidenceRecordIds = [], reviewer = "system", rationale } = {}) {
    requireString(strategyKey, "strategyKey");
    requireString(reviewer, "reviewer");
    requireString(rationale, "rationale");
    assertStage(toStage);
    const registered = this.records.find(r => r.record_type === "STRATEGY_REGISTERED" && r.payload.key === strategyKey);
    if (!registered) throw new Error("Unknown strategy version: " + strategyKey);
    const transitions = this.records.filter(r => r.record_type === "STAGE_TRANSITION" && r.payload.strategy_key === strategyKey);
    const current = transitions.length ? transitions[transitions.length - 1].payload.to_stage : "IDEA";
    if (!NEXT[current].includes(toStage)) throw new Error("Invalid transition " + current + " -> " + toStage);
    const evidence = evidenceRecordIds.map(id => this.records.find(r => r.record_id === id));
    if (evidence.some(r => !r)) throw new Error("Every evidenceRecordId must reference a record in this registry");
    const experiments = evidence.filter(r => r.record_type === "EXPERIMENT_RECORDED");
    if (["BACKTESTED", "OUT_OF_SAMPLE", "WALK_FORWARD", "RED_TEAM_REVIEW", "PAPER_TRIAL", "REVIEWED_CANDIDATE"].includes(toStage) && experiments.length === 0) {
      throw new Error("Transition to " + toStage + " requires linked experiment evidence");
    }
    if (experiments.some(r => r.payload.strategy_key !== strategyKey)) throw new Error("Experiment evidence belongs to a different strategy version");
    if (toStage === "OUT_OF_SAMPLE" && !experiments.some(r => r.payload.gate === "out_of_sample" && r.payload.passed)) throw new Error("Out-of-sample gate has not passed");
    if (toStage === "WALK_FORWARD" && !experiments.some(r => r.payload.gate === "walk_forward" && r.payload.passed)) throw new Error("Walk-forward gate has not passed");
    if (toStage === "RED_TEAM_REVIEW" && !experiments.some(r => r.payload.gate === "red_team" && r.payload.passed)) throw new Error("Independent red-team gate has not passed");
    if (toStage === "PAPER_TRIAL" && !experiments.some(r => r.payload.gate === "paper_readiness" && r.payload.passed)) throw new Error("Paper-trial readiness gate has not passed");
    if (toStage === "REVIEWED_CANDIDATE" && !experiments.some(r => r.payload.gate === "paper_review" && r.payload.passed)) throw new Error("Paper-trial review gate has not passed");
    return this.#append("STAGE_TRANSITION", {
      strategy_key: strategyKey, from_stage: current, to_stage: toStage,
      evidence_record_ids: [...evidenceRecordIds], reviewer, rationale,
      note: "Research state only. This registry never authorises broker orders or live trading."
    });
  }
}

export const researchStages = [...STAGES];
