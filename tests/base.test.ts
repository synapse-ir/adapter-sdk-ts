import { describe, expect, it, vi } from "vitest";
import { SynapseAdapter } from "../src/base.js";
import { createIR } from "../src/ir.js";
import type { CanonicalIR, ProvenanceEntry } from "../src/types.js";

// ── Concrete test adapter ─────────────────────────────────────────────────────

interface TestInput {
  text: string;
  score: number;
}

interface TestOutput {
  result: string;
  confidence: number;
  costUsd?: number;
}

class TestAdapter extends SynapseAdapter<TestInput, TestOutput> {
  readonly modelId = "test-model-v1";
  readonly adapterVersion = "2.3.1";

  ingress(ir: CanonicalIR): TestInput {
    return {
      text: ir.payload.content ?? "",
      score: ir.provenance.at(-1)?.confidence ?? 1.0,
    };
  }

  egress(output: TestOutput, originalIr: CanonicalIR, latencyMs: number): CanonicalIR {
    const updated = originalIr.clone();
    updated.payload.data = { result: output.result };
    updated.provenance.push(
      this.buildProvenance(output.confidence, latencyMs, {
        costUsd: output.costUsd,
      }),
    );
    return updated;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIR(): CanonicalIR {
  return createIR({
    irId: "ir-test-001",
    schemaVersion: "1.0",
    taskHeader: { taskId: "t-001", taskType: "extraction", domain: "legal" },
    payload: { content: "Contract text" },
    provenance: [],
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SynapseAdapter identity fields", () => {
  it("exposes modelId", () => {
    const adapter = new TestAdapter();
    expect(adapter.modelId).toBe("test-model-v1");
  });

  it("exposes adapterVersion", () => {
    const adapter = new TestAdapter();
    expect(adapter.adapterVersion).toBe("2.3.1");
  });
});

describe("AdapterBase.buildProvenance()", () => {
  it("returns a ProvenanceEntry with correct identity fields", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const output: TestOutput = { result: "extracted", confidence: 0.87 };
    const outputIr = adapter.egress(output, ir, 120);
    const prov = outputIr.provenance[0] as ProvenanceEntry;

    expect(prov.modelId).toBe("test-model-v1");
    expect(prov.adapterVersion).toBe("2.3.1");
    expect(prov.confidence).toBe(0.87);
    expect(prov.latencyMs).toBe(120);
  });

  it("sets a valid ISO timestamp", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5 }, ir, 50);
    const prov = outputIr.provenance[0] as ProvenanceEntry;
    expect(() => new Date(prov.timestamp)).not.toThrow();
    expect(new Date(prov.timestamp).toISOString()).toBe(prov.timestamp);
  });

  it("spreads optional costUsd when provided", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5, costUsd: 0.002 }, ir, 80);
    const prov = outputIr.provenance[0] as ProvenanceEntry;
    expect(prov.costUsd).toBe(0.002);
  });

  it("omits costUsd when not provided", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5 }, ir, 80);
    const prov = outputIr.provenance[0] as ProvenanceEntry;
    expect(prov.costUsd).toBeUndefined();
  });

  it("timestamp is close to current time", () => {
    const before = Date.now();
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5 }, ir, 10);
    const after = Date.now();
    const prov = outputIr.provenance[0] as ProvenanceEntry;
    const ts = new Date(prov.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 50);
  });
});

describe("SynapseAdapter.ingress()", () => {
  it("maps IR fields to model input", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const input = adapter.ingress(ir);
    expect(input.text).toBe("Contract text");
    expect(input.score).toBe(1.0);
  });

  it("uses last provenance confidence as score", () => {
    const adapter = new TestAdapter();
    const ir = createIR({
      irId: "ir-002",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-002", taskType: "extraction", domain: "legal" },
      payload: { content: "text" },
      provenance: [
        {
          modelId: "prev",
          adapterVersion: "0.1.0",
          confidence: 0.72,
          latencyMs: 30,
          timestamp: new Date().toISOString(),
        },
      ],
    });
    const input = adapter.ingress(ir);
    expect(input.score).toBe(0.72);
  });
});

