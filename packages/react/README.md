# @protoform/react

React bindings for [ProtoForm](https://github.com/AlexanderCollins/protoform), the schema-driven form protocol
with identical client and server validation.

Renders a ProtoForm schema with live conditional logic and validation.
Rendering is delegated to a pluggable adapter (Tailwind, DaisyUI, plain
HTML, or your own). Includes hooks for custom layouts and custom fields,
a server error channel, and a devMode debug overlay.

```bash
npm install @protoform/core @protoform/react @protoform/adapter-daisyui
```

```tsx
import { ProtoForm } from "@protoform/react";
import { daisyuiAdapter } from "@protoform/adapter-daisyui";

<ProtoForm schema={schema} adapter={daisyuiAdapter} onSubmit={handleSubmit} />
```

Hooks: `useProtoForm`, `useFieldState`, `useContainerState`,
`useFormErrors`. Adapter contract and customization guide: https://github.com/AlexanderCollins/protoform

MIT licensed.
