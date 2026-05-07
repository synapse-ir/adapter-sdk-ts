/**
 * 20 standard CanonicalIR test fixtures mirroring the Python SDK fixture suite.
 * All irIds use deterministic UUIDs; all content strings are non-empty so the
 * classifier adapter has something to classify.
 */
import { createIR } from "../src/ir.js";
import type { CanonicalIR, ProvenanceEntry } from "../src/types.js";

function stubProvenance(n: number): ProvenanceEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    modelId: `stub-model-v${i + 1}`,
    adapterVersion: "0.1.0",
    confidence: 0.5 + i * 0.02,
    latencyMs: 30 + i * 5,
    timestamp: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  }));
}

const CONTENT_CONTRACT =
  "This agreement is entered into between Acme Corp and Beta LLC for the supply of widgets.";
const CONTENT_MEDICAL =
  "Patient presents with elevated creatinine levels. Recommend renal function panel.";
const CONTENT_INVOICE =
  "Invoice #INV-2026-001 for consulting services rendered in April 2026.";
const CONTENT_CODE =
  "The function calculates the Levenshtein distance between two strings iteratively.";
const CONTENT_ARTICLE =
  "Scientists discover novel enzyme that breaks down microplastics in seawater.";

/** 1 – minimal legal extraction */
export const LEGAL_EXTRACT_BASIC: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000001",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0001", taskType: "extraction", domain: "legal" },
  payload: { content: CONTENT_CONTRACT },
  provenance: [],
});

/** 2 – legal extraction with PII flag (G-S04) */
export const LEGAL_EXTRACT_PII: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000002",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0002",
    taskType: "extraction",
    domain: "legal",
    metadata: { pii_present: true },
  },
  payload: {
    content: "John Smith (SSN: 123-45-6789) signed the NDA on 2026-01-15.",
    pii_present: true,
  },
  provenance: [],
});

/** 3 – medical classification with HIPAA tags */
export const MEDICAL_CLASSIFY_HIPAA: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000003",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0003",
    taskType: "classification",
    domain: "medical",
    metadata: { compliance_tags: ["hipaa"], data_residency: "us-east-1" },
  },
  payload: { content: CONTENT_MEDICAL },
  provenance: [],
});

/** 4 – financial generation with SOX tags */
export const FINANCE_GENERATE_SOX: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000004",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0004",
    taskType: "generation",
    domain: "financial",
    metadata: { compliance_tags: ["sox", "pcaob"], retention_days: 2555 },
  },
  payload: { content: CONTENT_INVOICE },
  provenance: [],
});

/** 5 – technical summarization */
export const TECHNICAL_SUMMARIZE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000005",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0005", taskType: "summarization", domain: "technical" },
  payload: { content: CONTENT_CODE },
  provenance: [],
});

/** 6 – general routing */
export const GENERAL_ROUTE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000006",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0006",
    taskType: "routing",
    domain: "general",
    metadata: { latency_budget_ms: 500 },
  },
  payload: { content: "Route this document to the appropriate specialist team." },
  provenance: [],
});

/** 7 – compliance validation */
export const COMPLIANCE_VALIDATE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000007",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0007",
    taskType: "validation",
    domain: "compliance",
    metadata: { compliance_tags: ["gdpr", "ccpa"] },
  },
  payload: { content: "Validate this data processing agreement against GDPR Article 28." },
  provenance: [],
});

/** 8 – HR transformation */
export const HR_TRANSFORM: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000008",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0008", taskType: "transformation", domain: "hr" },
  payload: { content: "Convert this job description to standardised HR format." },
  provenance: [],
});

/** 9 – science Q&A */
export const SCIENCE_QA: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000009",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0009",
    taskType: "qa",
    domain: "science",
    metadata: { quality_floor: 0.85 },
  },
  payload: { content: CONTENT_ARTICLE },
  provenance: [],
});

/** 10 – general translation with language tags */
export const GENERAL_TRANSLATE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000010",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0010",
    taskType: "translation",
    domain: "general",
    metadata: { source_lang: "en", target_lang: "fr" },
  },
  payload: { content: "The court found in favour of the defendant." },
  provenance: [],
});

/** 11 – legal extraction with named entities pre-populated */
export const LEGAL_WITH_ENTITIES: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000011",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0011", taskType: "extraction", domain: "legal" },
  payload: {
    content: CONTENT_CONTRACT,
    entities: [
      { text: "Acme Corp", type: "ORG", confidence: 0.97 },
      { text: "Beta LLC", type: "ORG", confidence: 0.95 },
    ],
  },
  provenance: [],
});

/** 12 – general routing with 5 prior provenance entries */
export const RANK_WITH_5_PROVENANCE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000012",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0012", taskType: "routing", domain: "general" },
  payload: { content: "Determine the best adapter for this classification task." },
  provenance: stubProvenance(5),
});

/** 13 – extraction with 20 prior provenance entries (at soft chain limit) */
export const MAX_PROVENANCE_CHAIN: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000013",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0013", taskType: "extraction", domain: "general" },
  payload: { content: "Multi-stage extraction pipeline final stage." },
  provenance: stubProvenance(20),
});

