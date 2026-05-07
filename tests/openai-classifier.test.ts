import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  OpenAIClassifierAdapter,
  type ClauseExtractorOutput,
} from "../src/adapters/openai-classifier.js";
import { createIR } from "../src/ir.js";
import { AdapterValidator } from "../src/validator.js";
import { ALL_FIXTURES } from "./fixtures.js";

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeCompletion(
  content: string,
  promptTokens = 100,
  completionTokens = 20,
): ClauseExtractorOutput {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1_700_000_000,
    model: "gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content, refusal: null },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  } as unknown as ClauseExtractorOutput;
}

function makeClient() {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(
          makeCompletion('{"label":"contract","confidence":0.92}'),
        ),
      },
    },
  } as unknown as OpenAI;
}

const LABELS = ["contract", "invoice", "memo", "nda"];

const ADAPTER_SOURCE = fs.readFileSync(
  path.resolve(
    path.dirname(url.fileURLToPath(import.meta.url)),
    "../src/adapters/openai-classifier.ts",
  ),
  "utf-8",
);

// ── Identity ──────────────────────────────────────────────────────────────────

describe("OpenAIClassifierAdapter — identity", () => {
  it("has correct modelId", () => {
    const adapter = new OpenAIClassifierAdapter(makeClient(), LABELS);
    expect(adapter.modelId).toBe("openai/gpt-4o-mini-classifier");
  });

  it("has correct adapterVersion (semver)", () => {
    const adapter = new OpenAIClassifierAdapter(makeClient(), LABELS);
    expect(adapter.adapterVersion).toBe("1.0.0");
  });

  it("stores the injected client", () => {
    const client = makeClient();
    const adapter = new OpenAIClassifierAdapter(client, LABELS);
    expect(adapter.client).toBe(client);
  });
});

// ── ingress ───────────────────────────────────────────────────────────────────

describe("OpenAIClassifierAdapter.ingress()", () => {
  let adapter: OpenAIClassifierAdapter;

  beforeEach(() => {
    adapter = new OpenAIClassifierAdapter(makeClient(), LABELS);
  });

  it("requests json_object response format", () => {
    const ir = createIR({
      irId: "ir-1",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-1", taskType: "classification", domain: "general" },
      payload: { content: "Classify this text." },
      provenance: [],
    });
    const input = adapter.ingress(ir);
    expect(input.response_format).toEqual({ type: "json_object" });
  });

  it("includes all labels in the system message", () => {
    const ir = createIR({
      irId: "ir-2",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-2", taskType: "classification", domain: "legal" },
      payload: { content: "Some legal text." },
      provenance: [],
    });
    const input = adapter.ingress(ir);
    const sysMsg = input.messages.find((m) => m.role === "system");
    for (const label of LABELS) {
      expect(sysMsg?.content).toContain(label);
    }
  });

  it("puts IR content in the user message", () => {
    const ir = createIR({
      irId: "ir-3",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-3", taskType: "classification", domain: "general" },
      payload: { content: "The quick brown fox." },
      provenance: [],
    });
    const input = adapter.ingress(ir);
    const userMsg = input.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("The quick brown fox.");
  });

  it("uses empty string when payload.content is absent", () => {
    const ir = createIR({
      irId: "ir-4",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-4", taskType: "classification", domain: "general" },
      payload: {},
      provenance: [],
    });
    const input = adapter.ingress(ir);
    const userMsg = input.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("");
  });

  it("uses custom system prompt when provided", () => {
    const custom = "Custom classifier instructions.";
    const customAdapter = new OpenAIClassifierAdapter(makeClient(), LABELS, custom);
    const ir = createIR({
      irId: "ir-5",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-5", taskType: "classification", domain: "general" },
      payload: { content: "text" },
      provenance: [],
    });
    const input = customAdapter.ingress(ir);
    const sysMsg = input.messages.find((m) => m.role === "system");
    expect(sysMsg?.content).toContain(custom);
  });

  it("specifies the gpt-4o-mini model name", () => {
    const ir = createIR({
      irId: "ir-6",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-6", taskType: "classification", domain: "general" },
      payload: { content: "text" },
      provenance: [],
    });
    expect(adapter.ingress(ir).model).toBe("gpt-4o-mini");
  });
});

// ── egress ────────────────────────────────────────────────────────────────────

