// Cálculo de distância entre dois pontos (metros) usando a fórmula de Haversine.
// Usado tanto na conferência offline no momento do ponto (PunchClock) quanto na
// tela de análise administrativa (FaceAnalysis).
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeofenceLike {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  name?: string;
}

/**
 * Retorna o geofence mais próximo e se o ponto está dentro do raio.
 * Se a lista estiver vazia, retorna null (o chamador decide o fallback).
 */
export function nearestGeofence(
  lat: number,
  lon: number,
  fences: GeofenceLike[]
): { fence: GeofenceLike; distance: number; inside: boolean } | null {
  if (!fences || fences.length === 0) return null;
  let best: GeofenceLike = fences[0];
  let bestDist = Infinity;
  for (const f of fences) {
    const d = haversineDistance(lat, lon, f.latitude, f.longitude);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return { fence: best, distance: bestDist, inside: bestDist <= best.radius };
}
