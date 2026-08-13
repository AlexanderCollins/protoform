# protoform-engine

Server-side [ProtoForm](https://github.com/AlexanderCollins/protoform) rule
engine. The same form schema your frontend renders is re-evaluated on the
server (visibility, conditional logic, validation) with semantics identical
to the TypeScript engine, verified by a shared conformance suite.

The core engine is **pure Python with zero dependencies**. Django and DRF are
optional integration layers.

```bash
pip install protoform-engine          # engine only, works anywhere (FastAPI, Flask, workers)
pip install protoform-engine[django]  # + model mapping helpers
pip install protoform-engine[drf]     # + ProtoFormView (GET schema / PATCH step / POST submit)
```

```python
from protoform import prepare_form, evaluate_rules, validate_step

prepared = prepare_form(schema)                      # resolve templates, build maps
result = evaluate_rules(prepared, values)            # derived state: visible/required/valid/messages
step = validate_step(prepared, values, "step_1")     # {"valid": bool, "errors": {...}}
```

See the [Django engine reference](../../docs/python.md) and the
[protocol specification](../../docs/spec.md).

MIT licensed.
