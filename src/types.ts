// §1 schema — canonical IR interfaces and const unions

/** All recognized task categories. */
export const TASK_TYPES = [
  "extraction",
  "classification",
  "generation",
  "summarization",
  "routing",
  "validation",
  "transformation",
  "qa",
  "translation",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** All recognized domain verticals. */
export const DOMAINS = [
  "legal",
  "medical",
  "financial",
  "technical",
  "general",
  "compliance",
  "hr",
  "science",
] as const;
export type Domain = (typeof DOMAINS)[number];

/** A named entity extracted from payload content. */
export interface Entity {
  text: string;
  type?: string;
  confidence?: number;
  startOffset?: number;
  endOffset?: number;
}

/** Free-form payload carried through the pipeline. */
export interface Payload {
  content?: string;
  entities?: Entity[];
  /** Structured adapter output — written by egress. */
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Routing and classification metadata attached to every IR. */
export interface TaskHeader {
  taskId: string;
  taskType: TaskType;
  domain: Domain;
  priority?: number;
  metadata?: Record<string, unknown>;
}

/** Immutable audit record appended by each adapter. */
export interface ProvenanceEntry {
  modelId: string;
  adapterVersion: string;
  confidence: number;
  latencyMs: number;
  costUsd?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** The canonical intermediate representation passed between adapters. */
export interface CanonicalIR {
  irId: string;
  schemaVersion: string;
  taskHeader: TaskHeader;
  payload: Payload;
  provenance: ProvenanceEntry[];
  /** Returns a deep copy that is safe to mutate. */
  clone(): CanonicalIR;
}
