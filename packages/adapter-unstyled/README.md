# @protoform/adapter-unstyled

Plain HTML with BEM class names adapter for [ProtoForm](https://github.com/AlexanderCollins/protoform), the schema-driven form
protocol with identical client and server validation.

The reference adapter. Semantic, unstyled markup you can style with your own CSS, and a starting point for writing new adapters.

```bash
npm install @protoform/core @protoform/react @protoform/adapter-unstyled
```

```tsx
import { ProtoForm } from "@protoform/react";
import adapter from "@protoform/adapter-unstyled";

<ProtoForm schema={schema} adapter={adapter} onSubmit={handleSubmit} />
```

An adapter is four functions (`renderField`, `renderContainer`,
`renderForm`, optional `renderStepper`). Writing one for another UI kit is
a modest job. Adapter guide: https://github.com/AlexanderCollins/protoform/blob/main/docs/adapters.md

MIT licensed.
