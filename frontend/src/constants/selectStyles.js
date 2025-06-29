// central spot for the dark-theme React-Select overrides
export const selectStyles = {
  control:        base => ({ ...base, background: "#2c2c2c", borderColor: "#444", minHeight: 38 }),
  menu:           base => ({ ...base, background: "#2c2c2c" }),
  option:         (base, s) => ({ ...base, background: s.isFocused ? "#333" : "inherit", ":active": { background: "#555" } }),
  multiValue:     base => ({ ...base, background: "#444" }),
  multiValueLabel:base => ({ ...base, color: "#e0e0e0" }),
  multiValueRemove:base=>({ ...base, ":hover": { background: "#666" } }),
  placeholder:    base => ({ ...base, color: "#888" }),
  singleValue:    base => ({ ...base, color: "#e0e0e0" }),
  input:          base => ({ ...base, color: "#e0e0e0" }),
};