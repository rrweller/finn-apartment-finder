// src/App.js
import React, { useState } from "react";
import MapView from "./components/MapView";
import { ISO_COLORS } from "./colors";
import Select from "react-select";
import {MODE_OPTIONS, BOLIGTYPE_OPTIONS, FACILITY_OPTS, FLOOR_OPTS } from "./filterOptions";
import BedroomSelector from "./components/BedroomSelector";

const SHOW_QUERY_POLY = false;          // ⇦ turn to false to hide outline

export default function App() {
  /* ─── state ─────────────────────────────────────────────────────────── */
  const [listingMode, setListingMode] = useState("rent");
  const [workLocs, setWorkLocs] = useState([
    { address: "", time: 15, mode: "transit", lat: null, lon: null },
  ]);

  const [rentMin,   setRentMin]   = useState(0);
  const [rentMax,   setRentMax]   = useState(0);
  const [sizeMin,   setSizeMin]   = useState(0);
  const [sizeMax,   setSizeMax]   = useState(0);
  const [bedrooms, setBedrooms] = useState(0);
  const [boligtypes, setBoligtypes] = useState(
    BOLIGTYPE_OPTIONS.filter(o => o.value === "leilighet")   // default chip
  );
  const [facilities, setFacilities] = useState([]);   // multiselect
  const [floors,     setFloors]     = useState([]);   // multiselect


  const [isolineData,   setIsolineData] = useState(null);
  const [listings,      setListings]    = useState([]);
  const [awaitingPickRow, setAwaitingPickRow] = useState(null);
  const [loading,       setLoading]      = useState(false);

  const fmtThousands = n =>
  n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";

  /* ─── handlers ──────────────────────────────────────────────────────── */
  const handleAddRow = () =>
    setWorkLocs((prev) => [
      ...prev,
      { address: "", time: 15, mode: "transit", lat: null, lon: null },
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

  const selectStyles = {
    control:  (base) => ({ ...base, background:"#2c2c2c", borderColor:"#444",
                          minHeight:38 }),
    menu:     (base) => ({ ...base, background:"#2c2c2c" }),
    option:   (base, s) => ({ ...base, background:s.isFocused?"#333":"inherit",
                              ":active":{background:"#555"} }),
    multiValue: (base) => ({ ...base, background:"#444" }),
    multiValueLabel: (base) => ({ ...base, color:"#e0e0e0" }),
    multiValueRemove:(base)=> ({ ...base, ":hover":{background:"#666"} }),
    placeholder:(base)=> ({ ...base, color:"#888" }),
    singleValue:(base)=> ({ ...base, color:"#e0e0e0" }),
    input:      (base)=> ({ ...base, color:"#e0e0e0" }),
  };

  /* ─── main search button ─────────────────────────────────────────── */
  const handleSearch = async (e) => {
    e.preventDefault();

    /* build worker-payload (addresses + commute times) */
    const payload = workLocs
      .filter(l => l.address.trim())
      .map(l => ({ ...l, time: Number(l.time) }));
    if (!payload.length) { alert("Add at least one work address."); return; }

    /* CSV strings for backend */
    const typeCSV  = boligtypes.map(o => o.value).join(",");
    const facCSV   = facilities.map(o => o.value).join(",");
    const floorCSV = floors.map(o => o.value).join(",");

    setLoading(true);
    try {
      /* 1) isolines */
      const iso = await (await fetch("/api/isolines", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ locations: payload }),
      })).json();
      if (!iso.features?.length) { alert("Could not build commute area."); return; }
      setIsolineData(iso);
      const cleanMin = Number(rentMin) || 0;
      const cleanMax = Number(rentMax) || 0;

      /* 2) FINN listings */
      const qs = new URLSearchParams({
        rent_min: rentMin,
        rent_max: rentMax,
        size_min: sizeMin,
        size_max: sizeMax,
        boligtype: typeCSV,
        facilities: facCSV,
        floor: floorCSV,
        token: iso.token,
      });
      qs.set("mode", listingMode);
      qs.set("rent_min", cleanMin);
      qs.set("rent_max", cleanMax);
      if (bedrooms) qs.set("min_bedrooms", bedrooms);

      const res = await fetch(`/api/listings?${qs}`);
      if (!res.ok) { alert("Listing error"); return; }
      setListings(await res.json());
    } catch (err) {
      console.error(err);
      alert("Network error – see console.");
    } finally {
      setLoading(false);
    }
  };

  /* ─── render ────────────────────────────────────────────────────────── */
  return (
    <div className="layout-row">
      <aside className="sidebar">
        {/* ─── Rent / Buy tabs ─────────────────────────────── */}
        <div className="tabs">
          <button
            type="button"
            className={listingMode === "rent" ? "tab-btn active" : "tab-btn"}
            onClick={() => setListingMode("rent")}
          >
            Leie
          </button>
          <button
            type="button"
            className={listingMode === "buy" ? "tab-btn active" : "tab-btn"}
            onClick={() => setListingMode("buy")}
          >
            Kjøpe
          </button>
        </div>
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
                  placeholder="Arbeidsadresse"
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
                {/* coloured dot */}
                <span
                  style={{
                    width: 12, height: 12,
                    borderRadius: "50%",
                    background: ISO_COLORS[idx % ISO_COLORS.length],
                    marginLeft: 6
                  }}
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

                {/* mode selector now lives on the same row */}
                <select
                  className="select-mode commute-mode"
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
                    + adresse
                  </button>
                )}
                {workLocs.length > 1 && (
                  <button
                    type="button"
                    className="btn-remove"
                    onClick={() => handleRemoveRow(idx)}
                  >
                    – adresse
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Rent */}
          <div className="form-group">
            <label className="label-inline">
              {listingMode === "rent" ? "Månedsleie" : "Totalpris"}
            </label>
            <input
              /* text when buying (so we can show dots), number otherwise */
              type={listingMode === "buy" ? "text" : "number"}
              inputMode="numeric"
              min="0"
              className="input-rent"
              placeholder={listingMode === "buy" ? "0" : "Fra kr"}
              value={
                listingMode === "buy"
                  ? fmtThousands(rentMin)    // or rentMax in the second field
                  : rentMin                  // or rentMax
              }
              /* strip non-digits, keep clean number in state */
              onChange={e => {
                const digitsOnly = e.target.value.replace(/\D/g, "");
                setRentMin(Number(digitsOnly));      // use setRentMax for the second field
              }}
            />
            <span className="label-dash">–</span>
            <input
              /* text when buying (so we can show dots), number otherwise */
              type={listingMode === "buy" ? "text" : "number"}
              inputMode="numeric"
              min="0"
              className="input-rent"
              placeholder={listingMode === "buy" ? "0" : "Fra kr"}
              value={
                listingMode === "buy"
                  ? fmtThousands(rentMax)    // or rentMax in the second field
                  : rentMax                  // or rentMax
              }
              /* strip non-digits, keep clean number in state */
              onChange={e => {
                const digitsOnly = e.target.value.replace(/\D/g, "");
                setRentMax(Number(digitsOnly));      // use setRentMax for the second field
              }}
            />
            <span className="label-unit">
              {listingMode === "rent" ? "" : ""}
            </span>
          </div>

          {/* Size */}
          <div className="form-group">
            <label className="label-inline">Størrelse</label>
            <input
              type="number"
              min="0"
              className="input-size"
              placeholder="Fra m²"
              value={sizeMin}
              onChange={(e) => setSizeMin(e.target.value)}
            />
            <span className="label-dash">–</span>
            <input
              type="number"
              min="0"
              className="input-size"
              placeholder="Til m²"
              value={sizeMax}
              onChange={(e) => setSizeMax(e.target.value)}
            />
            <span className="label-unit"></span>
          </div>

          {/* Bedrooms */}
          <div className="form-group">
            <label className="label-inline">Soverom</label>
            <BedroomSelector value={bedrooms} onChange={setBedrooms} />
          </div>

          {/* Type */}
          <div className="form-group">
            <label className="label-inline">Boligtype</label>
            <div style={{ flex: 1 }}>
              <Select
                options={BOLIGTYPE_OPTIONS}
                value={boligtypes}
                onChange={setBoligtypes}
                isMulti
                placeholder="Alle"
                styles={selectStyles}
              />
           </div>
          </div>

          {/* Facilities */}
          <div className="form-group">
            <label className="label-inline">Fasiliteter</label>
            <div style={{ flex: 1 }}>
              <Select
                options={FACILITY_OPTS}
                value={facilities}
                onChange={setFacilities}
                isMulti
                placeholder="Velg…"
                styles={selectStyles}
              />
            </div>
          </div>

          {/* Floor */}
          <div className="form-group">
            <label className="label-inline">Etasje</label>
            <div style={{ flex: 1 }}>
              <Select
                options={FLOOR_OPTS}
                value={floors}
                onChange={setFloors}
                isMulti
                placeholder="Alle"
                styles={selectStyles}
              />
            </div>
          </div>

          {/* Search */}
          <div className="form-group">
            <button type="submit" className="btn-search" disabled={loading}>
              {loading ? "Søker…" : "Søk"}
            </button>
          </div>
        </form>

        {/* Loading indicator */}
        {loading && (
          <div className="loading-indicator">
            <div className="spinner" /> Finner boliger…
          </div>
        )}
        {/* Results */}
        {!loading && listings.length > 0 && (
          <div className="results-count">
            Fant {listings.length} {listingMode === "rent" ? "boliger" : "boliger"}
          </div>
        )}
      </aside>

      <main className="map-pane">
        <MapView
          isolineData={isolineData}
          listings={listings}
          workPins={workLocs}
          showQueryPoly={SHOW_QUERY_POLY}
          pickingActive={awaitingPickRow !== null}
          onPick={handleMapPick}
        />
      </main>
    </div>
  );
}

