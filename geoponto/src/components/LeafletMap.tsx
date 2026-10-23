import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface LeafletMapProps {
  lat: number;
  lng: number;
  radius: number;
  hasPosition: boolean;
  center: [number, number];
  onMapClick: (lat: number, lng: number) => void;
}

const TILE_LAYERS = {
  street: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; World Imagery',
  },
};

const LeafletMap = ({ lat, lng, radius, hasPosition, center, onMapClick }: LeafletMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const [isSatellite, setIsSatellite] = useState(false);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: hasPosition ? [lat, lng] : center,
      zoom: hasPosition ? 16 : 15,
      scrollWheelZoom: true,
    });

    const tile = L.tileLayer(TILE_LAYERS.street.url, {
      attribution: TILE_LAYERS.street.attribution,
    }).addTo(map);
    tileRef.current = tile;

    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle tile layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      tileRef.current.remove();
    }
    const layer = isSatellite ? TILE_LAYERS.satellite : TILE_LAYERS.street;
    tileRef.current = L.tileLayer(layer.url, {
      attribution: layer.attribution,
      maxZoom: 19,
    }).addTo(map);
  }, [isSatellite]);

  // Update marker, circle, and view when position changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (hasPosition) {
      markerRef.current = L.marker([lat, lng]).addTo(map);
      circleRef.current = L.circle([lat, lng], {
        radius,
        color: "#1E40AF",
        fillColor: "#1E40AF",
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
      map.setView([lat, lng], 16, { animate: true });
    }
  }, [lat, lng, radius, hasPosition]);

  // Update click handler ref
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.off("click");
    map.on("click", (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });
  }, [onMapClick]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
      <button
        type="button"
        onClick={() => setIsSatellite((prev) => !prev)}
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 1000,
          padding: "6px 12px",
          fontSize: "12px",
          fontWeight: 600,
          backgroundColor: isSatellite ? "#1E40AF" : "white",
          color: isSatellite ? "white" : "#333",
          border: "2px solid rgba(0,0,0,0.2)",
          borderRadius: "6px",
          cursor: "pointer",
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
        }}
      >
        {isSatellite ? "🗺️ Mapa" : "🛰️ Satélite"}
      </button>
    </div>
  );
};

export default LeafletMap;
