import React, { useState } from "react";
import MapView            from "./components/MapView";
import Sidebar            from "./components/Sidebar";
import { getJSON }        from "./api/backend";
import { fmtThousands }   from "./utils/format";
import {
  BOLIGTYPE_OPTIONS,
} from "./constants/filterOptions";

export default function App() {
  /* state --------------------------------------------------------------- */
  const [listingMode, setListingMode] = useState("rent");
  const [workLocs, setWorkLocs]   = useState([
    { address:"", time:15, mode:"transit", lat:null, lon:null },
  ]);

  const [rentMin, rentMax, setRentMin, setRentMax]   = useStateTuple(0, 0);
  const [sizeMin, sizeMax, setSizeMin, setSizeMax]   = useStateTuple(0, 0);
  const [bedrooms, setBedrooms]  = useState(0);
  const [boligtypes, setBoligtypes] =
    useState(BOLIGTYPE_OPTIONS.filter(o => o.value === "leilighet"));

  const [facilities, setFacilities] = useState([]);
  const [floors,     setFloors]     = useState([]);

  const [isolineData, setIso]   = useState(null);
  const [listings,    setAds]   = useState([]);
  const [awaitPick,   setAwait] = useState(null);
  const [loading,     setLoad]  = useState(false);

  /* address helpers ----------------------------------------------------- */
  const resolveAddress = async raw => {
    if (!raw.trim()) return null;
    try { return await getJSON(`/api/geocode?q=${encodeURIComponent(raw)}`); }
    catch { return null; }
  };

  /* pick on map --------------------------------------------------------- */
  const handleMapPick = async ({ lat, lng }) => {
    if (awaitPick === null) return;
    try {
      const { address } = await getJSON(`/api/reverse_geocode?lat=${lat}&lon=${lng}`);
      setWorkLocs(prev => prev.map((r,i) =>
        i === awaitPick ? { ...r, address, lat, lon:lng } : r));
    } catch {
      alert("Reverse-geocode failed.");
    } finally {
      setAwait(null);
    }
  };

  /* main search --------------------------------------------------------- */
  const handleSearch = async e => {
    e.preventDefault();

    const payload = workLocs
      .filter(l => l.address.trim())
      .map(l => ({ ...l, time:Number(l.time) }));
    if (!payload.length) return alert("Add at least one work address.");

    const qsCSV = arr => arr.map(o => o.value).join(",");
    const qs = new URLSearchParams({
      mode: listingMode,
      rent_min: rentMin, rent_max: rentMax,
      size_min: sizeMin, size_max: sizeMax,
      boligtype: qsCSV(boligtypes),
      facilities: qsCSV(facilities),
      floor: qsCSV(floors),
    });
    if (bedrooms) qs.set("min_bedrooms", bedrooms);

    setLoad(true);
    try {
      /* 1. isolines */
      const iso = await getJSON("/api/isolines", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ locations: payload }),
      });
      setIso(iso);

      /* 2. listings */
      qs.set("token", iso.token);
      const ads = await getJSON(`/api/listings?${qs}`);
      setAds(ads);
    } catch (err) {
      console.error(err);
      alert("Network error – se console.");
    } finally {
      setLoad(false);
    }
  };

  /* render -------------------------------------------------------------- */
  return (
    <div className="layout-row">
      <Sidebar
        /* state & setters */
        {...{
          listingMode, setListingMode,
          workLocs, setWorkLocs,
          rentMin, rentMax, setRentMin, setRentMax,
          sizeMin, sizeMax, setSizeMin, setSizeMax,
          bedrooms, setBedrooms,
          boligtypes, setBoligtypes,
          facilities, setFacilities,
          floors,     setFloors,
          loading,
          resultsCount: listings.length,
        }}

        /* handlers */
        onPick={idx => setAwait(idx)}
        onSearch={handleSearch}
      />

      <main className="map-pane">
        <MapView
          isolineData={isolineData}
          listings={listings}
          workPins={workLocs}
          showQueryPoly={false}
          pickingActive={awaitPick !== null}
          onPick={handleMapPick}
        />
      </main>
    </div>
  );
}

/* helper – tiny tuple hook --------------------------------------------- */
function useStateTuple(a, b) {
  const [min, setMin] = useState(a);
  const [max, setMax] = useState(b);
  return [min, max, setMin, setMax];
}
