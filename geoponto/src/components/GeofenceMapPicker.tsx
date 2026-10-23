import { useState, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { MapPin, Search, Loader2, Navigation, LocateFixed } from "lucide-react";
import { toast } from "sonner";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

interface GeofenceMapPickerProps {
  latitude: string;
  longitude: string;
  radius: string;
  addressNumber?: string;
  addressComplement?: string;
  onLatChange: (val: string) => void;
  onLngChange: (val: string) => void;
  onRadiusChange: (val: string) => void;
  onAddressNumberChange?: (val: string) => void;
  onAddressComplementChange?: (val: string) => void;
}

const GeofenceMapPicker = ({
  latitude,
  longitude,
  radius,
  addressNumber,
  addressComplement,
  onLatChange,
  onLngChange,
  onRadiusChange,
  onAddressNumberChange,
  onAddressComplementChange,
}: GeofenceMapPickerProps) => {
  const [cepInput, setCepInput] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [mapCenter, setMapCenter] = useState<[number, number]>([-5.8117, -35.2070]);

  const lat = parseFloat(latitude) || 0;
  const lng = parseFloat(longitude) || 0;
  const rad = parseInt(radius) || 100;
  const hasPosition = lat !== 0 && lng !== 0;

  const geocodeAddress = async (fullAddress: string) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=br`
      );
      const data = await res.json();
      if (data.length > 0) {
        const foundLat = parseFloat(data[0].lat).toFixed(6);
        const foundLng = parseFloat(data[0].lon).toFixed(6);
        onLatChange(foundLat);
        onLngChange(foundLng);
        setMapCenter([parseFloat(foundLat), parseFloat(foundLng)]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleCepSearch = async () => {
    const cleaned = cepInput.replace(/\D/g, "");
    if (cleaned.length !== 8) {
      toast.error("CEP deve ter 8 dígitos");
      return;
    }
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        setCepLoading(false);
        return;
      }
      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, ${data.uf}, Brasil`;
      setAddress(fullAddress);

      const found = await geocodeAddress(fullAddress);
      if (!found) {
        const cityAddress = `${data.localidade}, ${data.uf}, Brasil`;
        const found2 = await geocodeAddress(cityAddress);
        if (!found2) {
          toast.error("Não foi possível localizar o endereço no mapa");
        } else {
          toast.success("Endereço encontrado (aproximado - ajuste no mapa)");
        }
      } else {
        toast.success("Endereço localizado no mapa!");
      }
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  };

  const handleMapClick = (clickLat: number, clickLng: number) => {
    onLatChange(clickLat.toFixed(6));
    onLngChange(clickLng.toFixed(6));
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("GPS indisponível");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lt = pos.coords.latitude.toFixed(6);
        const lg = pos.coords.longitude.toFixed(6);
        onLatChange(lt);
        onLngChange(lg);
        setMapCenter([parseFloat(lt), parseFloat(lg)]);
        toast.success("Localização capturada!");
      },
      () => toast.error("Erro ao obter localização")
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-accent" />
          Local de Trabalho (Geofence)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Busque pelo CEP, clique no mapa ou use sua localização atual para definir o local de trabalho.
        </p>

        {/* CEP Search */}
        <div className="flex gap-2">
          <Input
            value={cepInput}
            onChange={(e) => setCepInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="Digite o CEP (ex: 01001000)"
            maxLength={9}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCepSearch())}
          />
          <Button type="button" onClick={handleCepSearch} disabled={cepLoading} variant="outline">
            {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Buscar</span>
          </Button>
          <Button type="button" onClick={useCurrentLocation} variant="outline" title="Usar localização atual">
            <LocateFixed className="h-4 w-4" />
          </Button>
        </div>

        {/* Address display */}
        {address && (
          <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-sm text-foreground flex items-start gap-2">
            <Navigation className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>{address}</span>
          </div>
        )}

        {/* Number & Complement - always visible */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Número</Label>
            <Input
              value={addressNumber || ""}
              onChange={(e) => onAddressNumberChange?.(e.target.value)}
              placeholder="123"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Complemento</Label>
            <Input
              value={addressComplement || ""}
              onChange={(e) => onAddressComplementChange?.(e.target.value)}
              placeholder="Sala 01, Bloco A..."
            />
          </div>
        </div>

        {/* Map */}
        <div className="overflow-hidden rounded-xl border border-border" style={{ height: 350 }}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <LeafletMap
              lat={lat}
              lng={lng}
              radius={rad}
              hasPosition={hasPosition}
              center={mapCenter}
              onMapClick={handleMapClick}
            />
          </Suspense>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Clique no mapa para posicionar o marcador manualmente
        </p>

        {/* Coordinates & Radius */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Latitude</Label>
            <Input value={latitude} onChange={(e) => onLatChange(e.target.value)} placeholder="-23.5505" />
          </div>
          <div className="space-y-2">
            <Label>Longitude</Label>
            <Input value={longitude} onChange={(e) => onLngChange(e.target.value)} placeholder="-46.6333" />
          </div>
          <div className="space-y-2">
            <Label>Raio: {rad}m</Label>
            <Slider
              value={[rad]}
              onValueChange={(val) => onRadiusChange(val[0].toString())}
              min={10}
              max={2000}
              step={10}
              className="mt-3"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>10m</span>
              <span>2000m</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GeofenceMapPicker;
