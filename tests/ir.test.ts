import { describe, expect, it } from "vitest";
import { createIR } from "../src/ir.js";
import type { CanonicalIR } from "../src/types.js";

function makeIR(overrides?: Partial<Omit<CanonicalIR, "clone">>): CanonicalIR {
  return createIR({
    irId: "ir-001",
    schemaVersion: "1.0",
    taskHeader: { taskId: "task-001", taskType: "extraction", domain: "legal" },
    payload: { content: "Hello world", entities: [{ text: "Clause A", type: "clause" }] },
    provenance: [],
    ...overrides,
  });
}

describe("createIR", () => {
  it("creates a CanonicalIR with the supplied fields", () => {
    const ir = makeIR();
    expect(ir.irId).toBe("ir-001");
    expect(ir.schemaVersion).toBe("1.0");
    expect(ir.taskHeader.taskId).toBe("task-001");
    expect(ir.taskHeader.taskType).toBe("extraction");
    expect(ir.taskHeader.domain).toBe("legal");
    expect(ir.payload.content).toBe("Hello world");
    expect(ir.provenance).toHaveLength(0);
  });
});

describe("CanonicalIR.clone()", () => {
  it("returns a new object (not the same reference)", () => {
    const ir = makeIR();
    const cloned = ir.clone();
    expect(cloned).not.toBe(ir);
  });

  it("deep-copies taskHeader — mutations do not affect the original", () => {
    const ir = makeIR();
    const cloned = ir.clone();
    (cloned.taskHeader as { taskId: string }).taskId = "mutated";
    expect(ir.taskHeader.taskId).toBe("task-001");
  });

  it("deep-copies payload — mutations do not affect the original", () => {
    const ir = makeIR();
    const cloned = ir.clone();
    cloned.payload.content = "mutated";
    expect(ir.payload.content).toBe("Hello world");
  });

  it("deep-copies provenance array — push on clone does not affect original", () => {
    const ir = makeIR({
      provenance: [
        {
          modelId: "m1",
          adapterVersion: "1.0.0",
          confidence: 0.9,
          latencyMs: 100,
          timestamp: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const cloned = ir.clone();
    cloned.provenance.push({
      modelId: "m2",
      adapterVersion: "1.0.0",
      confidence: 0.8,
      latencyMs: 50,
      timestamp: "2026-01-01T00:01:00.000Z",
    });
    expect(ir.provenance).toHaveLength(1);
    expect(cloned.provenance).toHaveLength(2);
  });

  it("deep-copies nested entity array", () => {
    const ir = makeIR();
    const cloned = ir.clone();
    cloned.payload.entities![0]!.text = "mutated";
    expect(ir.payload.entities![0]!.text).toBe("Clause A");
  });

  it("cloned IR retains all original field values", () => {
    const ir = makeIR();
    const cloned = ir.clone();
    expect(cloned.irId).toBe(ir.irId);
    expect(cloned.schemaVersion).toBe(ir.schemaVersion);
    expect(cloned.taskHeader).toEqual(ir.taskHeader);
    expect(cloned.payload).toEqual(ir.payload);
    expect(cloned.provenance).toEqual(ir.provenance);
  });
});
