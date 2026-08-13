# @protoform/adapter-shadcn

shadcn/ui conventions adapter for [ProtoForm](https://github.com/AlexanderCollins/protoform), the schema-driven form
protocol with identical client and server validation.

Community-maintained. Ships as-is and welcomes contributors.

```bash
npm install @protoform/core @protoform/react @protoform/adapter-shadcn
```

```tsx
import { ProtoForm } from "@protoform/react";
import adapter from "@protoform/adapter-shadcn";

<ProtoForm schema={schema} adapter={adapter} onSubmit={handleSubmit} />
```

An adapter is four functions (`renderField`, `renderContainer`,
`renderForm`, optional `renderStepper`). Writing one for another UI kit is
a modest job. Adapter guide: https://github.com/AlexanderCollins/protoform/blob/main/docs/adapters.md

MIT licensed.
