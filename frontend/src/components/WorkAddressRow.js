import React from "react";
import { MODE_OPTIONS }      from "../constants/filterOptions";
import { ISO_COLORS }        from "../constants/colors";

export default function WorkAddressRow({
  row, idx, onPick, onChange, onRemove, onAdd, isLast,
}) {
  return (
    <div className="entry-block">
      {/* line 1 --------------------------------------------------------- */}
      <div className="form-group">
        <button type="button" className="btn-pin" onClick={() => onPick(idx)}>
          📍
        </button>

        <input
          className="input-address"
          placeholder="Arbeidsadresse"
          value={row.address}
          required
          onChange={e => onChange(idx, { address: e.target.value, lat: null, lon: null })}
        />

        {/* coloured dot */}
        <span style={{
          width: 12, height: 12, borderRadius: "50%",
          background: ISO_COLORS[idx % ISO_COLORS.length], marginLeft: 6,
        }} />

        <input
          type="number" min="1" max="120"
          className="input-time"
          value={row.time}
          onChange={e => onChange(idx, { time: e.target.value })}
        />
        <span className="label-min">min</span>

        <select
          className="select-mode commute-mode"
          value={row.mode}
          onChange={e => onChange(idx, { mode: e.target.value })}
        >
          {MODE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* line 2 --------------------------------------------------------- */}
      <div className="form-group">
        {isLast && (
          <button type="button" className="btn-add" onClick={onAdd}>
            + adresse
          </button>
        )}
        {onRemove && (
          <button type="button" className="btn-remove" onClick={() => onRemove(idx)}>
            – adresse
          </button>
        )}
      </div>
    </div>
  );
}
