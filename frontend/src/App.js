/*App.js*/
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

// Kommune options
const KOMMUNE_OPTIONS = [
  "Oslo",
  "Bergen",
  "Trondheim",
  "Stavanger",
  "Fredrikstad",
];

export default function App() {
  /* State */
  const [workLocs, setWorkLocs] = useState([
    { address: "", time: 15, mode: "drive", lat: null, lon: null },
  ]);
  const [kommune,   setKommune]   = useState("Oslo");
  const [rentMin,   setRentMin]   = useState(0);
  const [rentMax,   setRentMax]   = useState(15000);
  const [sizeMin,   setSizeMin]   = useState(0);
  const [sizeMax,   setSizeMax]   = useState(0);
  const [boligtype, setBoligtype] = useState("");

  const [isolineData, setIsolineData] = useState(null);
  const [listings,     setListings]   = useState([]);
  const [awaitingPickRow, setAwaitingPickRow] = useState(null);

  /* Handlers */
  const handleAddRow = () =>
    setWorkLocs((p) => [
      ...p,
      { address: "", time: 20, mode: "drive", lat: null, lon: null },
    ]);
  
  const handleRemoveRow = idx =>
    setWorkLocs(p => p.filter((_,i) => i !== idx));

  const activatePickMode = (idx) => setAwaitingPickRow(idx);

  const handleMapPick = async (latlng) => {
    if (awaitingPickRow === null) return;
    try {
      const res = await fetch(
        `/api/reverse_geocode?lat=${latlng.lat}&lon=${latlng.lng}`
      );
      if (!res.ok) throw new Error();
      const { address } = await res.json();
      setWorkLocs((p) =>
        p.map((r, i) =>
          i === awaitingPickRow
            ? { ...r, address, lat: latlng.lat, lon: latlng.lng }
            : r
        )
      );
    } catch {
      alert("Reverse-geocode failed.");
    } finally {
      setAwaitingPickRow(null);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const payload = workLocs
      .filter((l) => l.address.trim())
      .map((l) => ({ ...l, time: Number(l.time) }));
    if (!payload.length) {
      alert("Add at least one work address.");
      return;
    }

    // isolines
    const isoRes = await fetch("/api/isolines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations: payload }),
    });
    if (!isoRes.ok) {
      alert("Isoline error");
      return;
    }
    const iso = await isoRes.json();
    if (!iso.features.length) {
      alert("Could not build commute area.");
      return;
    }
    setIsolineData(iso);

    // listings
    const params = new URLSearchParams({
      kommune,
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
  };

  return (
    <div className="layout-row">
      <aside className="sidebar">
        <form className="form-wrap" onSubmit={handleSearch}>
          {/* ─── Work Address #1+ ─────────────────────────────────────────── */}
          {workLocs.map((row, idx) => (
            <div key={idx} className="entry-block">
              {/* Line 1: pin + address + time */}
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
                  onChange={(e) =>
                    setWorkLocs((p) =>
                      p.map((r, i) =>
                        i === idx ? { ...r, address: e.target.value } : r
                      )
                    )
                  }
                  required
                  className="input-address"
                />
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={row.time}
                  onChange={(e) =>
                    setWorkLocs((p) =>
                      p.map((r, i) =>
                        i === idx ? { ...r, time: e.target.value } : r
                      )
                    )
                  }
                  className="input-time"
                />
                <span className="label-min">min</span>
              </div>

              {/* Line 2: transport mode */}
              <div className="form-group">
                <select
                  value={row.mode}
                  onChange={(e) =>
                    setWorkLocs((p) =>
                      p.map((r, i) =>
                        i === idx ? { ...r, mode: e.target.value } : r
                      )
                    )
                  }
                  className="select-mode"
                >
                  {MODE_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Line 3: +address and –address buttons */}
              <div className="form-group">
                {idx === workLocs.length - 1 && (
                  <button type="button" className="btn-add" onClick={handleAddRow}>
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

          {/* ─── Kommune ─────────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="label-inline">Kommune</label>
            <select
              value={kommune}
              onChange={(e) => setKommune(e.target.value)}
              className="select-kommune"
            >
              {KOMMUNE_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* ─── Rent Min/Max ───────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="label-inline">Rent</label>
            <input
              type="number"
              min="0"
              placeholder="Min kr"
              value={rentMin}
              onChange={(e) => setRentMin(e.target.value)}
              className="input-rent"
            />
            <span className="label-dash">–</span>
            <input
              type="number"
              min="0"
              placeholder="Max kr"
              value={rentMax}
              onChange={(e) => setRentMax(e.target.value)}
              className="input-rent"
            />
            <span className="label-unit">kr/mnd</span>
          </div>

          {/* ─── Size Min/Max ───────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="label-inline">Size</label>
            <input
              type="number"
              min="0"
              placeholder="Min m²"
              value={sizeMin}
              onChange={(e) => setSizeMin(e.target.value)}
              className="input-size"
            />
            <span className="label-dash">–</span>
            <input
              type="number"
              min="0"
              placeholder="Max m²"
              value={sizeMax}
              onChange={(e) => setSizeMax(e.target.value)}
              className="input-size"
            />
            <span className="label-unit">m²</span>
          </div>

          {/* ─── Boligtype ───────────────────────────────────────────────────── */}
          <div className="form-group">
            <label className="label-inline">Type</label>
            <select
              value={boligtype}
              onChange={(e) => setBoligtype(e.target.value)}
              className="select-type"
            >
              {BOLIGTYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* ─── Search Button ───────────────────────────────────────────────── */}
          <div className="form-group">
            <button type="submit" className="btn-search">
              Search
            </button>
          </div>
        </form>
      </aside>

      <main className="map-pane">
        <MapView
          isolineData={isolineData}
          listings={listings}
          pickingActive={awaitingPickRow !== null}
          onPick={handleMapPick}
        />
      </main>
    </div>
  );
}

