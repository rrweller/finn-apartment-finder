import React from "react";

/* Geoapify mode ↔︎ label */
const MODES = [
  { value: "drive", label: "Car 🚗" },
  { value: "transit", label: "Transit 🚌" },
  { value: "bicycle", label: "Bike 🚴" },
  { value: "walk", label: "Walk 🚶" },
];

export default function InputForm({
  workLocs,
  setWorkLocs,
  kommune,
  setKommune,
  rent,
  setRent,
  onSearch,
  onPickMode,
}) {
  const addRow = () =>
    setWorkLocs([
      ...workLocs,
      { address: "", time: 20, mode: "drive" },
    ]);

  const updateRow = (idx, field, value) =>
    setWorkLocs((prev) =>
      prev.map((row, i) =>
        i === idx ? { ...row, [field]: value } : row
      )
    );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch();
  };

  return (
    <form className="form-wrap" onSubmit={handleSubmit}>
      {workLocs.map((row, idx) => (
        <div key={idx} style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            title="Pick on map"
            onClick={() => onPickMode(idx)}
          >
            📍
          </button>

          <input
            style={{ minWidth: "200px" }}
            placeholder="Work address"
            value={row.address}
            onChange={(e) =>
              updateRow(idx, "address", e.target.value)
            }
          />

          <input
            type="number"
            min="1"
            max="120"
            style={{ width: "55px" }}
            value={row.time}
            onChange={(e) =>
              updateRow(idx, "time", e.target.value)
            }
          />
          <span>min</span>

          <select
            value={row.mode}
            onChange={(e) =>
              updateRow(idx, "mode", e.target.value)
            }
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {idx === workLocs.length - 1 && (
            <button type="button" onClick={addRow}>
              + address
            </button>
          )}
        </div>
      ))}

      <select
        value={kommune}
        onChange={(e) => setKommune(e.target.value)}
      >
        <option>Oslo</option>
        <option>Bergen</option>
        <option>Trondheim</option>
        <option>Stavanger</option>
        <option>Fredrikstad</option>
      </select>

      <input
        type="number"
        min="1000"
        step="500"
        value={rent}
        onChange={(e) => setRent(e.target.value)}
      />
      <span>kr / mnd</span>

      <button type="submit">Search</button>
    </form>
  );
}
