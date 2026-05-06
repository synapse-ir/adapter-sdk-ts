// Public surface of @synapse-ir/adapter-sdk

export type {
  CanonicalIR,
  Domain,
  Entity,
  Payload,
  ProvenanceEntry,
  TaskHeader,
  TaskType,
} from "./types.js";
export { DOMAINS, TASK_TYPES } from "./types.js";

export { createIR } from "./ir.js";

export { AdapterBase, SynapseAdapter } from "./base.js";

export type {
  Severity,
  ValidationReport,
  ValidationResult,
  ValidationRuleId,
  ValidatorContext,
} from "./validator.js";
export { AdapterValidator, ValidationRule } from "./validator.js";

export { CalendarBuffer, RouteCache } from "./cache.js";
