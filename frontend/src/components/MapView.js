/*MapView.js*/
import React, { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Tooltip,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

/* ─── colours & icons ───────────────────────────────────────────────── */
const ISO_COLORS = ["#bb86fc","#03dac6","#cf6679","#3700b3","#018786","#ff0266"];

function PriceIcon(price) {
  return L.divIcon({
    className: "price-bubble-container",
    html: `<div class="price-bubble">
             ${price.toLocaleString("nb-NO")} kr
             <div class="bubble-tail"></div>
           </div>`,
  });
}
const WorkPin = new L.Icon.Default();     // use Leaflet’s stock blue pin

function ClickCapture({ enabled, onPick }) {
  useMapEvents({ click: e => enabled && onPick(e.latlng) });
  return null;
}

/* ───────────────────────────────────────────────────────────────────── */
export default function MapView({
  isolineData,
  listings,
  workPins,
  showQueryPoly,
  pickingActive,
  onPick,
}) {
  /* clone the GeoJSON so we can strip the query polygon if hidden */
  const geojsonToDraw = useMemo(() => {
    if (!isolineData) return null;
    const feats = isolineData.features.filter(
      f => showQueryPoly || !f.properties?.query
    );
    return { ...isolineData, features: feats };
  }, [isolineData, showQueryPoly]);

  /* style callback */
  const styleFn = feat => {
    if (feat.properties?.query) {
      return {
        color: "#ffd600",
        weight: 2,
        dashArray: "6 4",
        fillOpacity: 0.06,
      };
    }
    const id = feat.properties.locId || 0;
    return {
      color: ISO_COLORS[id % ISO_COLORS.length],
      weight: 3,
      fillOpacity: 0.25,
    };
  };

  /* Leaflet sprite paths */
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

  /* ─── render map ──────────────────────────────────────────────────── */
  return (
    <div className="map-wrap">
      <MapContainer
        center={[59.9139, 10.7522]}
        zoom={12}
        className={pickingActive ? "crosshair" : ""}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
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

        {/* clustered FINN adverts */}
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

