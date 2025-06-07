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

// A nice distinct palette for your isolines
const ISO_COLORS = [
  "#bb86fc",
  "#03dac6",
  "#cf6679",
  "#3700b3",
  "#018786",
  "#ff0266",
];

// Create a speech-bubble icon with a bottom-center tail
function PriceIcon(price) {
  return L.divIcon({
    className: "price-bubble-icon",
    html: `
      <div class="price-bubble">
        <span>${price.toLocaleString("nb-NO")} kr</span>
        <div class="bubble-tail"></div>
      </div>`,
    iconSize: [0, 0],        // let CSS size it
    iconAnchor: [0, 0],      // we’ll position via CSS transform
  });
}

function ClickCapture({ enabled, onPick }) {
  useMapEvents({
    click(e) {
      if (enabled) onPick(e.latlng);
    },
  });
  return null;
}

export default function MapView({ isolineData, listings, pickingActive, onPick }) {
  // tag each feature with an index
  const indexed = useMemo(() => {
    if (!isolineData) return null;
    return {
      ...isolineData,
      features: isolineData.features.map((f, i) => ({
        ...f,
        properties: { ...f.properties, _idx: i },
      })),
    };
  }, [isolineData]);

  // pick stroke color by index
  const styleFn = feat => {
    const c = ISO_COLORS[feat.properties._idx % ISO_COLORS.length];
    return { color: c, weight: 3, fillOpacity: 0.2 };
  };

  // ensure default marker icons load
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

  return (
    <div className="map-wrap">
      <MapContainer
        center={[59.9139, 10.7522]}
        zoom={12}
        style={{ width: "100%", height: "100%" }}
        className={pickingActive ? "crosshair" : ""}
      >
        {/* Dark, but high-contrast, easy-read basemap from Stadia */}
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
          attribution="&copy; Stadia Maps, &copy; OpenMapTiles &copy; OSM"
        />

        {indexed && (
          <GeoJSON key={Date.now()} data={indexed} style={styleFn} />
        )}

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

        <ClickCapture enabled={pickingActive} onPick={onPick} />
      </MapContainer>
    </div>
  );
}
