/*MapView.js*/
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { ISO_COLORS } from "../colors";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.pattern";                       // npm i leaflet.pattern

/* ─── colour constants ───────────────────────────────────────────────── */
const INTERSECTION_COLOR  = "#00e0ff";         // cyan for area, outline, stripes
const QUERY_STROKE        = "#ffd600";         // yellow convex hull outline
const STADIA_KEY = process.env.REACT_APP_STADIA_KEY;

const routeStyle = {
  color: "#ff4444",
  weight: 3,
  dashArray: "6 6"
};

/* ─── icon helpers ───────────────────────────────────────────────────── */
function PriceIcon(price) {
  return L.divIcon({
    className: "price-bubble-container",
    html: `<div class="price-bubble">
             ${price.toLocaleString("nb-NO")} kr
             <div class="bubble-tail"></div>
           </div>`,
  });
}

function WorkPin(color) {
  return L.divIcon({
    className: "color-pin",
    html: `<div style="
             background:${color};
             width:18px;height:18px;
             border-radius:50%;
             border:2px solid #fff"></div>`
  });
}

function ClickCapture({ enabled, onPick }) {
  useMapEvents({ click: e => enabled && onPick(e.latlng) });
  return null;
}

/* ─── inject one diagonal-stripe SVG pattern into the map ────────────── */
function StripePatternDef({ onReady }) {
  const map = useMap();

  useEffect(() => {
    const pattern = new L.StripePattern({
      weight:        2,
      spaceWeight:   6,
      color:         INTERSECTION_COLOR,  // same hue
      opacity:       0.20,                // fainter than fill (0.40 below)
      angle:         135,
    }).addTo(map);

    onReady(pattern);
  }, [map, onReady]);

  return null;
}

/* ─── main component ──────────────────────────────────────────────────── */
export default function MapView({
  isolineData,
  listings,
  workPins,
  showQueryPoly,
  pickingActive,
  onPick,
}) {
  const [stripePattern, setStripePattern] = useState(null);
  const [activeRoutes, setActiveRoutes]   = useState([]);
  const routeCacheRef = useRef({});           // ad.url → features[]
  const handlePatternReady = useCallback(p => setStripePattern(p), []);

  /* helper to request & cache -------------------------------- */
  const getRoutes = useCallback(
    async ad => {
      const cache = routeCacheRef.current;
      if (cache[ad.url]) return cache[ad.url];

      const targets = workPins
        .filter(p => p.lat && p.lon)
        .map((p, idx) => ({
          lat:  p.lat,
          lon:  p.lon,
          mode: p.mode || "drive",
          locId: idx,
        }));
      if (!targets.length) return [];

      const res = await fetch("/api/routes", {
        method:  "POST",
        headers: { "Content-Type":"application/json" },
        body:    JSON.stringify({ origin:{ lat:ad.lat, lon:ad.lon }, targets }),
      });
      if (!res.ok) return [];

      const data = await res.json();          // FeatureCollection
      cache[ad.url] = data.features;          // memoise
      return data.features;
    },
    [workPins]
  );

  /* mouse handlers ----------------------------------------- */
  const handleOver = useCallback(
    ad => { getRoutes(ad).then(setActiveRoutes); },
    [getRoutes]
  );
  const handleOut  = () => setActiveRoutes([]);

  /* hide yellow outline when toggled off ------------------------------- */
  const geojsonToDraw = useMemo(() => {
    if (!isolineData) return null;
    const feats = isolineData.features.filter(
      f => showQueryPoly || !f.properties?.query
    );
    return { ...isolineData, features: feats };
  }, [isolineData, showQueryPoly]);

  /* per-feature styling ------------------------------------------------- */
  const styleFn = feat => {
    const p = feat.properties || {};

    if (p.intersection) {
      return {
        color:        INTERSECTION_COLOR,
        weight:       1,
        dashArray:    "6 4",
        fillColor:    INTERSECTION_COLOR,
        fillOpacity:  1.0,
        fillPattern:  stripePattern,
      };
    }
    if (p.query) {
      return {
        color:        QUERY_STROKE,
        weight:       2,
        dashArray:    "6 4",
        fillOpacity:  0.02,
      };
    }
    const id = p.locId || 0;
    return {
      color:        ISO_COLORS[id % ISO_COLORS.length],
      weight:       3,
      fillOpacity:  0.20,
    };
  };

  /* fix default marker sprite URLs ------------------------------------- */
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  /* ─── render map ───────────────────────────────────────────────────── */
  return (
    <div className="map-wrap">
      <MapContainer
        center={[59.9139, 10.7522]}
        zoom={12}
        className={pickingActive ? "crosshair" : ""}
        style={{ width: "100%", height: "100%" }}
      >
        {/* load stripe pattern once */}
        <StripePatternDef onReady={handlePatternReady} />

        <TileLayer
          url={`https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_KEY}`}
          attribution="&copy; Stadia Maps, &copy; OSM"
        />

        {geojsonToDraw && (
          <GeoJSON key={Date.now()} data={geojsonToDraw} style={styleFn} />
        )}

        {/* work address pins */}
        {workPins
          .filter(p => p.lat && p.lon)
          .map((p, idx) => (
            <Marker
              key={`work-${idx}`}
              position={[p.lat, p.lon]}
              icon={WorkPin(ISO_COLORS[idx % ISO_COLORS.length])}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                {p.address}
              </Tooltip>
            </Marker>
          ))}

        {/* draw current route lines */}
        {activeRoutes.length > 0 && (
          <GeoJSON
            key={`routes-${activeRoutes.length}`}
            data={{ type: "FeatureCollection", features: activeRoutes }}
            style={routeStyle}
            interactive={false}
          />
        )}

        {/* clustered FINN ads */}
        <MarkerClusterGroup
          spiderfyOnMaxZoom
          showCoverageOnHover={false}
          chunkedLoading
        >
          {listings.map(l => (
            <Marker
              key={l.url}
              position={[l.lat, l.lon]}
              icon={PriceIcon(l.price)}
              eventHandlers={{
                click:      () => window.open(l.url, "_blank"),
                mouseover:  () => handleOver(l),
                mouseout:   handleOut,
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={0.9}>
                <div className="ad-tooltip">
                  {l.thumb && (
                    <img src={l.thumb} alt="" className="ad-thumb" />
                  )}
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

