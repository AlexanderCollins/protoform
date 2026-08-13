# @protoform/core

The ProtoForm rule engine. Pure TypeScript, zero dependencies, no eval.

You describe a form as a JSON schema (fields, layout, rules). This package
turns that schema plus the current values into derived state: which fields
are visible, required, and valid, which messages to show, whether a step is
complete, and whether the form can progress. The same schema is evaluated
identically by the Python engine (`protoform-engine` on PyPI), verified by
a shared conformance suite.

```bash
npm install @protoform/core
```

```ts
import { prepareForm, evaluateRules, canProgress } from "@protoform/core";

const prepared = prepareForm(schema);
const { derived, progress } = evaluateRules(prepared, values);
canProgress(derived, values);
```

Rendering lives in `@protoform/react` and the adapter packages. Docs,
spec, and the conformance suite: https://github.com/AlexanderCollins/protoform

MIT licensed.
