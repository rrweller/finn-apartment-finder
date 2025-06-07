import React, { useState } from "react";
import InputForm from "./components/InputForm";
import MapView from "./components/MapView";

export default function App() {
  /* ---- lifted state shared by form + map ---- */
  const [workLocs, setWorkLocs] = useState([
    { address: "", time: 20, mode: "drive" },
  ]);
  const [kommune, setKommune] = useState("Oslo");
  const [rent, setRent] = useState(15000);

  /* ---- map & results state ---- */
  const [isolineData, setIsolineData] = useState(null);
  const [listings, setListings] = useState([]);

  /* when user clicks 📍 we store which row should receive the pick */
  const [awaitingPickRow, setAwaitingPickRow] = useState(null);

  /* ------------------------------------------------------------------ */
  /* Search button */
  const handleSearch = async () => {
    const payload = workLocs
      .filter((l) => l.address.trim())
      .map((l) => ({ ...l, time: Number(l.time) }));
    if (!payload.length) {
      alert("Add at least one work address.");
      return;
    }

    try {
      /* 1 — Isolines */
      const isoRes = await fetch("/api/isolines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: payload }),
      });
      if (!isoRes.ok) throw new Error("Isoline error");
      setIsolineData(await isoRes.json());

      /* 2 — Listings */
      const lstRes = await fetch(
        `/api/listings?kommune=${encodeURIComponent(
          kommune
        )}&rent=${rent}`
      );
      if (!lstRes.ok) {
        const err = await lstRes.json();
        alert(err.error || "Listing error");
        return;
      }
      setListings(await lstRes.json());
    } catch (e) {
      console.error(e);
      alert("Something went wrong – check console.");
    }
  };

  /* ------------------------------------------------------------------ */
  /* 📍 button clicked in InputForm */
  const activatePickMode = (rowIdx) => {
    setAwaitingPickRow(rowIdx);
  };

  /* Map returned a click */
  const handleMapPick = async (latlng) => {
    if (awaitingPickRow === null) return;

    try {
      const res = await fetch(
        `/api/reverse_geocode?lat=${latlng.lat}&lon=${latlng.lng}`
      );
      if (!res.ok) throw new Error("Reverse geocode failed");
      const { address } = await res.json();

      /* update that row’s address in state */
      setWorkLocs((prev) =>
        prev.map((row, idx) =>
          idx === awaitingPickRow ? { ...row, address } : row
        )
      );
    } catch (e) {
      console.error(e);
      alert("Couldn’t reverse-geocode this point.");
    } finally {
      setAwaitingPickRow(null);
    }
  };

  return (
    <div className="App">
      <InputForm
        workLocs={workLocs}
        setWorkLocs={setWorkLocs}
        kommune={kommune}
        setKommune={setKommune}
        rent={rent}
        setRent={setRent}
        onSearch={handleSearch}
        onPickMode={activatePickMode}
      />

      <MapView
        isolineData={isolineData}
        listings={listings}
        pickingActive={awaitingPickRow !== null}
        onPick={handleMapPick}
      />
    </div>
  );
}
