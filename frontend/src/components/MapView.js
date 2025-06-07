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

// Distinct palette
const ISO_COLORS = [
  "#bb86fc",
  "#03dac6",
  "#cf6679",
  "#3700b3",
  "#018786",
  "#ff0266",
];

// speech-bubble icon
function PriceIcon(price) {
  return L.divIcon({
    className: "price-bubble-container",
    html: `
      <div class="price-bubble">
        ${price.toLocaleString("nb-NO")} kr
        <div class="bubble-tail"></div>
      </div>`,
    // let Leaflet measure the DIV’s size for hit-testing
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
  // annotate features with an index-based color:
  const indexed = useMemo(() => {
    if (!isolineData) return null;
    return {
      ...isolineData,
      features: isolineData.features.map(f => ({
        ...f,
        properties: { ...f.properties },
      })),
    };
  }, [isolineData]);

  // style by locId
  const styleFn = feat => {
    const id = feat.properties.locId || 0;
    return {
      color: ISO_COLORS[id % ISO_COLORS.length],
      weight: 3,
      fillOpacity: 0.25,
    };
  };

  useEffect(() => {
    // restore default icon URLs
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
        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
          attribution="&copy; Stadia Maps, &copy; OSM"
        />

        {indexed && (
          <GeoJSON key={Date.now()} data={indexed} style={styleFn} />
        )}

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
                click: () => window.open(l.url, "_blank"),
              }}
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