describe("OpenAIClassifierAdapter.egress()", () => {
  let adapter: OpenAIClassifierAdapter;
  let baseIr: ReturnType<typeof createIR>;

  beforeEach(() => {
    adapter = new OpenAIClassifierAdapter(makeClient(), LABELS);
    baseIr = createIR({
      irId: "ir-egress",
      schemaVersion: "1.0",
      taskHeader: { taskId: "t-egress", taskType: "classification", domain: "general" },
      payload: { content: "Classify me." },
      provenance: [],
    });
  });

  it("does not mutate the original IR", () => {
    adapter.egress(makeCompletion('{"label":"memo","confidence":0.8}'), baseIr, 100);
    expect(baseIr.provenance).toHaveLength(0);
    expect(baseIr.payload.data).toBeUndefined();
  });

  it("stores label and confidence in payload.data", () => {
    const out = adapter.egress(makeCompletion('{"label":"nda","confidence":0.77}'), baseIr, 100);
    expect(out.payload.data).toMatchObject({ label: "nda", confidence: 0.77 });
  });

  it("stores token_count from usage.total_tokens in payload.data", () => {
    const out = adapter.egress(makeCompletion('{"label":"nda","confidence":0.77}', 80, 25), baseIr, 100);
    expect((out.payload.data as Record<string, unknown>)["token_count"]).toBe(105);
  });

  it("estimates cost_usd using gpt-4o-mini input + output pricing", () => {
    // 1000 prompt @ $0.15/M + 200 completion @ $0.60/M = $0.00015 + $0.00012 = $0.00027
    const out = adapter.egress(makeCompletion('{"label":"contract","confidence":0.9}', 1000, 200), baseIr, 150);
    const prov = out.provenance[0]!;
    expect(prov.costUsd).toBeCloseTo(0.00027, 8);
  });

  it("sets costUsd to 0 when usage is absent", () => {
    const noUsage = { ...makeCompletion('{"label":"contract","confidence":0.9}'), usage: undefined } as unknown as ClauseExtractorOutput;
    const out = adapter.egress(noUsage, baseIr, 100);
    expect(out.provenance[0]!.costUsd).toBe(0);
  });

  it("appends exactly one provenance entry", () => {
    const out = adapter.egress(makeCompletion('{"label":"invoice","confidence":0.88}'), baseIr, 200);
    expect(out.provenance).toHaveLength(1);
  });

  it("preserves taskHeader taskId after egress", () => {
    const out = adapter.egress(makeCompletion('{"label":"memo","confidence":0.6}'), baseIr, 50);
    expect(out.taskHeader.taskId).toBe("t-egress");
  });

  it("sets modelId and adapterVersion in provenance", () => {
    const out = adapter.egress(makeCompletion('{"label":"memo","confidence":0.6}'), baseIr, 50);
    const prov = out.provenance[0]!;
    expect(prov.modelId).toBe("openai/gpt-4o-mini-classifier");
    expect(prov.adapterVersion).toBe("1.0.0");
  });

  it("clamps confidence to [0, 1]", () => {
    const out = adapter.egress(makeCompletion('{"label":"contract","confidence":1.5}'), baseIr, 50);
    expect(out.provenance[0]!.confidence).toBe(1.0);
  });

  it("records a valid ISO timestamp in provenance", () => {
    const out = adapter.egress(makeCompletion('{"label":"memo","confidence":0.7}'), baseIr, 50);
    const ts = out.provenance[0]!.timestamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  // G-S04: PII propagation
  describe("G-S04 — pii_present propagation", () => {
    it("propagates pii_present=true from input payload", () => {
      const piiIr = createIR({
        irId: "ir-pii",
        schemaVersion: "1.0",
        taskHeader: { taskId: "t-pii", taskType: "extraction", domain: "legal" },
        payload: { content: "John Smith signed.", pii_present: true },
        provenance: [],
      });
      const out = adapter.egress(makeCompletion('{"label":"nda","confidence":0.9}'), piiIr, 80);
      expect(out.payload["pii_present"]).toBe(true);
    });

    it("does not add pii_present when input has none", () => {
      const out = adapter.egress(makeCompletion('{"label":"memo","confidence":0.8}'), baseIr, 80);
      expect(out.payload["pii_present"]).toBeUndefined();
    });
  });

  // Malformed JSON handling
  describe("malformed JSON response", () => {
    it("sets confidence=0.0 on JSON parse error", () => {
      const out = adapter.egress(makeCompletion("not json at all"), baseIr, 100);
      expect(out.provenance[0]!.confidence).toBe(0.0);
    });

    it("sets confidence=0.0 when fields are missing", () => {
      const out = adapter.egress(makeCompletion('{"wrong":"field"}'), baseIr, 100);
      expect(out.provenance[0]!.confidence).toBe(0.0);
    });

    it("appends warning to provenance metadata on parse error", () => {
      const out = adapter.egress(makeCompletion("not json at all"), baseIr, 100);
      const meta = out.provenance[0]!.metadata as Record<string, unknown> | undefined;
      expect(typeof meta?.["warning"]).toBe("string");
    });

    it("appends warning when label/confidence fields are wrong type", () => {
      const out = adapter.egress(makeCompletion('{"label":42,"confidence":"high"}'), baseIr, 100);
      const meta = out.provenance[0]!.metadata as Record<string, unknown> | undefined;
      expect(typeof meta?.["warning"]).toBe("string");
    });

    it("stores empty label in payload.data on error", () => {
      const out = adapter.egress(makeCompletion("{invalid"), baseIr, 100);
      expect((out.payload.data as Record<string, unknown>)["label"]).toBe("");
    });
  });
});

// ── AdapterValidator — all 20 standard fixtures ───────────────────────────────

describe("AdapterValidator — 20 standard fixtures", () => {
  const validator = new AdapterValidator();
  const adapter = new OpenAIClassifierAdapter(makeClient(), LABELS);

  const validOutput = makeCompletion('{"label":"contract","confidence":0.91}');

  it.each(ALL_FIXTURES)("passes for $name", ({ ir }) => {
    const outputIr = adapter.egress(validOutput, ir, 150);
    const report = validator.validate({
      adapter,
      sourceCode: ADAPTER_SOURCE,
      inputIr: ir,
      outputIr,
      provenanceEntry: outputIr.provenance.at(-1),
    });

    if (!report.valid) {
      const failures = report.results
        .filter((r) => r.severity === "error" && !r.passed)
        .map((r) => `${r.rule}: ${r.message}`)
        .join("\n");
      throw new Error(`Validation failed:\n${failures}`);
    }

    expect(report.valid).toBe(true);
  });

  it("covers all 20 fixtures", () => {
    expect(ALL_FIXTURES).toHaveLength(20);
  });
});
