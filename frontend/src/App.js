// src/App.js
import React, { useState } from "react";
import MapView from "./components/MapView";

// Transport mode options
const MODE_OPTIONS = [
  { value: "drive",   label: "Car 🚗" },
  { value: "transit", label: "Transit 🚌" },
  { value: "bicycle", label: "Bike 🚴" },
  { value: "walk",    label: "Walk 🚶" },
];

// Boligtype options
const BOLIGTYPE_OPTIONS = [
  { value: "",                   label: "All types" },
  { value: "enebolig",           label: "Enebolig" },
  { value: "garasje/parkering",  label: "Garasje/Parkering" },
  { value: "hybel",              label: "Hybel" },
  { value: "leilighet",          label: "Leilighet" },
  { value: "rekkehus",           label: "Rekkehus" },
  { value: "rom i bofellesskap", label: "Rom i bofellesskap" },
  { value: "tomannsbolig",       label: "Tomannsbolig" },
  { value: "andre",              label: "Andre" },
];

const SHOW_QUERY_POLY = false;          // ⇦ turn to false to hide outline

export default function App() {
  /* ─── state ─────────────────────────────────────────────────────────── */
  const [workLocs, setWorkLocs] = useState([
    { address: "", time: 20, mode: "drive", lat: null, lon: null },
  ]);

  const [rentMin,   setRentMin]   = useState(0);
  const [rentMax,   setRentMax]   = useState(15000);
  const [sizeMin,   setSizeMin]   = useState(0);
  const [sizeMax,   setSizeMax]   = useState(0);
  const [boligtype, setBoligtype] = useState("");

  const [isolineData,   setIsolineData] = useState(null);
  const [listings,      setListings]    = useState([]);
  const [awaitingPickRow, setAwaitingPickRow] = useState(null);
  const [loading,       setLoading]      = useState(false);

  /* ─── handlers ──────────────────────────────────────────────────────── */
  const handleAddRow = () =>
    setWorkLocs((prev) => [
      ...prev,
      { address: "", time: 20, mode: "drive", lat: null, lon: null },
    ]);

  const handleRemoveRow = (idx) =>
    setWorkLocs((prev) => prev.filter((_, i) => i !== idx));

  const activatePickMode = (idx) => setAwaitingPickRow(idx);

  /* ─── reverse-geocode after map click ─────────────────────────────── */
  const handleMapPick = async latlng => {
    if (awaitingPickRow === null) return;
    try {
      const res = await fetch(
        `/api/reverse_geocode?lat=${latlng.lat}&lon=${latlng.lng}`
      );
      if (!res.ok) throw new Error("reverse failed");
      const { address } = await res.json();
      setWorkLocs(prev =>
        prev.map((r, i) =>
          i === awaitingPickRow
            ? { ...r, address, lat: latlng.lat, lon: latlng.lng }
            : r
        )
      );
    } catch (e) {
      console.error(e);
      alert("Reverse-geocode failed.");
    } finally {
      setAwaitingPickRow(null);
    }
  };

  /* ─── main search button ─────────────────────────────────────────── */
  const handleSearch = async e => {
    e.preventDefault();
    const payload = workLocs
      .filter(l => l.address.trim())
      .map(l => ({ ...l, time: Number(l.time) }));
    if (!payload.length) {
      alert("Add at least one work address.");
      return;
    }

    setLoading(true);
    try {
      /* 1) isolines */
      const isoRes = await fetch("/api/isolines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: payload }),
      });
      if (!isoRes.ok) throw new Error("Isoline error");
      const iso = await isoRes.json();
      if (!iso.features.length) {
        alert("Could not build commute area.");
        return;
      }
      setIsolineData(iso);

      /* 2) listings */
      const params = new URLSearchParams({
        rent_min: rentMin,
        rent_max: rentMax,
        size_min: sizeMin,
        size_max: sizeMax,
        boligtype,
      });
      const lstRes = await fetch(`/api/listings?${params}`);
      if (!lstRes.ok) {
        const err = await lstRes.json();
        alert(err.error || "Listing error");
        return;
      }
      setListings(await lstRes.json());
    } catch (err) {
      console.error(err);
      alert("Something went wrong – check console.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── render ────────────────────────────────────────────────────────── */
  return (
    <div className="layout-row">
      <aside className="sidebar">
        <form className="form-wrap" onSubmit={handleSearch}>
          {/* Work addresses */}
          {workLocs.map((row, idx) => (
            <div key={idx} className="entry-block">
              {/* Line 1 */}
              <div className="form-group">
                <button
                  type="button"
                  className="btn-pin"
                  onClick={() => activatePickMode(idx)}
                >
                  📍
                </button>
                <input
                  type="text"
                  placeholder="Work address"
                  value={row.address}
                  required
                  className="input-address"
                  onChange={(e) =>
                    setWorkLocs((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, address: e.target.value } : r
                      )
                    )
                  }
                />
                <input
                  type="number"
                  min="1"
                  max="120"
                  className="input-time"
                  value={row.time}
                  onChange={(e) =>
                    setWorkLocs((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, time: e.target.value } : r
                      )
                    )
                  }
                />
                <span className="label-min">min</span>
              </div>
              {/* Line 2 */}
              <div className="form-group">
                <select
                  className="select-mode"
                  value={row.mode}
                  onChange={(e) =>
                    setWorkLocs((prev) =>
                      prev.map((r, i) =>
                        i === idx ? { ...r, mode: e.target.value } : r
                      )
                    )
                  }
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {/* Line 3 */}
              <div className="form-group">
                {idx === workLocs.length - 1 && (
                  <button
                    type="button"
                    className="btn-add"
                    onClick={handleAddRow}
                  >
                    + address
                  </button>
                )}
                {workLocs.length > 1 && (
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => handleRemoveRow(idx)}
                  >
                    – address
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Rent */}
          <div className="form-group">
            <label className="label-inline">Rent</label>
            <input
              type="number"
              min="0"
              className="input-rent"
              placeholder="Min kr"
              value={rentMin}
              onChange={(e) => setRentMin(e.target.value)}
            />
            <span className="label-dash">–</span>
            <input
              type="number"
              min="0"
              className="input-rent"
              placeholder="Max kr"
              value={rentMax}
              onChange={(e) => setRentMax(e.target.value)}
            />
            <span className="label-unit">kr/mnd</span>
          </div>

          {/* Size */}
          <div className="form-group">
            <label className="label-inline">Size</label>
            <input
              type="number"
              min="0"
              className="input-size"
              placeholder="Min m²"
              value={sizeMin}
              onChange={(e) => setSizeMin(e.target.value)}
            />
            <span className="label-dash">–</span>
            <input
              type="number"
              min="0"
              className="input-size"
              placeholder="Max m²"
              value={sizeMax}
              onChange={(e) => setSizeMax(e.target.value)}
            />
            <span className="label-unit">m²</span>
          </div>

          {/* Type */}
          <div className="form-group">
            <label className="label-inline">Type</label>
            <select
              className="select-type"
              value={boligtype}
              onChange={(e) => setBoligtype(e.target.value)}
            >
              {BOLIGTYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="form-group">
            <button type="submit" className="btn-search" disabled={loading}>
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        {/* Loading indicator */}
        {loading && (
          <div className="loading-indicator">
            <div className="spinner" /> Loading apartments…
          </div>
        )}
      </aside>

      <main className="map-pane">
        <MapView
          isolineData={isolineData}
          listings={listings}
          workPins={workLocs}          /* ⇦ NEW */
          showQueryPoly={SHOW_QUERY_POLY} /* ⇦ NEW */
          pickingActive={awaitingPickRow !== null}
          onPick={handleMapPick}
        />
      </main>
    </div>
  );
}

