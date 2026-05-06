import type { CanonicalIR, ProvenanceEntry } from "./types.js";

/**
 * Root base class providing the `buildProvenance` helper.
 * All adapters ultimately extend this class.
 */
export abstract class AdapterBase {
  /** Identifier of the underlying model or service. */
  abstract readonly modelId: string;

  /** Semantic version of this adapter implementation. */
  abstract readonly adapterVersion: string;

  /**
   * Constructs a {@link ProvenanceEntry} pre-populated with this adapter's
   * identity fields and a UTC timestamp.
   *
   * @param confidence - Output confidence score in [0, 1].
   * @param latencyMs  - Wall-clock latency of the adapter call in milliseconds.
   * @param opts       - Optional overrides for any ProvenanceEntry field.
   */
  protected buildProvenance(
    confidence: number,
    latencyMs: number,
    opts?: Partial<ProvenanceEntry>,
  ): ProvenanceEntry {
    return {
      modelId: this.modelId,
      adapterVersion: this.adapterVersion,
      confidence,
      latencyMs,
      timestamp: new Date().toISOString(),
      ...opts,
    };
  }
}

/**
 * Generic adapter contract for the Synapse IR pipeline.
 *
 * Subclass this, implement `ingress` and `egress`, declare `modelId` and
 * `adapterVersion`, then use `this.buildProvenance()` when building the
 * updated IR inside `egress`.
 *
 * @typeParam TInput  - Model/service-specific input shape.
 * @typeParam TOutput - Model/service-specific output shape.
 *
 * @example
 * ```ts
 * export class MyAdapter extends SynapseAdapter<MyInput, MyOutput> {
 *   readonly modelId = "my-model-v1";
 *   readonly adapterVersion = "1.0.0";
 *
 *   ingress(ir: CanonicalIR): MyInput { ... }
 *
 *   egress(output: MyOutput, originalIr: CanonicalIR, latencyMs: number): CanonicalIR {
 *     const updated = originalIr.clone();
 *     updated.payload.data = output.result;
 *     updated.provenance.push(this.buildProvenance(output.score, latencyMs));
 *     return updated;
 *   }
 * }
 * ```
 */
export abstract class SynapseAdapter<TInput, TOutput> extends AdapterBase {
  abstract override readonly modelId: string;
  abstract override readonly adapterVersion: string;

  /**
   * Transforms a {@link CanonicalIR} into the model/service-specific input
   * format.
   *
   * @param ir - Incoming canonical IR.
   */
  abstract ingress(ir: CanonicalIR): TInput;

  /**
   * Transforms model/service output back into a {@link CanonicalIR}, appending
   * a provenance entry.
   *
   * @param output     - Raw output from the model or service.
   * @param originalIr - The IR that was passed to `ingress`.
   * @param latencyMs  - Wall-clock time elapsed during the model call.
   */
  abstract egress(output: TOutput, originalIr: CanonicalIR, latencyMs: number): CanonicalIR;
}
