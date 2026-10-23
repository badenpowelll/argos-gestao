import { useState, useEffect, useCallback } from "react";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CameraPreview from "@/components/CameraPreview";
import MoodPicker from "@/components/MoodPicker";
import StatusBadge from "@/components/StatusBadge";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { nearestGeofence, type GeofenceLike } from "@/utils/geo";
import { toast } from "sonner";
import {
  MapPin,
  Clock,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UtensilsCrossed,
  RotateCcw,
} from "lucide-react";

type PunchStep = "entrada" | "saida_almoco" | "retorno_almoco" | "saida";

interface PunchEntry {
  id: string;
  time: string;
  step: PunchStep;
  status: "verified" | "outside_perimeter" | "flagged" | "pending";
}

const PUNCH_STEPS: { key: PunchStep; label: string; icon: React.ReactNode; number: number; bgClass: string }[] = [
  { key: "entrada", label: "Entrada", icon: <LogIn className="h-7 w-7" />, number: 1, bgClass: "bg-[hsl(48,95%,45%)] hover:bg-[hsl(48,95%,40%)]" },
  { key: "saida_almoco", label: "Pausa", icon: <UtensilsCrossed className="h-7 w-7" />, number: 2, bgClass: "bg-[hsl(30,80%,50%)] hover:bg-[hsl(30,80%,45%)]" },
  { key: "retorno_almoco", label: "Retorno Pausa", icon: <RotateCcw className="h-7 w-7" />, number: 3, bgClass: "bg-[hsl(160,84%,30%)] hover:bg-[hsl(160,84%,25%)]" },
  { key: "saida", label: "Saída", icon: <LogOut className="h-7 w-7" />, number: 4, bgClass: "bg-[hsl(0,70%,50%)] hover:bg-[hsl(0,70%,45%)]" },
];

// Map UI steps to DB punch_type enum ("in" | "out")
const stepToType = (step: PunchStep): "in" | "out" => {
  return step === "entrada" || step === "retorno_almoco" ? "in" : "out";
};

// Determine the step from the sequence of DB entries for today
const deriveStepFromIndex = (index: number): PunchStep => {
  const steps: PunchStep[] = ["entrada", "saida_almoco", "retorno_almoco", "saida"];
  return steps[Math.min(index, steps.length - 1)];
};

