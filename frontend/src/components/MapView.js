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
import L from "leaflet";
import "leaflet/dist/leaflet.css";

//  ─── A nice set of clearly distinct colors ───────────────────────────────
const ISO_COLORS = [
  "#1f77b4", // blue
  "#ff7f0e", // orange
  "#2ca02c", // green
  "#d62728", // red
  "#9467bd", // purple
  "#8c564b", // brown
  "#e377c2", // pink
  "#17becf", // cyan
];

// price-pin icon unchanged
const PriceIcon = (price) =>
  L.divIcon({
    className: "price-marker",
    html: `<span>${price.toLocaleString("nb-NO")} kr</span>`,
    iconAnchor: [30, 15],
  });

function ClickCapture({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng);
    },
  });
  return null;
}

export default function MapView({
  isolineData,
  listings,
  pickingActive,
  onPick,
}) {
  // Re‐index features so each has _idx
  const indexedIso = useMemo(() => {
    if (!isolineData) return null;
    return {
      type: "FeatureCollection",
      features: isolineData.features.map((f, i) => ({
        ...f,
        properties: { ...f.properties, _idx: i },
      })),
    };
  }, [isolineData]);

  // styleFn now picks from our fixed palette
  const styleFn = (feat) => {
    const idx = feat.properties._idx || 0;
    const color = ISO_COLORS[idx % ISO_COLORS.length];
    return { color, weight: 2, fillOpacity: 0.15 };
  };

  // Leaflet default icons setup
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

  const center = [59.9139, 10.7522];

  return (
    <div className="map-wrap">
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: "100%", width: "100%" }}
        className={pickingActive ? "crosshair" : ""}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OSM"
        />

        {indexedIso && (
          <GeoJSON key={Date.now()} data={indexedIso} style={styleFn} />
        )}

        {listings.map((l) => (
          <Marker
            key={l.url}
            position={[l.lat, l.lon]}
            icon={PriceIcon(l.price)}
            eventHandlers={{ click: () => window.open(l.url, "_blank") }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
              {l.title}
            </Tooltip>
          </Marker>
        ))}

        <ClickCapture enabled={pickingActive} onPick={onPick} />
      </MapContainer>
    </div>
  );
}

