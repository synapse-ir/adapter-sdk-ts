import type { AdapterBase } from "./base.js";
import type { CanonicalIR, ProvenanceEntry } from "./types.js";
import { DOMAINS, TASK_TYPES } from "./types.js";

/** The 13 validation rule identifiers mirroring the Python SDK. */
export const ValidationRule = {
  /** Adapter source must not import any network library. */
  NO_NETWORK_CALLS: "NO_NETWORK_CALLS",
  /** `modelId` must be a non-empty string. */
  MODEL_ID_REQUIRED: "MODEL_ID_REQUIRED",
  /** `adapterVersion` must be a valid semver string. */
  ADAPTER_VERSION_SEMVER: "ADAPTER_VERSION_SEMVER",
  /** `irId` must be a non-empty string. */
  IR_ID_PRESENT: "IR_ID_PRESENT",
  /** `schemaVersion` must be a non-empty string. */
  SCHEMA_VERSION_PRESENT: "SCHEMA_VERSION_PRESENT",
  /** `taskHeader` must contain `taskId`, `taskType`, and `domain`. */
  TASK_HEADER_COMPLETE: "TASK_HEADER_COMPLETE",
  /** `taskType` must be one of the known {@link TaskType} values. */
  TASK_TYPE_VALID: "TASK_TYPE_VALID",
  /** `domain` must be one of the known {@link Domain} values. */
  DOMAIN_VALID: "DOMAIN_VALID",
  /** `ProvenanceEntry.confidence` must be in [0.0, 1.0]. */
  CONFIDENCE_IN_RANGE: "CONFIDENCE_IN_RANGE",
  /** `ProvenanceEntry.latencyMs` must be ≥ 0. */
  LATENCY_NON_NEGATIVE: "LATENCY_NON_NEGATIVE",
  /** `ProvenanceEntry.costUsd` must be ≥ 0 when provided. */
  COST_NON_NEGATIVE: "COST_NON_NEGATIVE",
  /** Egress output must have more provenance entries than the input IR. */
  PROVENANCE_APPENDED: "PROVENANCE_APPENDED",
  /** Egress must not alter `taskHeader.taskId`. */
  EGRESS_PRESERVES_TASK_HEADER: "EGRESS_PRESERVES_TASK_HEADER",
} as const;

export type ValidationRuleId = (typeof ValidationRule)[keyof typeof ValidationRule];

export type Severity = "error" | "warning";

export interface ValidationResult {
  rule: ValidationRuleId;
  passed: boolean;
  severity: Severity;
  message: string;
  details?: unknown;
}

export interface ValidationReport {
  /** `true` when every error-severity rule passed. */
  valid: boolean;
  results: ValidationResult[];
}

/** Input context supplied to the validator. */
export interface ValidatorContext {
  /** Adapter instance — required for identity rules. */
  adapter?: AdapterBase;
  /** Raw TypeScript/JavaScript source of the adapter file — required for {@link ValidationRule.NO_NETWORK_CALLS}. */
  sourceCode?: string;
  /** IR before egress — required for egress-diff rules. */
  inputIr?: CanonicalIR;
  /** IR returned by egress — required for egress-diff rules. */
  outputIr?: CanonicalIR;
  /** A provenance entry to validate in isolation. */
  provenanceEntry?: ProvenanceEntry;
}

