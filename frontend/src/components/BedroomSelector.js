import React from "react";

export default function BedroomSelector({ value, onChange }) {
  const opts = [null, 1, 2, 3, 4, 5];
  return (
    <div className="bedroom-bar">
      {opts.map(n => (
        <button
          key={String(n)}
          type="button"
          className={value === n ? "bedroom-btn active" : "bedroom-btn"}
          onClick={() => onChange(n)}
        >
          {n === null ? "Alle" : `${n}+`}
        </button>
      ))}
    </div>
  );
}