/** 14 – routing with unconstrained latency budget (0 = no limit) */
export const ZERO_LATENCY_BUDGET: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000014",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0014",
    taskType: "routing",
    domain: "general",
    metadata: { latency_budget_ms: 0 },
  },
  payload: { content: "Low-priority batch routing request." },
  provenance: [],
});

/** 15 – routing with tight latency budget (10 ms) */
export const TIGHT_LATENCY_BUDGET: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000015",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0015",
    taskType: "routing",
    domain: "general",
    metadata: { latency_budget_ms: 10 },
  },
  payload: { content: "Real-time routing request with very tight SLA." },
  provenance: [],
});

/** 16 – compliance validation with full compliance tag set */
export const FULL_COMPLIANCE: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000016",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0016",
    taskType: "validation",
    domain: "compliance",
    metadata: {
      compliance_tags: ["gdpr", "ccpa", "hipaa", "sox", "pcaob", "pci-dss", "audit-trail"],
      data_residency: ["eu-west-1", "eu-central-1"],
      retention_days: 2555,
      purpose_limitation: "audit-only",
    },
  },
  payload: { content: "Validate this contract for all applicable regulatory requirements." },
  provenance: [],
});

/** 17 – financial transformation with pre-populated structured payload data */
export const STRUCTURED_PAYLOAD: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000017",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0017", taskType: "transformation", domain: "financial" },
  payload: {
    content: CONTENT_INVOICE,
    data: {
      invoice_number: "INV-2026-001",
      amount_usd: 12500.0,
      line_items: [{ description: "Consulting", hours: 50, rate: 250 }],
    },
  },
  provenance: [],
});

/** 18 – extraction with out-of-band context reference */
export const SESSION_WITH_CONTEXT_REF: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000018",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0018",
    taskType: "extraction",
    domain: "general",
    metadata: { context_ref: "s3://synapse-ctx/sessions/abc-123.json" },
  },
  payload: { content: "Extract key obligations from the attached document (see context_ref)." },
  provenance: [],
});

/** 19 – extraction with W3C traceparent for distributed tracing */
export const TRACE_CONTEXT_SET: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000019",
  schemaVersion: "1.0",
  taskHeader: {
    taskId: "task-0019",
    taskType: "extraction",
    domain: "technical",
    metadata: {
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    },
  },
  payload: { content: "Trace-instrumented extraction of API schema definitions." },
  provenance: [],
});

/** 20 – absolute minimum: only required fields, all optionals absent */
export const MINIMAL_VALID_IR: CanonicalIR = createIR({
  irId: "00000000-0000-4000-8000-000000000020",
  schemaVersion: "1.0",
  taskHeader: { taskId: "task-0020", taskType: "extraction", domain: "general" },
  payload: { content: "Minimal fixture." },
  provenance: [],
});

/** Ordered array of all 20 fixtures, mirroring the Python SDK ALL_FIXTURES list. */
export const ALL_FIXTURES: Array<{ name: string; ir: CanonicalIR }> = [
  { name: "LEGAL_EXTRACT_BASIC", ir: LEGAL_EXTRACT_BASIC },
  { name: "LEGAL_EXTRACT_PII", ir: LEGAL_EXTRACT_PII },
  { name: "MEDICAL_CLASSIFY_HIPAA", ir: MEDICAL_CLASSIFY_HIPAA },
  { name: "FINANCE_GENERATE_SOX", ir: FINANCE_GENERATE_SOX },
  { name: "TECHNICAL_SUMMARIZE", ir: TECHNICAL_SUMMARIZE },
  { name: "GENERAL_ROUTE", ir: GENERAL_ROUTE },
  { name: "COMPLIANCE_VALIDATE", ir: COMPLIANCE_VALIDATE },
  { name: "HR_TRANSFORM", ir: HR_TRANSFORM },
  { name: "SCIENCE_QA", ir: SCIENCE_QA },
  { name: "GENERAL_TRANSLATE", ir: GENERAL_TRANSLATE },
  { name: "LEGAL_WITH_ENTITIES", ir: LEGAL_WITH_ENTITIES },
  { name: "RANK_WITH_5_PROVENANCE", ir: RANK_WITH_5_PROVENANCE },
  { name: "MAX_PROVENANCE_CHAIN", ir: MAX_PROVENANCE_CHAIN },
  { name: "ZERO_LATENCY_BUDGET", ir: ZERO_LATENCY_BUDGET },
  { name: "TIGHT_LATENCY_BUDGET", ir: TIGHT_LATENCY_BUDGET },
  { name: "FULL_COMPLIANCE", ir: FULL_COMPLIANCE },
  { name: "STRUCTURED_PAYLOAD", ir: STRUCTURED_PAYLOAD },
  { name: "SESSION_WITH_CONTEXT_REF", ir: SESSION_WITH_CONTEXT_REF },
  { name: "TRACE_CONTEXT_SET", ir: TRACE_CONTEXT_SET },
  { name: "MINIMAL_VALID_IR", ir: MINIMAL_VALID_IR },
];
