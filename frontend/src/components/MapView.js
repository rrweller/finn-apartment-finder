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

const PriceIcon = (price) =>
  L.divIcon({
    className: "price-marker",
    html: `<span>${price.toLocaleString("nb-NO")} kr</span>`,
    iconAnchor: [30, 15],
  });

/* Captures click only when pickingActive === true */
function ClickCatcher({ pickingActive, onPick }) {
  useMapEvents({
    click(e) {
      if (pickingActive) onPick(e.latlng);
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
  const center = [59.9139, 10.7522]; // Oslo default

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
          <GeoJSON
            data={isolineData}
            style={() => ({
              color: "#0063ff",
              weight: 2,
              fillOpacity: 0.15,
            })}
          />
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

        <ClickCatcher pickingActive={pickingActive} onPick={onPick} />
      </MapContainer>
    </div>
  );
}