// Network library patterns that flag a NO_NETWORK_CALLS violation.
const NETWORK_IMPORT_PATTERNS: RegExp[] = [
  /\bimport\b[^'"]*['"]node-fetch['"]/,
  /\bimport\b[^'"]*['"]axios['"]/,
  /\bimport\b[^'"]*['"]got['"]/,
  /\bimport\b[^'"]*['"]undici['"]/,
  /\bimport\b[^'"]*['"]superagent['"]/,
  /\bimport\b[^'"]*['"]request['"]/,
  /\brequire\s*\(\s*['"]node-fetch['"]\s*\)/,
  /\brequire\s*\(\s*['"]axios['"]\s*\)/,
  /\brequire\s*\(\s*['"]got['"]\s*\)/,
  // Detects bare `import fetch from` (not node built-in globalThis.fetch)
  /\bimport\s+fetch\b/,
];

const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

type RuleFn = (ctx: ValidatorContext) => ValidationResult | null;

/**
 * Validates adapter correctness against 13 rules that mirror the Python SDK.
 *
 * Rules are categorised by the context they need:
 * - **Static rules** require an `adapter` instance.
 * - **Source rules** require `sourceCode`.
 * - **IR rules** require `inputIr` / `outputIr`.
 * - **Provenance rules** require `provenanceEntry` (or are inferred from `outputIr`).
 *
 * Any rule whose required context is absent is skipped (not counted as a failure).
 *
 * @example
 * ```ts
 * const validator = new AdapterValidator();
 *
 * // Static + source check
 * const report = validator.validate({ adapter: myAdapter, sourceCode: adapterSrc });
 *
 * // Full egress check (include provenance from the appended entry)
 * const egressReport = validator.validate({
 *   adapter: myAdapter,
 *   inputIr,
 *   outputIr,
 *   provenanceEntry: outputIr.provenance.at(-1),
 * });
 * ```
 */
export class AdapterValidator {
  private readonly ruleFns: Map<ValidationRuleId, RuleFn>;

  constructor() {
    this.ruleFns = new Map<ValidationRuleId, RuleFn>([
      [ValidationRule.NO_NETWORK_CALLS, this.ruleNoNetworkCalls.bind(this)],
      [ValidationRule.MODEL_ID_REQUIRED, this.ruleModelIdRequired.bind(this)],
      [ValidationRule.ADAPTER_VERSION_SEMVER, this.ruleAdapterVersionSemver.bind(this)],
      [ValidationRule.IR_ID_PRESENT, this.ruleIrIdPresent.bind(this)],
      [ValidationRule.SCHEMA_VERSION_PRESENT, this.ruleSchemaVersionPresent.bind(this)],
      [ValidationRule.TASK_HEADER_COMPLETE, this.ruleTaskHeaderComplete.bind(this)],
      [ValidationRule.TASK_TYPE_VALID, this.ruleTaskTypeValid.bind(this)],
      [ValidationRule.DOMAIN_VALID, this.ruleDomainValid.bind(this)],
      [ValidationRule.CONFIDENCE_IN_RANGE, this.ruleConfidenceInRange.bind(this)],
      [ValidationRule.LATENCY_NON_NEGATIVE, this.ruleLatencyNonNegative.bind(this)],
      [ValidationRule.COST_NON_NEGATIVE, this.ruleCostNonNegative.bind(this)],
      [ValidationRule.PROVENANCE_APPENDED, this.ruleProvenanceAppended.bind(this)],
      [ValidationRule.EGRESS_PRESERVES_TASK_HEADER, this.ruleEgressPreservesTaskHeader.bind(this)],
    ]);
  }

  /**
   * Runs all applicable rules against the supplied context and returns a
   * {@link ValidationReport}.
   */
  validate(context: ValidatorContext): ValidationReport {
    const results: ValidationResult[] = [];

    for (const ruleFn of this.ruleFns.values()) {
      const result = ruleFn(context);
      if (result !== null) results.push(result);
    }

    const valid = results
      .filter((r) => r.severity === "error")
      .every((r) => r.passed);

    return { valid, results };
  }

  // ── Rule implementations ────────────────────────────────────────────────────

  private ruleNoNetworkCalls(ctx: ValidatorContext): ValidationResult | null {
    if (!ctx.sourceCode) return null;

    const matched = NETWORK_IMPORT_PATTERNS.find((re) => re.test(ctx.sourceCode!));
    return {
      rule: ValidationRule.NO_NETWORK_CALLS,
      passed: matched === undefined,
      severity: "error",
      message: matched
        ? `Adapter source contains a forbidden network import matching ${matched.toString()}`
        : "No forbidden network imports detected",
      details: matched ? { pattern: matched.toString() } : undefined,
    };
  }

  private ruleModelIdRequired(ctx: ValidatorContext): ValidationResult | null {
    if (!ctx.adapter) return null;
    const ok = typeof ctx.adapter.modelId === "string" && ctx.adapter.modelId.trim().length > 0;
    return {
      rule: ValidationRule.MODEL_ID_REQUIRED,
      passed: ok,
      severity: "error",
      message: ok ? "modelId is present" : "modelId must be a non-empty string",
    };
  }

  private ruleAdapterVersionSemver(ctx: ValidatorContext): ValidationResult | null {
    if (!ctx.adapter) return null;
    const ok = SEMVER_RE.test(ctx.adapter.adapterVersion);
    return {
      rule: ValidationRule.ADAPTER_VERSION_SEMVER,
      passed: ok,
      severity: "error",
      message: ok
        ? `adapterVersion "${ctx.adapter.adapterVersion}" is valid semver`
        : `adapterVersion "${ctx.adapter.adapterVersion}" is not valid semver (expected MAJOR.MINOR.PATCH)`,
    };
  }

  private ruleIrIdPresent(ctx: ValidatorContext): ValidationResult | null {
    const ir = ctx.outputIr ?? ctx.inputIr;
    if (!ir) return null;
    const ok = typeof ir.irId === "string" && ir.irId.trim().length > 0;
    return {
      rule: ValidationRule.IR_ID_PRESENT,
      passed: ok,
      severity: "error",
      message: ok ? "irId is present" : "irId must be a non-empty string",
    };
  }

  private ruleSchemaVersionPresent(ctx: ValidatorContext): ValidationResult | null {
    const ir = ctx.outputIr ?? ctx.inputIr;
    if (!ir) return null;
    const ok = typeof ir.schemaVersion === "string" && ir.schemaVersion.trim().length > 0;
    return {
      rule: ValidationRule.SCHEMA_VERSION_PRESENT,
      passed: ok,
      severity: "error",
      message: ok ? "schemaVersion is present" : "schemaVersion must be a non-empty string",
    };
  }

  private ruleTaskHeaderComplete(ctx: ValidatorContext): ValidationResult | null {
    const ir = ctx.outputIr ?? ctx.inputIr;
    if (!ir) return null;
    const { taskId, taskType, domain } = ir.taskHeader;
    const ok =
      typeof taskId === "string" &&
      taskId.length > 0 &&
      typeof taskType === "string" &&
      taskType.length > 0 &&
      typeof domain === "string" &&
      domain.length > 0;
    return {
      rule: ValidationRule.TASK_HEADER_COMPLETE,
      passed: ok,
      severity: "error",
      message: ok
        ? "taskHeader is complete"
        : "taskHeader must have non-empty taskId, taskType, and domain",
    };
  }

  private ruleTaskTypeValid(ctx: ValidatorContext): ValidationResult | null {
    const ir = ctx.outputIr ?? ctx.inputIr;
    if (!ir) return null;
    const ok = (TASK_TYPES as readonly string[]).includes(ir.taskHeader.taskType);
    return {
      rule: ValidationRule.TASK_TYPE_VALID,
      passed: ok,
      severity: "error",
      message: ok
        ? `taskType "${ir.taskHeader.taskType}" is valid`
        : `taskType "${ir.taskHeader.taskType}" is not a known TaskType`,
      details: ok ? undefined : { known: TASK_TYPES },
    };
  }

  private ruleDomainValid(ctx: ValidatorContext): ValidationResult | null {
    const ir = ctx.outputIr ?? ctx.inputIr;
    if (!ir) return null;
    const ok = (DOMAINS as readonly string[]).includes(ir.taskHeader.domain);
    return {
      rule: ValidationRule.DOMAIN_VALID,
      passed: ok,
      severity: "error",
      message: ok
        ? `domain "${ir.taskHeader.domain}" is valid`
        : `domain "${ir.taskHeader.domain}" is not a known Domain`,
      details: ok ? undefined : { known: DOMAINS },
    };
  }

  private ruleConfidenceInRange(ctx: ValidatorContext): ValidationResult | null {
    const entry = ctx.provenanceEntry;
    if (!entry) return null;
    const ok = entry.confidence >= 0 && entry.confidence <= 1;
    return {
      rule: ValidationRule.CONFIDENCE_IN_RANGE,
      passed: ok,
      severity: "error",
      message: ok
        ? `confidence ${entry.confidence} is in [0, 1]`
        : `confidence ${entry.confidence} is outside [0, 1]`,
    };
  }

  private ruleLatencyNonNegative(ctx: ValidatorContext): ValidationResult | null {
    const entry = ctx.provenanceEntry;
    if (!entry) return null;
    const ok = entry.latencyMs >= 0;
    return {
      rule: ValidationRule.LATENCY_NON_NEGATIVE,
      passed: ok,
      severity: "error",
      message: ok
        ? `latencyMs ${entry.latencyMs} is ≥ 0`
        : `latencyMs ${entry.latencyMs} must be ≥ 0`,
    };
  }

  private ruleCostNonNegative(ctx: ValidatorContext): ValidationResult | null {
    const entry = ctx.provenanceEntry;
    if (!entry) return null;
    if (entry.costUsd === undefined) {
      return {
        rule: ValidationRule.COST_NON_NEGATIVE,
        passed: true,
        severity: "warning",
        message: "costUsd not provided (optional)",
      };
    }
    const ok = entry.costUsd >= 0;
    return {
      rule: ValidationRule.COST_NON_NEGATIVE,
      passed: ok,
      severity: "error",
      message: ok
        ? `costUsd ${entry.costUsd} is ≥ 0`
        : `costUsd ${entry.costUsd} must be ≥ 0`,
    };
  }

  private ruleProvenanceAppended(ctx: ValidatorContext): ValidationResult | null {
    if (!ctx.inputIr || !ctx.outputIr) return null;
    const added = ctx.outputIr.provenance.length - ctx.inputIr.provenance.length;
    const ok = added >= 1;
    return {
      rule: ValidationRule.PROVENANCE_APPENDED,
      passed: ok,
      severity: "error",
      message: ok
        ? `egress appended ${added} provenance entry/entries`
        : "egress must append at least one provenance entry",
      details: {
        inputCount: ctx.inputIr.provenance.length,
        outputCount: ctx.outputIr.provenance.length,
      },
    };
  }

  private ruleEgressPreservesTaskHeader(ctx: ValidatorContext): ValidationResult | null {
    if (!ctx.inputIr || !ctx.outputIr) return null;
    const ok = ctx.inputIr.taskHeader.taskId === ctx.outputIr.taskHeader.taskId;
    return {
      rule: ValidationRule.EGRESS_PRESERVES_TASK_HEADER,
      passed: ok,
      severity: "error",
      message: ok
        ? "taskId is unchanged after egress"
        : `taskId changed from "${ctx.inputIr.taskHeader.taskId}" to "${ctx.outputIr.taskHeader.taskId}"`,
    };
  }
}
