import { describe, expect, it } from "vitest";
import { SynapseAdapter } from "../src/base.js";
import { createIR } from "../src/ir.js";
import type { CanonicalIR } from "../src/types.js";
import { AdapterValidator, ValidationRule } from "../src/validator.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIR(overrides?: Partial<Omit<CanonicalIR, "clone">>): CanonicalIR {
  return createIR({
    irId: "ir-val-001",
    schemaVersion: "1.0",
    taskHeader: { taskId: "t-val-001", taskType: "extraction", domain: "legal" },
    payload: { content: "test" },
    provenance: [],
    ...overrides,
  });
}

class GoodAdapter extends SynapseAdapter<string, string> {
  readonly modelId = "good-model-v1";
  readonly adapterVersion = "1.2.3";
  ingress(ir: CanonicalIR) {
    return ir.payload.content ?? "";
  }
  egress(output: string, originalIr: CanonicalIR, latencyMs: number): CanonicalIR {
    const updated = originalIr.clone();
    updated.payload.data = { result: output };
    updated.provenance.push(this.buildProvenance(0.9, latencyMs));
    return updated;
  }
}

const validator = new AdapterValidator();

// ── Rule 1: NO_NETWORK_CALLS ──────────────────────────────────────────────────

describe("NO_NETWORK_CALLS", () => {
  it("passes for clean source code", () => {
    const report = validator.validate({ sourceCode: 'import { something } from "./local.js";' });
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS)!;
    expect(result.passed).toBe(true);
  });

  it("fails for axios import", () => {
    const report = validator.validate({ sourceCode: 'import axios from "axios";' });
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS)!;
    expect(result.passed).toBe(false);
  });

  it("fails for node-fetch import", () => {
    const report = validator.validate({ sourceCode: 'import fetch from "node-fetch";' });
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS)!;
    expect(result.passed).toBe(false);
  });

  it("fails for got import", () => {
    const report = validator.validate({ sourceCode: 'import got from "got";' });
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS)!;
    expect(result.passed).toBe(false);
  });

  it("fails for require('axios')", () => {
    const report = validator.validate({ sourceCode: "const axios = require('axios');" });
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS)!;
    expect(result.passed).toBe(false);
  });

  it("skips rule when sourceCode is absent", () => {
    const report = validator.validate({});
    const result = report.results.find((r) => r.rule === ValidationRule.NO_NETWORK_CALLS);
    expect(result).toBeUndefined();
  });
});

// ── Rule 2: MODEL_ID_REQUIRED ─────────────────────────────────────────────────

describe("MODEL_ID_REQUIRED", () => {
  it("passes for a valid modelId", () => {
    const report = validator.validate({ adapter: new GoodAdapter() });
    const result = report.results.find((r) => r.rule === ValidationRule.MODEL_ID_REQUIRED)!;
    expect(result.passed).toBe(true);
  });

  it("fails for empty modelId", () => {
    const bad = new GoodAdapter();
    Object.defineProperty(bad, "modelId", { value: "" });
    const report = validator.validate({ adapter: bad });
    const result = report.results.find((r) => r.rule === ValidationRule.MODEL_ID_REQUIRED)!;
    expect(result.passed).toBe(false);
  });

  it("skips rule when adapter is absent", () => {
    const report = validator.validate({});
    const result = report.results.find((r) => r.rule === ValidationRule.MODEL_ID_REQUIRED);
    expect(result).toBeUndefined();
  });
});

// ── Rule 3: ADAPTER_VERSION_SEMVER ────────────────────────────────────────────

