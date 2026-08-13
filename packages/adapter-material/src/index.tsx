import React, { useState, useRef } from "react";
import type { ProtoFormAdapter, FieldRenderProps, ContainerRenderProps, FormRenderProps } from "@protoform/react";
import { HTML_INPUT_TYPES } from "@protoform/react";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import Radio from "@mui/material/Radio";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import FormHelperText from "@mui/material/FormHelperText";
import Box from "@mui/material/Box";

function MaterialFileDropzone({ id, value, setValue, disabled, accept, multiple, hasError }: {
  id: string; value: any; setValue: (v: any) => void; disabled?: boolean; accept?: string; multiple?: boolean; hasError?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const files: { name: string }[] = Array.isArray(value) ? value : [];

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || disabled) return;
    const arr = Array.from(fileList);
    setValue(multiple ? arr : arr.slice(0, 1));
  };

  return (
    <Box sx={{ mb: 2 }}>
      <div
        style={{
          border: `2px dashed ${dragOver ? "#1976d2" : hasError ? "#d32f2f" : "#bdbdbd"}`,
          borderRadius: "8px", padding: "24px", textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
          transition: "border-color 0.2s",
          backgroundColor: dragOver ? "#e3f2fd" : undefined,
        }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <Typography variant="body2" color="text.secondary">Drop files here or click to browse</Typography>
        {accept && <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5 }}>{accept}</Typography>}
      </div>
      <input ref={inputRef} id={id} type="file" style={{ display: "none" }} onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} accept={accept} multiple={multiple} disabled={disabled} />
      {files.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 1 }}>
          {files.map((f, i) => (
            <Typography key={i} variant="caption" sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: "action.hover" }}>{f.name || `File ${i + 1}`}</Typography>
          ))}
        </Box>
      )}
      {hasError && <FormHelperText error>This field is required</FormHelperText>}
    </Box>
  );
}

function renderField(props: FieldRenderProps): React.ReactNode {
  const { id, field, value, setValue, disabled, required, readOnly, messages, showErrors } = props;
  const errorMessages = showErrors ? messages.filter((m) => m.type === "error") : [];
  const hasError = errorMessages.length > 0;
  const errorMsg = errorMessages[0]?.message;

  switch (field.meta.type) {
    case "checkbox":
      return (
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Checkbox checked={Boolean(value)} onChange={(e) => setValue(e.target.checked)} disabled={disabled} />
            }
            label={field.meta.label}
          />
          {errorMsg && <FormHelperText error>{errorMsg}</FormHelperText>}
        </Box>
      );
    case "select": {
      const options = field.meta.properties?.options || [];
      return (
        <TextField
          id={id}
          select
          label={field.meta.label}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          required={required}
          error={hasError}
          helperText={errorMsg || field.meta.description}
          fullWidth
          sx={{ mb: 2 }}
          slotProps={{ input: { readOnly } }}
        >
          {options.map((opt: any) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label || opt.value}</MenuItem>
          ))}
        </TextField>
      );
    }
    case "textarea":
      return (
        <TextField
          id={id}
          label={field.meta.label}
          value={value || ""}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          required={required}
          error={hasError}
          helperText={errorMsg || field.meta.description}
          fullWidth
          multiline
          rows={4}
          sx={{ mb: 2 }}
          slotProps={{ input: { readOnly } }}
          placeholder={field.meta.properties?.placeholder}
        />
      );
    case "file": {
      const fileProps = field.meta.properties || {};
      return (
        <Box sx={{ mb: 2 }}>
          {field.meta.label && (
            <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
              {field.meta.label}
              {required && <span style={{ color: "#d32f2f" }}> *</span>}
            </Typography>
          )}
          {field.meta.description && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>{field.meta.description}</Typography>}
          <MaterialFileDropzone id={id} value={value} setValue={setValue} disabled={disabled} accept={fileProps.accept} multiple={fileProps.multiple} hasError={hasError} />
        </Box>
      );
    }
    case "radio": {
      const options = field.meta.properties?.options || [];
      return (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 0.5 }}>{field.meta.label}{required ? " *" : ""}</Typography>
          {options.map((opt: any) => (
            <FormControlLabel
              key={String(opt.value)}
              control={<Radio checked={value === opt.value} onChange={() => setValue(opt.value)} disabled={disabled} name={id} />}
              label={opt.label || String(opt.value)}
            />
          ))}
          {hasError && errorMessages.map((msg, i) => <FormHelperText key={i} error>{msg.message}</FormHelperText>)}
        </Box>
      );
    }
    case "multiselect": {
      const options = field.meta.properties?.options || [];
      const selected: any[] = Array.isArray(value) ? value : [];
      return (
        <Box sx={{ mb: 2 }} data-field-type="multiselect">
          <Typography variant="body2" sx={{ mb: 0.5 }}>{field.meta.label}{required ? " *" : ""}</Typography>
          {options.map((opt: any) => (
            <FormControlLabel
              key={String(opt.value)}
              control={
                <Checkbox
                  checked={selected.some((x) => x === opt.value)}
                  onChange={(e) => setValue(e.target.checked ? [...selected, opt.value] : selected.filter((x) => x !== opt.value))}
                  disabled={disabled}
                  name={id}
                />
              }
              label={opt.label || String(opt.value)}
            />
          ))}
          {hasError && errorMessages.map((msg, i) => <FormHelperText key={i} error>{msg.message}</FormHelperText>)}
        </Box>
      );
    }
    default:
      return (
        <TextField
          id={id}
          type={field.meta.type === "number" ? "number" : HTML_INPUT_TYPES[field.meta.type] ?? "text"}
          label={field.meta.label}
          value={field.meta.type === "number" ? (value ?? "") : (value || "")}
          onChange={(e) => {
            if (field.meta.type === "number") { const n = parseFloat(e.target.value); setValue(isNaN(n) ? "" : n); }
            else { setValue(e.target.value); }
          }}
          disabled={disabled}
          required={required}
          error={hasError}
          helperText={errorMsg || field.meta.description}
          fullWidth
          sx={{ mb: 2 }}
          slotProps={{
            input: { readOnly },
            inputLabel: field.meta.type === "date" ? { shrink: true } : undefined,
          }}
          placeholder={field.meta.properties?.placeholder}
        />
      );
  }
}

function renderContainer(props: ContainerRenderProps): React.ReactNode {
  const { container, isComplete, children } = props;
  return (
    <Card sx={{ mb: 3 }} variant="outlined">
      <CardContent>
        {container.meta.title && (
          <Typography variant="h6" gutterBottom>
            {container.meta.title}
            {isComplete && <Typography component="span" sx={{ ml: 1, color: "success.main" }}>✓</Typography>}
          </Typography>
        )}
        {container.meta.sub_title && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{container.meta.sub_title}</Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function renderForm(props: FormRenderProps): React.ReactNode {
  return <form onSubmit={(e) => { e.preventDefault(); props.onSubmit(); }}>{props.children}</form>;
}

export const materialAdapter: ProtoFormAdapter = { renderField, renderContainer, renderForm };
export default materialAdapter;
