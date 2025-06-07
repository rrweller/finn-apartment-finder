import React, { useEffect, useMemo, useState } from "react";
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

// Price pin
const PriceIcon = (price) =>
  L.divIcon({
    className: "price-marker",
    html: `<span>${price.toLocaleString("nb-NO")} kr</span>`,
    iconAnchor: [30, 15],
  });

// Click‐to‐pick overlay
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
  // 1) build a copy of isolineData with a feature‐index in properties
  const indexedIso = useMemo(() => {
    if (!isolineData) return null;
    return {
      type: "FeatureCollection",
      features: isolineData.features.map((feat, i) => ({
        ...feat,
        properties: { ...feat.properties, _idx: i },
      })),
    };
  }, [isolineData]);

  // 2) generate a random color for each feature‐index
  const [isoColors, setIsoColors] = useState([]);
  useEffect(() => {
    if (!indexedIso) return;
    setIsoColors(
      indexedIso.features.map(
        () =>
          "#" +
          Math.floor(Math.random() * 0xffffff)
            .toString(16)
            .padStart(6, "0")
      )
    );
  }, [indexedIso]);

  // 3) style function picks color by _idx
  const styleFn = (feat) => {
    const idx = feat.properties._idx;
    const color = isoColors[idx] || "#0d6efd";
    return { color, weight: 2, fillOpacity: 0.15 };
  };

  // fix for default Leaflet icons
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
        className={pickingActive ? "crosshair" : ""}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />

        {indexedIso && (
          /* key={Date.now()} forces a redraw when data changes */
          <GeoJSON key={Date.now()} data={indexedIso} style={styleFn} />
        )}

        {listings.map((l) => (
          <Marker
            key={l.url}
            position={[l.lat, l.lon]}
            icon={PriceIcon(l.price)}
            eventHandlers={{
              click: () => window.open(l.url, "_blank"),
            }}
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
