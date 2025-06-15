/*MapView.js*/
import React, { useEffect, useMemo, useState, useCallback } from "react";
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
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.pattern";                       // npm i leaflet.pattern

/* ─── colour constants ───────────────────────────────────────────────── */
const ISO_COLORS          = ["#bb86fc","#03dac6","#cf6679","#3700b3","#018786","#ff0266"];
const INTERSECTION_COLOR  = "#00e0ff";         // cyan for area, outline, stripes
const QUERY_STROKE        = "#ffd600";         // yellow convex hull outline
const STADIA_KEY = process.env.REACT_APP_STADIA_KEY;
const showQueryArea = false;

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
const WorkPin = new L.Icon.Default();

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
  const handlePatternReady = useCallback(p => setStripePattern(p), []);

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
    if (p.query && showQueryArea) {
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
              icon={WorkPin}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={0.9}>
                {p.address}
              </Tooltip>
            </Marker>
          ))}

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
              eventHandlers={{ click: () => window.open(l.url, "_blank") }}
            >
              <Tooltip direction="top" offset={[0, -12]} opacity={0.9}>
                {l.title}
              </Tooltip>
            </Marker>
          ))}
        </MarkerClusterGroup>

        <ClickCapture enabled={pickingActive} onPick={onPick} />
      </MapContainer>
    </div>
  );
}

