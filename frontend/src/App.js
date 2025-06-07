/*App.js*/
import React, { useState } from "react";
import MapView from "./components/MapView";

/** mode options with icons */
const MODE_OPTIONS = [
  { value: "drive", label: "Car 🚗" },
  { value: "transit", label: "Transit 🚌" },
  { value: "bicycle", label: "Bike 🚴" },
  { value: "walk", label: "Walk 🚶" },
];

/** kommune dropdown options */
const KOMMUNE_OPTIONS = [
  "Oslo",
  "Bergen",
  "Trondheim",
  "Stavanger",
  "Fredrikstad",
];

export default function App() {
  /* ─── state ───────────────────────────────────────────────────────────── */
  const [workLocs, setWorkLocs] = useState([
    { address: "", time: 20, mode: "drive", lat: null, lon: null },
  ]);
  const [kommune, setKommune] = useState("Oslo");
  const [rent, setRent]       = useState(15000);

  /* map + results state ────────────────────────────────────────────────── */
  const [isolineData, setIsolineData] = useState(null);
  const [listings, setListings]       = useState([]);

  /* which row is awaiting a map-click? */
  const [awaitingPickRow, setAwaitingPickRow] = useState(null);

  /* ─── handlers ────────────────────────────────────────────────────────── */
  const handleAddRow = () =>
    setWorkLocs((prev) => [
      ...prev,
      { address: "", time: 20, mode: "drive", lat: null, lon: null },
    ]);

  const activatePickMode = (idx) => setAwaitingPickRow(idx);

  const handleMapPick = async (latlng) => {
    if (awaitingPickRow === null) return;
    try {
      const res = await fetch(
        `/api/reverse_geocode?lat=${latlng.lat}&lon=${latlng.lng}`
      );
      if (!res.ok) throw new Error("reverse geocode failed");
      const { address } = await res.json();
      setWorkLocs((prev) =>
        prev.map((row, i) =>
          i === awaitingPickRow
            ? { ...row, address, lat: latlng.lat, lon: latlng.lng }
            : row
        )
      );
    } catch (e) {
      console.error(e);
      alert("Couldn’t reverse-geocode that point.");
    } finally {
      setAwaitingPickRow(null);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    const payload = workLocs
      .filter((l) => l.address.trim())
      .map((l) => ({
        ...l,
        time: Number(l.time),
      }));

    if (!payload.length) {
      alert("Add at least one work address.");
      return;
    }

    try {
      // 1) isolines
      const isoRes = await fetch("/api/isolines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: payload }),
      });
      if (!isoRes.ok) throw new Error("Isoline error");
      const iso = await isoRes.json();
      if (!iso.features.length) {
        alert(
          "Could not build commute area – check address or Geoapify key."
        );
        return;
      }
      setIsolineData(iso);

      // 2) listings
      const lstRes = await fetch(
        `/api/listings?kommune=${encodeURIComponent(kommune)}&rent=${rent}`
      );
      if (!lstRes.ok) {
        const err = await lstRes.json();
        alert(err.error || "Listing error");
        return;
      }
      setListings(await lstRes.json());
    } catch (err) {
      console.error(err);
      alert("Something went wrong – check console.");
    }
  };

  /* ─── render ───────────────────────────────────────────────────────────── */
  return (
    <div className="layout-row">
      {/* ─── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <form className="form-wrap" onSubmit={handleSearch}>
          {workLocs.map((row, idx) => (
            <div key={idx} className="form-row">
              <button
                type="button"
                title="Pick on map"
                onClick={() => activatePickMode(idx)}
              >
                📍
              </button>
              <input
                type="text"
                placeholder="Work address"
                value={row.address}
                onChange={(e) =>
                  setWorkLocs((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, address: e.target.value } : r
                    )
                  )
                }
                required
              />
              <input
                type="number"
                min="1"
                max="120"
                value={row.time}
                onChange={(e) =>
                  setWorkLocs((prev) =>
                    prev.map((r, i) =>
                      i === idx ? { ...r, time: e.target.value } : r
                    )
                  )
                }
                style={{ width: "60px" }}
              />
              <span>min</span>
              {idx === workLocs.length - 1 && (
                <button type="button" onClick={handleAddRow}>
                  + address
                </button>
              )}
              <select
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
          ))}

          <div className="form-row">
            <select
              value={kommune}
              onChange={(e) => setKommune(e.target.value)}
            >
              {KOMMUNE_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1000"
              step="500"
              value={rent}
              onChange={(e) => setRent(e.target.value)}
              style={{ width: "100px" }}
            />
            <span>kr / mnd</span>

            <button type="submit">Search</button>
          </div>
        </form>
      </aside>

      {/* ─── Map pane ───────────────────────────────────────────────────────── */}
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
