# @synapse-ir/adapter-sdk

TypeScript adapter SDK for the SYNAPSE canonical IR ecosystem.

> **Status**: In development. Phase 2 target.  
> Python SDK: [synapse-ir/adapter-sdk](https://github.com/synapse-ir/adapter-sdk)

## Install

```bash
npm install @synapse-ir/adapter-sdk
# or
pnpm add @synapse-ir/adapter-sdk
```

## Write your first adapter

```typescript
import { SynapseAdapter } from "@synapse-ir/adapter-sdk";
import type { CanonicalIR } from "@synapse-ir/adapter-sdk";

interface MyModelInput { input: string; }
interface MyModelOutput { result: string; score: number; }

export class MyModelAdapter
  extends SynapseAdapter<MyModelInput, MyModelOutput> {

  readonly modelId = "my-org/my-model-v1.0";
  readonly adapterVersion = "1.0.0";

  ingress(ir: CanonicalIR): MyModelInput {
    return { input: ir.payload.content ?? "" };
  }

  egress(output: MyModelOutput, originalIr: CanonicalIR, latencyMs: number): CanonicalIR {
    const updated = originalIr.clone();
    updated.provenance.push(this.buildProvenance(output.score, latencyMs));
    return updated;
  }
}
```

## Documentation

- [Adapter SDK (Python)](https://github.com/synapse-ir/adapter-sdk)
- [Canonical IR specification](https://github.com/synapse-ir/spec)

## License

MIT. See [LICENSE](LICENSE).