describe("ADAPTER_VERSION_SEMVER", () => {
  it("passes for valid semver", () => {
    const report = validator.validate({ adapter: new GoodAdapter() });
    const result = report.results.find((r) => r.rule === ValidationRule.ADAPTER_VERSION_SEMVER)!;
    expect(result.passed).toBe(true);
  });

  it("passes for semver with pre-release tag", () => {
    const bad = new GoodAdapter();
    Object.defineProperty(bad, "adapterVersion", { value: "2.0.0-beta.1" });
    const report = validator.validate({ adapter: bad });
    const result = report.results.find((r) => r.rule === ValidationRule.ADAPTER_VERSION_SEMVER)!;
    expect(result.passed).toBe(true);
  });

  it("fails for non-semver version", () => {
    const bad = new GoodAdapter();
    Object.defineProperty(bad, "adapterVersion", { value: "v1.2" });
    const report = validator.validate({ adapter: bad });
    const result = report.results.find((r) => r.rule === ValidationRule.ADAPTER_VERSION_SEMVER)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 4: IR_ID_PRESENT ─────────────────────────────────────────────────────

describe("IR_ID_PRESENT", () => {
  it("passes for non-empty irId", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.IR_ID_PRESENT)!;
    expect(result.passed).toBe(true);
  });

  it("fails for empty irId", () => {
    const report = validator.validate({ inputIr: makeIR({ irId: "" }) });
    const result = report.results.find((r) => r.rule === ValidationRule.IR_ID_PRESENT)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 5: SCHEMA_VERSION_PRESENT ───────────────────────────────────────────

describe("SCHEMA_VERSION_PRESENT", () => {
  it("passes for non-empty schemaVersion", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.SCHEMA_VERSION_PRESENT)!;
    expect(result.passed).toBe(true);
  });

  it("fails for empty schemaVersion", () => {
    const report = validator.validate({ inputIr: makeIR({ schemaVersion: "" }) });
    const result = report.results.find((r) => r.rule === ValidationRule.SCHEMA_VERSION_PRESENT)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 6: TASK_HEADER_COMPLETE ──────────────────────────────────────────────

describe("TASK_HEADER_COMPLETE", () => {
  it("passes for complete taskHeader", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.TASK_HEADER_COMPLETE)!;
    expect(result.passed).toBe(true);
  });

  it("fails when taskId is missing", () => {
    const ir = makeIR({ taskHeader: { taskId: "", taskType: "extraction", domain: "legal" } });
    const report = validator.validate({ inputIr: ir });
    const result = report.results.find((r) => r.rule === ValidationRule.TASK_HEADER_COMPLETE)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 7: TASK_TYPE_VALID ───────────────────────────────────────────────────

describe("TASK_TYPE_VALID", () => {
  it("passes for a known taskType", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.TASK_TYPE_VALID)!;
    expect(result.passed).toBe(true);
  });

  it("fails for an unknown taskType", () => {
    const ir = makeIR({
      taskHeader: { taskId: "t", taskType: "unknown-type" as never, domain: "legal" },
    });
    const report = validator.validate({ inputIr: ir });
    const result = report.results.find((r) => r.rule === ValidationRule.TASK_TYPE_VALID)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 8: DOMAIN_VALID ──────────────────────────────────────────────────────

describe("DOMAIN_VALID", () => {
  it("passes for a known domain", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.DOMAIN_VALID)!;
    expect(result.passed).toBe(true);
  });

  it("fails for an unknown domain", () => {
    const ir = makeIR({
      taskHeader: { taskId: "t", taskType: "extraction", domain: "space" as never },
    });
    const report = validator.validate({ inputIr: ir });
    const result = report.results.find((r) => r.rule === ValidationRule.DOMAIN_VALID)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 9: CONFIDENCE_IN_RANGE ───────────────────────────────────────────────

describe("CONFIDENCE_IN_RANGE", () => {
  const goodEntry = {
    modelId: "m",
    adapterVersion: "1.0.0",
    confidence: 0.75,
    latencyMs: 100,
    timestamp: new Date().toISOString(),
  };

  it("passes for confidence = 0.75", () => {
    const report = validator.validate({ provenanceEntry: goodEntry });
    const result = report.results.find((r) => r.rule === ValidationRule.CONFIDENCE_IN_RANGE)!;
    expect(result.passed).toBe(true);
  });

  it("passes for boundary confidence = 0.0", () => {
    const report = validator.validate({ provenanceEntry: { ...goodEntry, confidence: 0 } });
    const result = report.results.find((r) => r.rule === ValidationRule.CONFIDENCE_IN_RANGE)!;
    expect(result.passed).toBe(true);
  });

  it("passes for boundary confidence = 1.0", () => {
    const report = validator.validate({ provenanceEntry: { ...goodEntry, confidence: 1 } });
    const result = report.results.find((r) => r.rule === ValidationRule.CONFIDENCE_IN_RANGE)!;
    expect(result.passed).toBe(true);
  });

  it("fails for confidence > 1", () => {
    const report = validator.validate({ provenanceEntry: { ...goodEntry, confidence: 1.01 } });
    const result = report.results.find((r) => r.rule === ValidationRule.CONFIDENCE_IN_RANGE)!;
    expect(result.passed).toBe(false);
  });

  it("fails for negative confidence", () => {
    const report = validator.validate({ provenanceEntry: { ...goodEntry, confidence: -0.1 } });
    const result = report.results.find((r) => r.rule === ValidationRule.CONFIDENCE_IN_RANGE)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 10: LATENCY_NON_NEGATIVE ────────────────────────────────────────────

describe("LATENCY_NON_NEGATIVE", () => {
  const base = {
    modelId: "m",
    adapterVersion: "1.0.0",
    confidence: 0.8,
    latencyMs: 100,
    timestamp: new Date().toISOString(),
  };

  it("passes for positive latency", () => {
    const report = validator.validate({ provenanceEntry: base });
    const result = report.results.find((r) => r.rule === ValidationRule.LATENCY_NON_NEGATIVE)!;
    expect(result.passed).toBe(true);
  });

  it("passes for zero latency", () => {
    const report = validator.validate({ provenanceEntry: { ...base, latencyMs: 0 } });
    const result = report.results.find((r) => r.rule === ValidationRule.LATENCY_NON_NEGATIVE)!;
    expect(result.passed).toBe(true);
  });

  it("fails for negative latency", () => {
    const report = validator.validate({ provenanceEntry: { ...base, latencyMs: -1 } });
    const result = report.results.find((r) => r.rule === ValidationRule.LATENCY_NON_NEGATIVE)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 11: COST_NON_NEGATIVE ────────────────────────────────────────────────

describe("COST_NON_NEGATIVE", () => {
  const base = {
    modelId: "m",
    adapterVersion: "1.0.0",
    confidence: 0.8,
    latencyMs: 100,
    timestamp: new Date().toISOString(),
  };

  it("passes (warning) when costUsd is absent", () => {
    const report = validator.validate({ provenanceEntry: base });
    const result = report.results.find((r) => r.rule === ValidationRule.COST_NON_NEGATIVE)!;
    expect(result.passed).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("passes for costUsd = 0", () => {
    const report = validator.validate({ provenanceEntry: { ...base, costUsd: 0 } });
    const result = report.results.find((r) => r.rule === ValidationRule.COST_NON_NEGATIVE)!;
    expect(result.passed).toBe(true);
  });

  it("fails for negative costUsd", () => {
    const report = validator.validate({ provenanceEntry: { ...base, costUsd: -0.01 } });
    const result = report.results.find((r) => r.rule === ValidationRule.COST_NON_NEGATIVE)!;
    expect(result.passed).toBe(false);
  });
});

// ── Rule 12: PROVENANCE_APPENDED ──────────────────────────────────────────────

describe("PROVENANCE_APPENDED", () => {
  it("passes when egress added one entry", () => {
    const adapter = new GoodAdapter();
    const inputIr = makeIR();
    const outputIr = adapter.egress("result", inputIr, 100);
    const report = validator.validate({ inputIr, outputIr });
    const result = report.results.find((r) => r.rule === ValidationRule.PROVENANCE_APPENDED)!;
    expect(result.passed).toBe(true);
  });

  it("fails when output has the same number of entries as input", () => {
    const inputIr = makeIR();
    const outputIr = inputIr.clone(); // no new entry
    const report = validator.validate({ inputIr, outputIr });
    const result = report.results.find((r) => r.rule === ValidationRule.PROVENANCE_APPENDED)!;
    expect(result.passed).toBe(false);
  });

  it("skips rule when inputIr or outputIr is missing", () => {
    const report = validator.validate({ inputIr: makeIR() });
    const result = report.results.find((r) => r.rule === ValidationRule.PROVENANCE_APPENDED);
    expect(result).toBeUndefined();
  });
});

// ── Rule 13: EGRESS_PRESERVES_TASK_HEADER ─────────────────────────────────────

describe("EGRESS_PRESERVES_TASK_HEADER", () => {
  it("passes when taskId is unchanged", () => {
    const adapter = new GoodAdapter();
    const inputIr = makeIR();
    const outputIr = adapter.egress("result", inputIr, 100);
    const report = validator.validate({ inputIr, outputIr });
    const result = report.results.find(
      (r) => r.rule === ValidationRule.EGRESS_PRESERVES_TASK_HEADER,
    )!;
    expect(result.passed).toBe(true);
  });

  it("fails when taskId is mutated", () => {
    const inputIr = makeIR();
    const outputIr = inputIr.clone();
    (outputIr.taskHeader as { taskId: string }).taskId = "mutated";
    const report = validator.validate({ inputIr, outputIr });
    const result = report.results.find(
      (r) => r.rule === ValidationRule.EGRESS_PRESERVES_TASK_HEADER,
    )!;
    expect(result.passed).toBe(false);
  });
});

// ── ValidationReport.valid flag ───────────────────────────────────────────────

describe("ValidationReport.valid", () => {
  it("is true when all error rules pass", () => {
    const adapter = new GoodAdapter();
    const inputIr = makeIR();
    const outputIr = adapter.egress("result", inputIr, 100);
    const lastProv = outputIr.provenance.at(-1)!;
    const report = validator.validate({
      adapter,
      sourceCode: 'import { SynapseAdapter } from "../src/base.js";',
      inputIr,
      outputIr,
      provenanceEntry: lastProv,
    });
    expect(report.valid).toBe(true);
  });

  it("is false when any error rule fails", () => {
    const bad = new GoodAdapter();
    Object.defineProperty(bad, "modelId", { value: "" });
    const report = validator.validate({ adapter: bad });
    expect(report.valid).toBe(false);
  });

  it("reports exactly 13 rules when all context is provided", () => {
    const adapter = new GoodAdapter();
    const inputIr = makeIR();
    const outputIr = adapter.egress("result", inputIr, 100);
    const lastProv = outputIr.provenance.at(-1)!;
    const report = validator.validate({
      adapter,
      sourceCode: "const x = 1;",
      inputIr,
      outputIr,
      provenanceEntry: lastProv,
    });
    expect(report.results).toHaveLength(13);
  });
});