describe("SynapseAdapter.egress()", () => {
  it("does not mutate the original IR", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    adapter.egress({ result: "x", confidence: 0.5 }, ir, 100);
    expect(ir.provenance).toHaveLength(0);
    expect(ir.payload.data).toBeUndefined();
  });

  it("writes structured data into payload.data", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "extracted-text", confidence: 0.9 }, ir, 200);
    expect(outputIr.payload.data).toEqual({ result: "extracted-text" });
  });

  it("appends exactly one provenance entry", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5 }, ir, 50);
    expect(outputIr.provenance).toHaveLength(1);
  });

  it("preserves taskHeader from original IR", () => {
    const adapter = new TestAdapter();
    const ir = makeIR();
    const outputIr = adapter.egress({ result: "x", confidence: 0.5 }, ir, 50);
    expect(outputIr.taskHeader.taskId).toBe("t-001");
    expect(outputIr.taskHeader.taskType).toBe("extraction");
    expect(outputIr.taskHeader.domain).toBe("legal");
  });
});

describe("ClauseExtractor example pattern", () => {
  // Mirrors the §2.3.3 example exactly
  interface ClauseExtractorInput {
    input_text: string;
    entity_hints: string[];
    prior_score: number;
    domain_ctx: string;
  }
  interface ClauseExtractorOutput {
    clauses: { text: string; type: string; confidence: number }[];
    score: number;
    cost_usd?: number;
  }

  class ClauseExtractorAdapter extends SynapseAdapter<
    ClauseExtractorInput,
    ClauseExtractorOutput
  > {
    readonly modelId = "clause-ext-v1.4";
    readonly adapterVersion = "1.0.3";

    ingress(ir: CanonicalIR): ClauseExtractorInput {
      const lastProv = ir.provenance.at(-1);
      return {
        input_text: ir.payload.content ?? "",
        entity_hints: (ir.payload.entities ?? []).map((e) => e.text),
        prior_score: lastProv?.confidence ?? 1.0,
        domain_ctx: ir.taskHeader.domain,
      };
    }

    egress(
      output: ClauseExtractorOutput,
      originalIr: CanonicalIR,
      latencyMs: number,
    ): CanonicalIR {
      const updated = originalIr.clone();
      updated.payload.data = { clauses: output.clauses };
      updated.provenance.push(
        this.buildProvenance(output.score, latencyMs, { costUsd: output.cost_usd }),
      );
      return updated;
    }
  }

  it("runs the clause extractor end-to-end", () => {
    const adapter = new ClauseExtractorAdapter();
    expect(adapter.modelId).toBe("clause-ext-v1.4");
    expect(adapter.adapterVersion).toBe("1.0.3");

    const ir = createIR({
      irId: "ir-clause-001",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-clause-001", taskType: "extraction", domain: "legal" },
      payload: {
        content: "The vendor shall deliver goods by 2026-06-01.",
        entities: [{ text: "vendor" }, { text: "goods" }],
      },
      provenance: [],
    });

    const input = adapter.ingress(ir);
    expect(input.input_text).toBe("The vendor shall deliver goods by 2026-06-01.");
    expect(input.entity_hints).toEqual(["vendor", "goods"]);
    expect(input.prior_score).toBe(1.0);
    expect(input.domain_ctx).toBe("legal");

    const mockOutput: ClauseExtractorOutput = {
      clauses: [{ text: "deliver goods", type: "obligation", confidence: 0.93 }],
      score: 0.93,
      cost_usd: 0.001,
    };

    const now = vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-05-06T00:00:00.000Z");
    const outputIr = adapter.egress(mockOutput, ir, 250);
    now.mockRestore();

    expect(outputIr.payload.data).toEqual({
      clauses: [{ text: "deliver goods", type: "obligation", confidence: 0.93 }],
    });
    expect(outputIr.provenance).toHaveLength(1);
    expect(outputIr.provenance[0]).toEqual({
      modelId: "clause-ext-v1.4",
      adapterVersion: "1.0.3",
      confidence: 0.93,
      latencyMs: 250,
      costUsd: 0.001,
      timestamp: "2026-05-06T00:00:00.000Z",
    });
    // Original IR is untouched
    expect(ir.provenance).toHaveLength(0);
    expect(ir.payload.data).toBeUndefined();
  });
});
