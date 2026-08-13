# @protoform/adapter-daisyui

DaisyUI adapter for [ProtoForm](https://github.com/AlexanderCollins/protoform), the schema-driven form
protocol with identical client and server validation.

Renders ProtoForm fields, containers, and steppers with DaisyUI component classes. Follows the active DaisyUI theme.

```bash
npm install @protoform/core @protoform/react @protoform/adapter-daisyui
```

```tsx
import { ProtoForm } from "@protoform/react";
import adapter from "@protoform/adapter-daisyui";

<ProtoForm schema={schema} adapter={adapter} onSubmit={handleSubmit} />
```

An adapter is four functions (`renderField`, `renderContainer`,
`renderForm`, optional `renderStepper`). Writing one for another UI kit is
a modest job. Adapter guide: https://github.com/AlexanderCollins/protoform/blob/main/docs/adapters.md

MIT licensed.
