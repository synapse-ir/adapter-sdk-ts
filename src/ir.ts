import type { CanonicalIR, Payload, ProvenanceEntry, TaskHeader } from "./types.js";

// IR fields are always plain JSON-serializable data — JSON round-trip is a
// safe, zero-dependency deep clone that works across all target environments.
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Concrete mutable implementation of {@link CanonicalIR}. */
export class CanonicalIRImpl implements CanonicalIR {
  irId: string;
  schemaVersion: string;
  taskHeader: TaskHeader;
  payload: Payload;
  provenance: ProvenanceEntry[];

  constructor(data: Omit<CanonicalIR, "clone">) {
    this.irId = data.irId;
    this.schemaVersion = data.schemaVersion;
    this.taskHeader = data.taskHeader;
    this.payload = data.payload;
    this.provenance = data.provenance;
  }

  clone(): CanonicalIR {
    return new CanonicalIRImpl({
      irId: this.irId,
      schemaVersion: this.schemaVersion,
      taskHeader: deepClone(this.taskHeader),
      payload: deepClone(this.payload),
      provenance: deepClone(this.provenance),
    });
  }
}

/**
 * Factory for creating {@link CanonicalIR} instances.
 *
 * @param data - IR fields minus the `clone` method.
 */
export function createIR(data: Omit<CanonicalIR, "clone">): CanonicalIR {
  return new CanonicalIRImpl(data);
}
