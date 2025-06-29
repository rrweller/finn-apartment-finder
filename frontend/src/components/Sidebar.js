import React from "react";
import Select                 from "react-select";
import WorkAddressRow         from "./WorkAddressRow";
import BedroomSelector        from "./BedroomSelector";
import { selectStyles }       from "../constants/selectStyles";
import {
  BOLIGTYPE_OPTIONS, FACILITY_OPTS, FLOOR_OPTS,
} from "../constants/filterOptions";
import { fmtThousands }       from "../utils/format";

export default function Sidebar(props) {
  const {
    listingMode, setListingMode,
    workLocs, setWorkLocs,
    rentMin, rentMax, setRentMin, setRentMax,
    sizeMin, sizeMax, setSizeMin, setSizeMax,
    bedrooms,  setBedrooms,
    boligtypes, setBoligtypes,
    facilities, setFacilities,
    floors,     setFloors,
    onPick, onSearch, loading, resultsCount,
  } = props;

  /* helpers ------------------------------------------------------------ */
  const updateRow = (idx, patch) =>
    setWorkLocs(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const addRow    = () => setWorkLocs(prev => [
    ...prev, { address: "", time: 15, mode: "transit", lat: null, lon: null },
  ]);

  const removeRow = idx => setWorkLocs(prev => prev.filter((_, i) => i !== idx));

  /* UI ----------------------------------------------------------------- */
  return (
    <aside className="sidebar">
      {/* tabs ------------------------------------------------------------ */}
      <div className="tabs">
        {["rent", "buy"].map(m => (
          <button
            key={m}
            type="button"
            className={listingMode === m ? "tab-btn active" : "tab-btn"}
            onClick={() => setListingMode(m)}
          >
            {m === "rent" ? "Leie" : "Kjøpe"}
          </button>
        ))}
      </div>

      {/* form ------------------------------------------------------------ */}
      <form className="form-wrap" onSubmit={onSearch}>
        {/* work addresses ----------------------------------------------- */}
        {workLocs.map((row, idx) => (
          <WorkAddressRow
            key={idx}
            row={row}
            idx={idx}
            onPick={onPick}
            onChange={updateRow}
            onRemove={workLocs.length > 1 ? removeRow : null}
            onAdd={addRow}
            isLast={idx === workLocs.length - 1}
          />
        ))}

        {/* price -------------------------------------------------------- */}
        <div className="form-group">
          <label className="label-inline">
            {listingMode === "rent" ? "Månedsleie" : "Totalpris"}
          </label>
          {["min", "max"].map(kind => {
            const isBuy = listingMode === "buy";
            const val   = kind === "min" ? rentMin : rentMax;
            const set   = kind === "min" ? setRentMin : setRentMax;

            return (
              <React.Fragment key={kind}>
                {kind === "max" && <span className="label-dash">–</span>}
                <input
                  type={isBuy ? "text" : "number"}
                  inputMode="numeric"
                  min="0"
                  className="input-rent"
                  placeholder={isBuy ? "0" : `Fra kr`}
                  value={isBuy ? fmtThousands(val) : val}
                  onChange={e => set(Number(e.target.value.replace(/\D/g, "")))}
                />
              </React.Fragment>
            );
          })}
        </div>

        {/* size --------------------------------------------------------- */}
        <div className="form-group">
          <label className="label-inline">Størrelse</label>
          <input
            type="number" min="0"
            className="input-size"
            placeholder="Fra m²"
            value={sizeMin}
            onChange={e => setSizeMin(e.target.value)}
          />
          <span className="label-dash">–</span>
          <input
            type="number" min="0"
            className="input-size"
            placeholder="Til m²"
            value={sizeMax}
            onChange={e => setSizeMax(e.target.value)}
          />
        </div>

        {/* bedrooms ------------------------------------------------------ */}
        <div className="form-group">
          <label className="label-inline">Soverom</label>
          <BedroomSelector value={bedrooms} onChange={setBedrooms} />
        </div>

        {/* selects ------------------------------------------------------- */}
        {[
          ["Boligtype",   BOLIGTYPE_OPTIONS, boligtypes, setBoligtypes],
          ["Fasiliteter", FACILITY_OPTS,     facilities, setFacilities],
          ["Etasje",      FLOOR_OPTS,        floors,     setFloors],
        ].map(([label, opts, value, set]) => (
          <div key={label} className="form-group">
            <label className="label-inline">{label}</label>
            <div style={{ flex: 1 }}>
              <Select
                options={opts}
                value={value}
                onChange={set}
                isMulti
                placeholder={label === "Boligtype" ? "Alle" : "Velg…"}
                styles={selectStyles}
              />
            </div>
          </div>
        ))}

        {/* search -------------------------------------------------------- */}
        <div className="form-group">
          <button type="submit" className="btn-search" disabled={loading}>
            {loading ? "Søker…" : "Søk"}
          </button>
        </div>
      </form>

      {/* feedback ------------------------------------------------------- */}
      {loading && (
        <div className="loading-indicator">
          <div className="spinner" /> Finner boliger…
        </div>
      )}
      {!loading && resultsCount > 0 && (
        <div className="results-count">
          Fant {resultsCount} boliger
        </div>
      )}
    </aside>
  );
}
