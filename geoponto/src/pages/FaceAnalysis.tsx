import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FaceImage from "@/components/FaceImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ScanFace,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Bot,
  Clock,
  User,
  ImageOff,
  MapPin,
  Navigation,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { haversineDistance } from "@/utils/geo";

interface PunchRecord {
  id: string;
  timestamp: string;
  type: "in" | "out";
  status: string;
  face_image_url: string | null;
  user_id: string;
  face_score: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  profiles?: { name: string; email: string | null } | null;
}

interface Geofence {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

type AnalysisStatus = "idle" | "analyzing" | "approved" | "rejected";

const FaceAnalysis = () => {
  const { user } = useAuth();
  const [punches, setPunches] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPunch, setSelectedPunch] = useState<PunchRecord | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [filterUser, setFilterUser] = useState("all");
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchResults, setBatchResults] = useState<{
    total: number;
    approved: number;
    outside: number;
    incomplete: number;
    outsideIds: string[];
    incompleteIds: string[];
  } | null>(null);
  const [profiles, setProfiles] = useState<{ user_id: string; name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [entriesRes, geoRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("id, timestamp, type, status, face_image_url, user_id, face_score, latitude, longitude, accuracy")
        .order("timestamp", { ascending: false })
        .limit(30),
      supabase.from("geofences").select("*"),
    ]);

    if (entriesRes.error) {
      toast.error("Erro ao carregar registros");
    } else if (entriesRes.data) {
      const userIds = [...new Set(entriesRes.data.map((d) => d.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        profilesData?.map((p) => [p.user_id, { name: p.name, email: p.email }]) || []
      );

      setProfiles(profilesData?.map((p) => ({ user_id: p.user_id, name: p.name })) || []);

      setPunches(
        entriesRes.data.map((d) => ({
          ...d,
          profiles: profileMap.get(d.user_id) || null,
        }))
      );
    }

    setGeofences((geoRes.data as Geofence[]) || []);
    setLoading(false);
  };

  // NÃO calcula "score de confiança" facial: o sistema ainda não faz comparação
  // biométrica real (ver docs/proposta-biometria-facial.md). Aqui apenas listamos
  // fatos objetivos do registro (existe foto? está dentro do geofence?) para o
  // gestor conferir manualmente a foto salva.
  const analyzeImage = (punch: PunchRecord) => {
    setSelectedPunch(punch);
    setAnalysisStatus("analyzing");
    setAnalysisResult(null);
    

    const hasPhoto = !!punch.face_image_url;
    const loc = getLocationAnalysis(punch);
    const locOk = loc.status === "inside";
    const locBad = loc.status === "outside";

    // Regra objetiva: irregular só quando há dado GPS e ele está fora do perímetro.
    // Falta de foto ou de GPS aparece como "incompleto", não como fraude.
    if (locBad) {
      setAnalysisStatus("rejected");
      setAnalysisResult(
        `Registro fora do perímetro do geofence.${hasPhoto ? " Foto disponível — confira manualmente abaixo." : " Sem foto anexada."}`
      );
    } else if (locOk && hasPhoto) {
      setAnalysisStatus("approved");
      setAnalysisResult(
        "Registro dentro do perímetro e com foto disponível para conferência manual. O sistema ainda não faz comparação biométrica automática de identidade."
      );
    } else {
      setAnalysisStatus("approved");
      setAnalysisResult(
        `${hasPhoto ? "Foto disponível." : "Sem foto anexada."} ${loc.message}. Sem indicadores objetivos de irregularidade — conferência manual da foto pelo gestor.`
      );
    }
  };

  // Análise em lote baseada apenas em dados objetivos:
  // - Fora do perímetro (GPS conhecido, distância > raio) → irregular
  // - Sem foto e/ou sem GPS → incompleto
  // - Restante → sem irregularidade automática (não é validação de identidade)
  const runBatchAnalysis = async () => {
    const targetPunches = filterUser === "all" ? punches : punches.filter((p) => p.user_id === filterUser);
    if (targetPunches.length === 0) {
      toast.error("Nenhum registro encontrado para análise.");
      return;
    }

    setBatchAnalyzing(true);
    setBatchResults(null);
    let approvedCount = 0;
    let outsideCount = 0;
    let incompleteCount = 0;
    const outsideIds: string[] = [];
    const incompleteIds: string[] = [];

    for (const punch of targetPunches) {
      const hasGps = punch.latitude !== null && punch.longitude !== null;
      const hasPhoto = !!punch.face_image_url;

      if (!hasGps || !hasPhoto) {
        incompleteCount++;
        incompleteIds.push(punch.id);
        continue;
      }
      const loc = getLocationAnalysis(punch);
      if (loc.status === "outside") {
        outsideCount++;
        outsideIds.push(punch.id);
      } else {
        approvedCount++;
      }
    }

    setBatchResults({
      total: targetPunches.length,
      approved: approvedCount,
      outside: outsideCount,
      incomplete: incompleteCount,
      outsideIds,
      incompleteIds,
    });
    setBatchAnalyzing(false);
    toast.success("Análise em lote concluída!");
  };


  const getLocationAnalysis = (punch: PunchRecord) => {
    if (!punch.latitude || !punch.longitude) {
      return { status: "no_gps" as const, message: "Sem dados de GPS", distance: null, errorPercent: null, geofence: null };
    }
    if (geofences.length === 0) {
      return { status: "no_geofence" as const, message: "Nenhum geofence cadastrado", distance: null, errorPercent: null, geofence: null };
    }

    let nearest: Geofence | null = null;
    let minDist = Infinity;
    for (const gf of geofences) {
      const d = haversineDistance(punch.latitude, punch.longitude, gf.latitude, gf.longitude);
      if (d < minDist) {
        minDist = d;
        nearest = gf;
      }
    }

    const errorPercent = nearest ? Math.round((minDist / nearest.radius) * 100) : 0;
    const isInside = minDist <= (nearest?.radius || 0);

    return {
      status: isInside ? ("inside" as const) : ("outside" as const),
      message: isInside
        ? `Dentro do perímetro "Definida pelo Gestor" (${Math.round(minDist)}m do centro)`
        : `Fora do perímetro "Definida pelo Gestor" — ${Math.round(minDist)}m do centro (raio: ${nearest?.radius}m)`,
      distance: Math.round(minDist),
      errorPercent,
      geofence: nearest,
    };
  };

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
    });

  const filteredPunches = filterUser === "all" ? punches : punches.filter((p) => p.user_id === filterUser);
  const facePunches = filteredPunches.filter((p) => p.face_image_url);
  const locationPunches = filteredPunches.filter((p) => p.latitude && p.longitude);

  // Unique employees for filter
  const uniqueEmployees = [...new Map(profiles.map((p) => [p.user_id, p])).values()];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ScanFace className="h-6 w-6 text-primary" />
          Registros de Ponto — Conferência
        </h1>
        <p className="text-sm text-muted-foreground">
          Revise a foto e o local de cada registro. O sistema ainda não faz comparação
          biométrica automática de identidade — a validação da foto é manual.
        </p>
      </div>

      {/* Filter & Batch Analysis Controls */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="w-full sm:w-[250px]">
              <SelectValue placeholder="Filtrar por funcionário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os funcionários</SelectItem>
              {uniqueEmployees.map((emp) => (
                <SelectItem key={emp.user_id} value={emp.user_id}>{emp.name || "Sem nome"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runBatchAnalysis} disabled={batchAnalyzing} className="gap-2">
            {batchAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {batchAnalyzing ? "Verificando..." : "Verificar localização e presença de foto"}
          </Button>
        </CardContent>
      </Card>

      {/* Batch Results */}
      {batchResults && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" />
                Resultado da Verificação em Lote
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Verificação baseada só em dados objetivos (GPS x geofence + presença de foto).
                Não é uma validação de identidade.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{batchResults.total}</p>
                  <p className="text-xs text-muted-foreground">Total verificados</p>
                </div>
                <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{batchResults.approved}</p>
                  <p className="text-xs text-muted-foreground">No perímetro, com foto</p>
                </div>
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{batchResults.outside}</p>
                  <p className="text-xs text-muted-foreground">Fora do perímetro</p>
                </div>
                <div className="rounded-lg border border-gray-500/20 bg-gray-500/5 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600">{batchResults.incomplete}</p>
                  <p className="text-xs text-muted-foreground">Sem GPS ou sem foto</p>
                </div>
              </div>

              {/* Detalhes de itens que merecem conferência manual */}
              {(batchResults.outsideIds.length > 0 || batchResults.incompleteIds.length > 0) && (
                <div className="mt-4 space-y-3 border-t border-border pt-4">
                  <h4 className="text-sm font-semibold text-foreground">Precisam de conferência manual:</h4>
                  <div className="grid gap-4 sm:grid-cols-2">




                    {/* Lista de Fora do Perímetro */}
                    {batchResults.outsideIds.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Fora do Perímetro ({batchResults.outsideIds.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {batchResults.outsideIds.map(id => {
                            const p = punches.find(p => p.id === id);
                            return (
                              <Button 
                                key={id} 
                                variant="outline" 
                                size="sm" 
                                className="h-auto py-1 px-2 text-[10px] bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10 text-yellow-700"
                                onClick={() => p && setSelectedPunch(p)}
                              >
                                {p?.profiles?.name?.split(' ')[0] || "Registro"}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Lista de Sem Dados */}
                    {batchResults.incompleteIds.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Sem Dados ({batchResults.incompleteIds.length})</p>
                        <div className="flex flex-wrap gap-2">
                          {batchResults.incompleteIds.map(id => {
                            const p = punches.find(p => p.id === id);
                            return (
                              <Button 
                                key={id} 
                                variant="outline" 
                                size="sm" 
                                className="h-auto py-1 px-2 text-[10px] bg-gray-500/5 border-gray-500/20 hover:bg-gray-500/10 text-gray-700"
                                onClick={() => p && setSelectedPunch(p)}
                              >
                                {p?.profiles?.name?.split(' ')[0] || "Registro"}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* === FACIAL ANALYSIS SECTION === */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  Registros com Imagem Facial
                </CardTitle>
              </CardHeader>
              <CardContent>
                {facePunches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ImageOff className="h-12 w-12 opacity-20 mb-3" />
                    <p className="text-sm text-center">Nenhum registro com imagem facial encontrado.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {facePunches.map((punch) => (
                      <button
                        key={punch.id}
                        onClick={() => analyzeImage(punch)}
                        className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors border ${
                          selectedPunch?.id === punch.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <FaceImage src={punch.face_image_url} alt="Face" className="h-12 w-12 rounded-lg object-cover bg-muted" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {punch.profiles?.name || "Sem nome"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(punch.timestamp)} — {punch.type === "in" ? "Entrada" : "Saída"}
                          </p>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          punch.status === "verified" ? "bg-green-500/15 text-green-600"
                            : punch.status === "flagged" ? "bg-destructive/15 text-destructive"
                            : "bg-yellow-500/15 text-yellow-600"
                        }`}>
                          {punch.status}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-primary" />
                  Resultado da Análise Facial
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  {analysisStatus === "idle" && !selectedPunch && (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <ScanFace className="h-16 w-16 opacity-20 mb-3" />
                      <p className="text-sm text-center">Selecione um registro para analisar.</p>
                    </motion.div>
                  )}

                  {analysisStatus === "analyzing" && (
                    <motion.div key="analyzing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-12">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                        <Bot className="h-16 w-16 text-primary" />
                      </motion.div>
                      <p className="mt-4 text-sm font-medium text-foreground">Analisando imagem...</p>
                    </motion.div>
                  )}

                  {(analysisStatus === "approved" || analysisStatus === "rejected") && selectedPunch && (
                    <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                      <div className="mx-auto max-w-[200px] overflow-hidden rounded-xl border border-border">
                        <FaceImage src={selectedPunch.face_image_url} alt="Análise facial" className="w-full aspect-square object-cover" />
                      </div>
                      <div className="text-center text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{selectedPunch.profiles?.name}</p>
                        <p>{formatDate(selectedPunch.timestamp)}</p>
                      </div>
                      <div className={`flex items-center gap-3 rounded-lg p-4 ${
                        analysisStatus === "approved" ? "bg-green-500/10 border border-green-500/20" : "bg-destructive/10 border border-destructive/20"
                      }`}>
                        {analysisStatus === "approved" ? <ShieldCheck className="h-8 w-8 text-green-500 shrink-0" /> : <ShieldAlert className="h-8 w-8 text-destructive shrink-0" />}
                        <div>
                          <p className="font-semibold text-foreground">{analysisStatus === "approved" ? "Regular (Válido) ✓" : "Irregular ✗"}</p>
                        </div>
                      </div>

                      {analysisResult && (
                        <div className="rounded-lg bg-muted/50 p-4 border border-border">
                          <p className="text-sm text-foreground leading-relaxed">{analysisResult}</p>
                        </div>
                      )}

                      {/* Integrated Location Check for Selected Punch */}
                      {selectedPunch && (
                        <div className="pt-4 border-t border-border space-y-3">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <MapPin className="h-3 w-3" /> Verificação de Localização
                          </h4>
                          {(() => {
                            const loc = getLocationAnalysis(selectedPunch);
                            return (
                              <div className={`rounded-lg p-3 text-xs space-y-2 ${loc.status === 'inside' ? 'bg-green-500/5 border border-green-500/10' : 'bg-destructive/5 border border-destructive/10'}`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">Status:</span>
                                  <span className={loc.status === 'inside' ? 'text-green-600 font-bold' : 'text-destructive font-bold'}>
                                    {loc.status === 'inside' ? '✓ No Perímetro' : '✗ Fora do Perímetro'}
                                  </span>
                                </div>
                                <p className="text-muted-foreground leading-snug">{loc.message}</p>
                                {loc.errorPercent !== null && (
                                  <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                    <span>Margem de erro:</span>
                                    <span className={`font-bold ${loc.errorPercent <= 100 ? 'text-green-600' : 'text-destructive'}`}>
                                      {loc.errorPercent}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>

          {/* === LOCATION ANALYSIS SECTION === */}
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-4">
              <MapPin className="h-5 w-5 text-primary" />
              Análise de Localização do Ponto
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Verifique onde cada ponto foi registrado e a margem de erro em relação ao geofence
            </p>

            {locationPunches.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  <Navigation className="h-12 w-12 opacity-20 mx-auto mb-3" />
                  Nenhum registro com localização GPS encontrado.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {locationPunches.map((punch) => {
                  const loc = getLocationAnalysis(punch);
                  const errorCapped = loc.errorPercent !== null ? Math.min(loc.errorPercent, 999) : null;

                  return (
                    <Card key={punch.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                              loc.status === "inside" ? "bg-green-500/10" : loc.status === "outside" ? "bg-destructive/10" : "bg-muted"
                            }`}>
                              <MapPin className={`h-5 w-5 ${
                                loc.status === "inside" ? "text-green-600" : loc.status === "outside" ? "text-destructive" : "text-muted-foreground"
                              }`} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-card-foreground flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-muted-foreground" />
                                {punch.profiles?.name || "Sem nome"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(punch.timestamp)} — {punch.type === "in" ? "Entrada" : "Saída"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                📍 {punch.latitude?.toFixed(5)}, {punch.longitude?.toFixed(5)}
                                {punch.accuracy && ` (±${punch.accuracy.toFixed(0)}m)`}
                              </p>
                              <p className={`text-xs mt-1 font-medium ${
                                loc.status === "inside" ? "text-green-600" : loc.status === "outside" ? "text-destructive" : "text-muted-foreground"
                              }`}>
                                {loc.message}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            {loc.status === "inside" && (
                              <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-600">
                                ✓ Dentro
                              </span>
                            )}
                            {loc.status === "outside" && (
                              <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-semibold text-destructive">
                                ✗ Fora
                              </span>
                            )}
                            {loc.status === "no_gps" && (
                              <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-600">
                                Sem GPS
                              </span>
                            )}
                            {errorCapped !== null && (
                              <div className="text-right mt-1">
                                <p className="text-[10px] text-muted-foreground">Margem de erro</p>
                                <p className={`text-lg font-bold ${
                                  errorCapped <= 100 ? "text-green-600" : errorCapped <= 200 ? "text-yellow-600" : "text-destructive"
                                }`}>
                                  {errorCapped}%
                                </p>
                              </div>
                            )}
                            {loc.distance !== null && (
                              <p className="text-[10px] text-muted-foreground">{loc.distance}m de distância</p>
                            )}
                          </div>
                        </div>

                        {/* Error bar */}
                        {errorCapped !== null && (
                          <div className="mt-3 space-y-1">
                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(errorCapped, 100)}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                                className={`h-full rounded-full ${
                                  errorCapped <= 100 ? "bg-green-500" : errorCapped <= 200 ? "bg-yellow-500" : "bg-destructive"
                                }`}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>0% (centro)</span>
                              <span>100% (limite)</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FaceAnalysis;
