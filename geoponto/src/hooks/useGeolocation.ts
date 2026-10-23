import { useState, useEffect } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
}

export const useGeolocation = () => {
  const [geo, setGeo] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    loading: false,
  });

  const requestPosition = () => {
    if (!navigator.geolocation) {
      setGeo((prev) => ({ ...prev, error: "GPS indisponível", loading: false }));
      return;
    }

    setGeo((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          error: null,
          loading: false,
        });
      },
      (err) => {
        setGeo((prev) => ({
          ...prev,
          error: err.message,
          loading: false,
        }));
      },
      // BUGFIX: sem maximumAge, cada chamada esperava nova fix do GPS (até 10s),
      // travando o fluxo de ponto. Reaproveita fix recente (até 30s) e mantém
      // alta precisão. timeout reduzido para feedback mais rápido ao usuário.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  };

  return { ...geo, requestPosition };
};
