// src/components/BedroomSelector.js
import React from "react";
// import "./BedroomSelector.css";   ← delete this line, the styles live in App.css now

export default function BedroomSelector({ value, onChange }) {
  const opts = [null, 1, 2, 3, 4, 5];          // null = “Alle”
  return (
    <div className="bedroom-bar">
      {opts.map((n) => (
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
