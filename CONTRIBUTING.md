# Contributing to ProtoForm

Thanks for your interest. ProtoForm is a protocol first and a set of
implementations second, and that ordering drives how changes are accepted.

## The parity rule

ProtoForm ships two engines, TypeScript (`packages/core`) and Python
(`packages/python`), and they must produce identical derived state for the
same schema and values. The conformance suite verifies this by running both
engines over shared vectors and diffing the output.

Any change to evaluation behavior must:

1. Be implemented in both engines in the same PR.
2. Be covered by a conformance vector (`conformance/vectors/*.json`).
   Add cases that would have caught the divergence.
3. Update `docs/spec.md` if the observable behavior is part of the
   protocol.

A PR that changes one engine's behavior without the other will fail the
`parity` CI job. That job failing is the intended protection.

## Development setup

```bash
bun install && bun run build      # TypeScript packages + demo
bun run test                       # TS engine + React tests
pip install -e "packages/python[dev]"
python -m pytest packages/python/tests -q   # Python engine tests
bun run conformance                # cross-engine parity check
bun run dev                        # demo app
```

## Repository layout

| Path | What it is |
|---|---|
| `docs/spec.md` | The protocol, and the source of truth |
| `packages/core` | TypeScript engine (zero dependencies, no eval) |
| `packages/react` | React bindings + adapter contract |
| `packages/adapter-*` | UI adapters |
| `packages/python` | Python engine (zero-dep core; Django/DRF extras) |
| `conformance/` | Shared vectors + runners for both engines |
| `demo/` | Vite demo app |

## Proposing protocol changes

Open an issue describing the schema shape, the evaluation semantics, and
how both engines will implement them identically. A protocol addition is
ready when its semantics can be specified precisely enough to pass a
conformance vector. See `docs/roadmap.md` for designs already in flight
(repeaters, computed fields).

## Style

Match the code around you. No drive-by reformatting. Tests live in each
package's `tests/` directory.
