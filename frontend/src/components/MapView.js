import React, { useEffect } from "react";
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

const MODE_COLORS = {
  drive: "#0d6efd",
  transit: "#d63384",
  bicycle: "#198754",
  walk: "#6f42c1",
};

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
  const center = [59.9139, 10.7522];

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

  const styleFn = (feat) => {
    const c = MODE_COLORS[feat.properties?.mode] || "#0d6efd";
    return { color: c, weight: 2, fillOpacity: 0.15 };
  };

  return (
    <div className="map-wrap">
      <MapContainer
        center={center}
        zoom={11}
        style={{ height: "100%" }}
        className={pickingActive ? "crosshair" : ""}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OSM"
        />

        {isolineData && (
          /* key prop forces React-Leaflet to toss old layer */
          <GeoJSON
            key={Date.now()}
            data={isolineData}
            style={styleFn}
          />
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