const PunchClock = () => {
  const { user } = useAuth();
  const [cameraActive, setCameraActive] = useState(false);
  const [punching, setPunching] = useState(false);
  const [activePunchStep, setActivePunchStep] = useState<PunchStep | null>(null);
  const [pendingImageData, setPendingImageData] = useState<string | null>(null);
  const [showMoodPicker, setShowMoodPicker] = useState(false);
  const [showExitReason, setShowExitReason] = useState(false);
  const [exitReason, setExitReason] = useState("");
  const [lastPunch, setLastPunch] = useState<PunchEntry | null>(null);
  const [todayPunches, setTodayPunches] = useState<PunchEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const geo = useGeolocation();
  const { addToQueue, pendingCount, syncing } = useOfflineQueue();

  // Load today's punches from DB (intervalo no fuso local do usuário)
  // Estratégia offline-first: se offline, usa cache local imediatamente e não
  // trava a UI. Se online, consulta o banco e atualiza o cache.
  const loadTodayPunches = useCallback(async () => {
    if (!user) {
      setLoadingEntries(false);
      return;
    }
    const cacheKey = `geoponto_today_${user.id}_${new Date().toDateString()}`;

    // 1) Hidrata a partir do cache local (funciona offline)
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const entries = JSON.parse(cached) as PunchEntry[];
        setTodayPunches(entries);
        if (entries.length > 0) setLastPunch(entries[entries.length - 1]);
      }
    } catch { /* ignore */ }

    // Libera a UI imediatamente — nunca deixa o usuário preso no spinner
    setLoadingEntries(false);

    // 2) Se offline, para por aqui (não tenta rede)
    if (!navigator.onLine) return;

    // 3) Se online, busca dados frescos com timeout para não travar
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("timestamp", start.toISOString())
        .lte("timestamp", end.toISOString())
        .order("timestamp", { ascending: true });

      if (error) {
        console.warn("Load punches (offline fallback):", error.message);
        return;
      }
      if (data) {
        const entries: PunchEntry[] = data.map((entry, index) => ({
          id: entry.id,
          time: new Date(entry.timestamp).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          step: deriveStepFromIndex(index),
          status: entry.status as PunchEntry["status"],
        }));
        setTodayPunches(entries);
        if (entries.length > 0) setLastPunch(entries[entries.length - 1]);
        try { localStorage.setItem(cacheKey, JSON.stringify(entries)); } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn("Load punches network error — mantendo cache local");
    }
  }, [user]);

  useEffect(() => {
    loadTodayPunches();
  }, [loadTodayPunches]);

  // Recarrega quando a fila offline é sincronizada para refletir status "verified"
  useEffect(() => {
    const handler = () => loadTodayPunches();
    window.addEventListener("geoponto:queue-synced", handler);
    return () => window.removeEventListener("geoponto:queue-synced", handler);
  }, [loadTodayPunches]);

  // Persiste os pontos do dia no cache local — garante que registros feitos
  // offline continuem visíveis mesmo se o app for reaberto sem internet.
  useEffect(() => {
    if (!user) return;
    const cacheKey = `geoponto_today_${user.id}_${new Date().toDateString()}`;
    try { localStorage.setItem(cacheKey, JSON.stringify(todayPunches)); } catch { /* ignore */ }
  }, [todayPunches, user]);

  const registeredSteps = todayPunches.map((p) => p.step);

  const handlePunch = (step: PunchStep) => {
    setActivePunchStep(step);
    setCameraActive(true);
    geo.requestPosition();
    
    // Feedback visual imediato de carregamento de GPS se necessário
    if (!geo.latitude && !geo.error) {
      toast.info("Ativando GPS para registro preciso...");
    }
  };

  const handleValidated = async (imageData: string) => {
    if (!activePunchStep || !user) return;
    setPendingImageData(imageData);
    setCameraActive(false);

    const now = new Date();
    // Se for Saída (passo 4) e antes das 16:45, solicitar justificativa
    const beforeCutoff = now.getHours() < 16 || (now.getHours() === 16 && now.getMinutes() < 45);
    if (activePunchStep === "saida" && beforeCutoff) {
      setShowExitReason(true);
    } else {
      setShowMoodPicker(true);
    }
  };

  const handleExitReasonSubmit = () => {
    if (!exitReason.trim()) {
      toast.error("Por favor, informe o motivo da saída antecipada.");
      return;
    }
    setShowExitReason(false);
    setShowMoodPicker(true);
  };

  const handleMoodSelected = async (moodScore: number) => {
    if (!activePunchStep || !user || pendingImageData === null) return;
    setPunching(true);

    const now = new Date();
    const punchType = stepToType(activePunchStep);
    
    // Fallback: se o GPS ainda estiver carregando, tenta forçar uma atualização rápida ou usa a última conhecida
    let currentLat = geo.latitude;
    let currentLng = geo.longitude;
    let currentAcc = geo.accuracy;
    
    // Se o GPS ainda estiver carregando e não tivermos coordenadas, impedimos o registro
    if (geo.loading && !currentLat) {
      toast.error("Aguardando localização precisa do GPS. Por favor, tente novamente em instantes.");
      setPunching(false);
      return;
    }

    // --- Validação de geofence (Haversine) ---
    // Carrega geofences do cache local (funciona offline). Serão atualizadas
    // no bloco online abaixo, assim o próximo ponto já usa dados frescos.
    let fences: GeofenceLike[] = [];
    try {
      const cachedFences = localStorage.getItem("geoponto_geofences");
      if (cachedFences) fences = JSON.parse(cachedFences);
    } catch { /* ignore */ }

    let status: "verified" | "flagged" | "outside_perimeter" | "pending" = currentLat ? "verified" : "flagged";
    if (currentLat && currentLng && fences.length > 0) {
      const nearest = nearestGeofence(currentLat, currentLng, fences);
      if (nearest && !nearest.inside) {
        status = "outside_perimeter";
      }
    }

    // Try to get cached company_id
    let companyId: string | null = null;
    try {
      const cached = localStorage.getItem("geoponto_company_id");
      if (cached) companyId = cached;
    } catch {}

    const isOnline = navigator.onLine;

    try {
      // Get fresh company_id and upload image only if online
      if (isOnline) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("user_id", user.id)
            .single();
          companyId = profile?.company_id || null;
          if (companyId) localStorage.setItem("geoponto_company_id", companyId);
        } catch (err) {
          console.warn("Falha ao buscar company_id online, usando cache se disponível");
        }

        // Atualiza cache de geofences da empresa para conferências futuras.
        if (companyId) {
          try {
            const { data: fenceData } = await supabase
              .from("geofences")
              .select("id, name, latitude, longitude, radius")
              .eq("company_id", companyId);
            if (fenceData && fenceData.length > 0) {
              const normalized: GeofenceLike[] = fenceData.map((f: any) => ({
                id: f.id,
                name: f.name,
                latitude: Number(f.latitude),
                longitude: Number(f.longitude),
                radius: Number(f.radius),
              }));
              localStorage.setItem("geoponto_geofences", JSON.stringify(normalized));
              // Reavalia status com dados frescos do banco, prevalecendo sobre o cache.
              if (currentLat && currentLng) {
                const nearest = nearestGeofence(currentLat, currentLng, normalized);
                if (nearest && !nearest.inside) {
                  status = "outside_perimeter";
                } else {
                  status = "verified";
                }
              }
            }
          } catch { /* ignore */ }
        }
      }

      // Capture IP address if online
      let ipAddress: string | null = null;
      if (isOnline) {
        try {
          const ipRes = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
          const ipData = await ipRes.json();
          ipAddress = ipData.ip || null;
        } catch { /* ignore */ }
      }

      // Upload face image if available and online
      let faceImageUrl: string | null = null;
      if (pendingImageData && isOnline) {
        try {
          const base64Data = pendingImageData.split(",")[1];
          if (base64Data) {
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "image/jpeg" });

            const filePath = `face-images/${user.id}/${now.getTime()}.jpg`;
            const { error: uploadError } = await supabase.storage
              .from("avatars")
              .upload(filePath, blob, { contentType: "image/jpeg" });

            if (!uploadError) {
              // Bucket é privado — guardamos apenas o path do arquivo; a URL assinada
              // é gerada no momento da exibição (ver src/components/FaceImage.tsx).
              faceImageUrl = filePath;
            }
          }
        } catch (uploadErr) {
          console.error("Face image upload error:", uploadErr);
        }
      }

      const punchData = {
        user_id: user.id,
        company_id: companyId,
        type: punchType,
        timestamp: now.toISOString(),
        latitude: currentLat || null,
        longitude: currentLng || null,
        accuracy: currentAcc || null,
        status,
        sync_status: isOnline ? ("synced" as const) : ("pending" as const),
        face_image_url: faceImageUrl,
        mood_score: moodScore,
        notes: exitReason || null,
        device_id: navigator.userAgent?.slice(0, 100) || null,
        ip_address: ipAddress,
      };

      if (isOnline) {
        const { data: inserted, error } = await supabase
          .from("time_entries")
          .insert(punchData as any)
          .select()
          .single();

        if (error) throw error;

        const entry: PunchEntry = {
          id: inserted.id,
          time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          step: activePunchStep,
          status: inserted.status as PunchEntry["status"],
        };

        setTodayPunches((prev) => [...prev, entry]);
        setLastPunch(entry);
        toast.success(`${PUNCH_STEPS.find((s) => s.key === activePunchStep)?.label} registrada!`);
      } else {
        throw new Error("offline");
      }
    } catch (err: any) {
      console.warn("Triggering offline flow:", err.message || "manual");
      
      const punchData = {
        user_id: user.id,
        company_id: companyId,
        type: punchType,
        timestamp: now.toISOString(),
        latitude: currentLat || null,
        longitude: currentLng || null,
        accuracy: currentAcc || null,
        status,
        sync_status: "pending" as const,
        face_image_url: null,
        mood_score: moodScore,
        notes: exitReason || null,
        device_id: navigator.userAgent?.slice(0, 100) || null,
        ip_address: null,
      };

      addToQueue({
        id: `offline_${now.getTime()}`,
        ...punchData,
        face_image_data: pendingImageData || null,
      });

      const entry: PunchEntry = {
        id: `offline_${now.getTime()}`,
        time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        step: activePunchStep,
        status: "pending",
      };

      setTodayPunches((prev) => [...prev, entry]);
      setLastPunch(entry);
      toast.info(`${PUNCH_STEPS.find((s) => s.key === activePunchStep)?.label} salva offline. Será sincronizada automaticamente.`);
    } finally {
      setPunching(false);
      setCameraActive(false);
      setShowMoodPicker(false);
      setPendingImageData(null);
      setActivePunchStep(null);
      setExitReason("");
    }
  };

  const getStepStatus = (step: PunchStep): "done" | "next" | "locked" => {
    if (registeredSteps.includes(step)) return "done";
    const stepIndex = PUNCH_STEPS.findIndex((s) => s.key === step);
    const nextIndex = registeredSteps.length;
    if (stepIndex === nextIndex) return "next";
    return "locked";
  };

  if (loadingEntries) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[min(100%,32rem)] flex flex-col gap-[clamp(1.5rem,5vh,3rem)] p-[clamp(1rem,5vw,2rem)]">

      {/* Clock display */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <RealTimeClock />
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </motion.div>

      {/* Camera */}
      <AnimatePresence>
        {cameraActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <p className="mb-2 text-center text-sm font-semibold text-foreground">
              {PUNCH_STEPS.find((s) => s.key === activePunchStep)?.label}
            </p>
            <CameraPreview isActive={cameraActive} onValidated={handleValidated} />
            <div className="mt-3 flex justify-center gap-3">
              <Button
                onClick={() => handleValidated("")}
                disabled={punching}
                className="bg-primary text-primary-foreground rounded-lg px-6"
              >
                {punching ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                {punching ? "Validando..." : "Confirmar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setCameraActive(false); setActivePunchStep(null); }}
                disabled={punching}
                className="rounded-lg"
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Exit Reason Dialog (NR-01) */}
      <AnimatePresence>
        {showExitReason && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-4"
          >
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <p className="font-bold text-sm">Saída Antecipada (Antes das 16:45)</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Você está registrando sua saída antes do horário padrão (16:45). Por favor, informe o motivo:
            </p>
            <textarea
              className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              rows={3}
              placeholder="Descreva o motivo (ex: consulta médica, dispensa, etc.)"
              value={exitReason}
              onChange={(e) => setExitReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={handleExitReasonSubmit} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirmar e Continuar
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { setShowExitReason(false); setActivePunchStep(null); }}
                className="flex-1"
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mood Picker (NR-01) */}
      <AnimatePresence>
        {showMoodPicker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <MoodPicker onSelect={handleMoodSelected} loading={punching} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4 Punch Cards */}
      {!cameraActive && !showMoodPicker && !showExitReason && (
        <div className="grid grid-cols-2 gap-[clamp(0.75rem,3vw,1.25rem)] w-full">
          {PUNCH_STEPS.map((step, i) => {
            const status = getStepStatus(step.key);
            const punch = todayPunches.find((p) => p.step === step.key);

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <button
                  disabled={status !== "next"}
                  onClick={() => status === "next" && handlePunch(step.key)}
                  className={`relative w-full aspect-square sm:aspect-auto sm:min-h-[140px] rounded-[clamp(1rem,3vw,1.5rem)] p-[clamp(1rem,3vw,1.5rem)] text-white transition-all duration-300 shadow-md flex flex-col items-center justify-center gap-2 ${
                    status === "done"
                      ? `${step.bgClass} opacity-80`
                      : status === "next"
                      ? `${step.bgClass} shadow-lg scale-100 hover:scale-[1.03] active:scale-95 ring-2 ring-white/30`
                      : `${step.bgClass} opacity-30 cursor-not-allowed`
                  }`}
                >
                  {/* Number */}
                  <span className="absolute top-[clamp(0.5rem,2vw,1rem)] left-[clamp(0.75rem,2vw,1.25rem)] text-[clamp(1.5rem,4vw,2.5rem)] font-black opacity-30 select-none">{step.number}</span>
                  {/* Content */}
                  <div className="flex flex-col items-center justify-center text-center gap-[clamp(0.25rem,1vw,0.5rem)] z-10">
                    <span className="text-[clamp(0.875rem,2.5vw,1.125rem)] font-bold tracking-tight">{step.label}</span>
                    <div className="transform transition-transform duration-300 group-hover:scale-110">
                      {step.icon}
                    </div>
                    {punch ? (
                      <span className="text-[clamp(0.7rem,1.5vw,0.875rem)] font-bold bg-black/20 px-2 py-0.5 rounded-full">{punch.time}</span>
                    ) : status === "next" ? (
                      <span className="text-[clamp(0.6rem,1.2vw,0.75rem)] font-medium opacity-90 animate-pulse">Toque para bater</span>
                    ) : null}
                  </div>
                  {/* Done check */}
                  {status === "done" && (
                    <CheckCircle2 className="absolute top-[clamp(0.5rem,2vw,1rem)] right-[clamp(0.75rem,2vw,1.25rem)] h-5 w-5 opacity-90" />
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Geolocation status */}
      <Card className="border bg-card">
        <CardContent className="flex items-center gap-3 p-4">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-card-foreground">Localização</p>
            <p className="text-xs text-muted-foreground">
              {geo.loading
                ? "Obtendo GPS..."
                : geo.latitude
                ? `${geo.latitude.toFixed(5)}, ${geo.longitude?.toFixed(5)} (±${geo.accuracy?.toFixed(0)}m)`
                : geo.error || "Toque para obter localização"}
            </p>
          </div>
          {geo.latitude ? (
            <CheckCircle2 className="h-5 w-5 text-accent" />
          ) : geo.error ? (
            <AlertTriangle className="h-5 w-5 text-amber-500" />
          ) : null}
        </CardContent>
      </Card>

      {/* Offline sync indicator */}
      {pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            {syncing ? (
              <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {syncing ? "Sincronizando..." : `${pendingCount} registro(s) pendente(s)`}
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {syncing ? "Enviando registros salvos offline..." : "Serão sincronizados quando a conexão voltar."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last punch feedback */}
      <AnimatePresence>
        {lastPunch && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      {PUNCH_STEPS.find((s) => s.key === lastPunch.step)?.label} registrada
                    </p>
                    <p className="text-xs text-muted-foreground">{lastPunch.time}</p>
                  </div>
                </div>
                <StatusBadge status={lastPunch.status} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today's punches summary */}
      {todayPunches.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-card-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" /> Registros de Hoje
            </h3>
            <div className="space-y-2">
              {todayPunches.map((p) => {
                const stepInfo = PUNCH_STEPS.find((s) => s.key === p.step);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{stepInfo?.icon}</span>
                      <span className="text-sm font-medium text-foreground">
                        {stepInfo?.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">{p.time}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const RealTimeClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <h1 className="text-5xl font-black tabular-nums tracking-tight text-foreground">
      {time.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
    </h1>
  );
};

export default PunchClock;
