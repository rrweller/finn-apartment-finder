import React, {
  useEffect, useMemo, useState, useCallback, useRef,
} from "react";
import {
  MapContainer, TileLayer, GeoJSON, Marker, Tooltip,
  useMapEvents, useMap,
} from "react-leaflet";
import MarkerClusterGroup     from "react-leaflet-cluster";
import L                      from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.pattern";

import { ISO_COLORS }         from "../constants/colors";

const INTERSECTION_COLOR = "#00e0ff";
const QUERY_STROKE       = "#ffd600";
const STADIA_KEY         = process.env.REACT_APP_STADIA_KEY;

const routeStyle = { color:"#ff4444", weight:3, dashArray:"6 6" };

/* icons ------------------------------------------------------------------- */
const PriceIcon = price => L.divIcon({
  className: "price-bubble-container",
  html: `<div class="price-bubble">
           ${price.toLocaleString("nb-NO")} kr
           <div class="bubble-tail"></div>
         </div>`,
});

const WorkPin = color => L.divIcon({
  className: "color-pin",
  html: `<div style="background:${color};
                     width:18px;height:18px;
                     border-radius:50%;border:2px solid #fff"></div>`,
});

/* helpers ----------------------------------------------------------------- */
function ClickCapture({ enabled, onPick }) {
  useMapEvents({ click: e => enabled && onPick(e.latlng) });
  return null;
}

function StripePatternDef({ onReady }) {
  const map = useMap();
  useEffect(() => {
    const pattern = new L.StripePattern({
      weight:2, spaceWeight:6, color:INTERSECTION_COLOR,
      opacity:0.20, angle:135,
    }).addTo(map);
    onReady(pattern);
  }, [map, onReady]);
  return null;
}

function spreadDuplicates(listings) {                 // unchanged
  const grouped = {};
  listings.forEach(ad => {
    const key = `${ad.lat.toFixed(6)}|${ad.lon.toFixed(6)}`;
    (grouped[key] = grouped[key] || []).push(ad);
  });

  const R = 111_320, Δ = 24;
  const out = [];
  Object.values(grouped).forEach(arr => {
    if (arr.length === 1) { out.push(arr[0]); return; }
    arr.forEach((ad, idx) => {
      const ang = (2 * Math.PI * idx) / arr.length;
      const dx  = (Δ * Math.cos(ang)) / R;
      const dy  = (Δ * Math.sin(ang)) / R;
      out.push({ ...ad, lat: ad.lat + dy, lon: ad.lon + dx });
    });
  });
  return out;
}

/* component ---------------------------------------------------------------- */
export default function MapView({
  isolineData, listings, workPins,
  showQueryPoly, pickingActive, onPick,
}) {
  const [pattern, setPattern]   = useState(null);
  const [routes, setRoutes]     = useState([]);
  const routeCache              = useRef({});

  /* fetch routes once per ad ------------------------------------------- */
  const fetchRoutes = useCallback(async ad => {
    const cache = routeCache.current;
    if (cache[ad.url]) return cache[ad.url];

    const targets = workPins.filter(p => p.lat && p.lon).map((p, i) => ({
      lat:p.lat, lon:p.lon, mode:p.mode||"drive", locId:i,
    }));
    if (!targets.length) return [];

    const res = await fetch("/api/routes", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ origin:{ lat:ad.lat, lon:ad.lon }, targets }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    cache[ad.url] = data.features;
    return data.features;
  }, [workPins]);

  const handleOver = ad => fetchRoutes(ad).then(setRoutes);
  const handleOut  = ()  => setRoutes([]);

  /* geojson tweaks ------------------------------------------------------ */
  const geojson = useMemo(() => {
    if (!isolineData) return null;
    const feats = isolineData.features.filter(
      f => showQueryPoly || !f.properties?.query
    );
    return { ...isolineData, features: feats };
  }, [isolineData, showQueryPoly]);

  const styleFn = feat => {
    const p = feat.properties || {};
    if (p.intersection) {
      return { color:INTERSECTION_COLOR, weight:1, dashArray:"6 4",
               fillColor:INTERSECTION_COLOR, fillOpacity:1,
               fillPattern:pattern };
    }
    if (p.query) {
      return { color:QUERY_STROKE, weight:2, dashArray:"6 4", fillOpacity:0.02 };
    }
    const id = p.locId || 0;
    return { color:ISO_COLORS[id % ISO_COLORS.length], weight:3, fillOpacity:0.20 };
  };

  /* fix marker sprites once -------------------------------------------- */
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:"https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  /* render -------------------------------------------------------------- */
  return (
    <div className="map-wrap">
      <MapContainer
        center={[59.9139, 10.7522]} zoom={12}
        className={pickingActive ? "crosshair" : ""}
        style={{ width:"100%", height:"100%" }}
      >
        <StripePatternDef onReady={setPattern} />

        <TileLayer
          url={`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`}
          attribution="&copy; Stadia Maps &amp; OSM"
        />

        {geojson && <GeoJSON key={Date.now()} data={geojson} style={styleFn} />}

        {workPins.filter(p => p.lat && p.lon).map((p, idx) => (
          <Marker
            key={`work-${idx}`}
            position={[p.lat, p.lon]}
            icon={WorkPin(ISO_COLORS[idx % ISO_COLORS.length])}
          >
            <Tooltip direction="top" offset={[0,-6]} opacity={0.9}>
              {p.address}
            </Tooltip>
          </Marker>
        ))}

        {routes.length > 0 && (
          <GeoJSON
            key={`routes-${routes.length}`}
            data={{ type:"FeatureCollection", features:routes }}
            style={routeStyle} interactive={false}
          />
        )}

        <MarkerClusterGroup
          spiderfyOnMaxZoom spiderfyDistanceMultiplier={2.2}
          disableClusteringAtZoom={17} showCoverageOnHover={false}
          chunkedLoading
        >
          {useMemo(() => spreadDuplicates(listings), [listings]).map(l => (
            <Marker
              key={l.url}
              position={[l.lat, l.lon]}
              icon={PriceIcon(l.price)}
              eventHandlers={{
                click:() => window.open(l.url, "_blank"),
                mouseover:() => handleOver(l),
                mouseout:handleOut,
              }}
            >
              <Tooltip direction="top" offset={[0,-16]} opacity={0.9}>
                <div className="ad-tooltip">
                  {l.thumb && <img src={l.thumb} alt="" className="ad-thumb" />}
                  <div>{l.title}</div>
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>

        <ClickCapture enabled={pickingActive} onPick={onPick} />
      </MapContainer>
    </div>
  );
}
