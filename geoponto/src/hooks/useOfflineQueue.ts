import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const QUEUE_KEY = "geoponto_offline_queue";
const MAX_ATTEMPTS = 5;
// Registros com mais de 3 dias em fila local são descartados para reduzir
// o tempo de retenção de imagens biométricas em localStorage (LGPD).
// Se a cifragem client-side for implementada, esse prazo pode ser revisado.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface OfflinePunch {
  id: string;
  user_id: string;
  company_id: string | null;
  type: "in" | "out";
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  status: string;
  sync_status: "pending" | "failed";
  face_image_url: string | null;
  face_image_data?: string | null; // base64 da foto para upload ao sincronizar
  mood_score: number | null;
  notes?: string | null;
  device_id: string | null;
  ip_address: string | null;
  attempts?: number;
  last_error?: string | null;
}

const getQueue = (): OfflinePunch[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveQueue = (queue: OfflinePunch[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

const pruneExpired = (queue: OfflinePunch[]): OfflinePunch[] => {
  const now = Date.now();
  return queue.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return isFinite(t) && now - t < MAX_AGE_MS;
  });
};

const isNetworkError = (err: any) => {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    !navigator.onLine ||
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout")
  );
};

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<OfflinePunch[]>(() => pruneExpired(getQueue()));
  const [syncing, setSyncing] = useState(false);

  const addToQueue = useCallback((punch: OfflinePunch) => {
    setQueue((prev) => {
      const updated = [...prev, { ...punch, attempts: 0 }];
      saveQueue(updated);
      return updated;
    });
  }, []);

  const syncQueue = useCallback(async () => {
    const currentQueue = pruneExpired(getQueue());
    if (currentQueue.length === 0) {
      saveQueue([]);
      setQueue([]);
      return;
    }

    setSyncing(true);
    const remaining: OfflinePunch[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < currentQueue.length; i++) {
      const punch = currentQueue[i];
      const { id, face_image_data, attempts = 0, last_error, sync_status: _s, ...insertData } = punch;
      try {
        let faceUrl = insertData.face_image_url;
        if (!faceUrl && face_image_data) {
          try {
            const base64 = face_image_data.split(",")[1];
            if (base64) {
              const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: "image/jpeg" });
              const path = `face-images/${insertData.user_id}/${new Date(insertData.timestamp).getTime()}_sync.jpg`;
              const { error: upErr } = await supabase.storage
                .from("avatars")
                .upload(path, blob, { contentType: "image/jpeg" });
              if (!upErr) {
                // Bucket é privado — armazenamos o path; a URL assinada é gerada na exibição.
                faceUrl = path;
              }
            }
          } catch { /* mantém sem foto */ }
        }

        const { error } = await supabase
          .from("time_entries")
          .insert({ ...insertData, face_image_url: faceUrl, sync_status: "synced" } as any);

        if (error) {
          if (isNetworkError(error)) {
            // Erro de rede: preserva o restante para próxima tentativa
            remaining.push(...currentQueue.slice(i).map((p) => ({
              ...p,
              sync_status: "pending" as const,
            })));
            break;
          }
          // Erro definitivo do banco: mantém item marcado como "failed" para o
          // usuário ver o alerta e decidir agir (nunca descartamos silenciosamente).
          const nextAttempts = attempts + 1;
          console.error("Sync error for punch:", error);
          remaining.push({
            ...punch,
            attempts: nextAttempts,
            last_error: error.message ?? "Falha na sincronização",
            sync_status: nextAttempts >= MAX_ATTEMPTS ? "failed" : "pending",
          });
          failedCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        // Falha de rede inesperada: preserva o restante
        remaining.push(...currentQueue.slice(i).map((p) => ({
          ...p,
          sync_status: "pending" as const,
        })));
        break;
      }
    }

    saveQueue(remaining);
    setQueue(remaining);
    setSyncing(false);

    if (successCount > 0) {
      toast.success(`${successCount} registro(s) sincronizado(s) com sucesso!`);
      window.dispatchEvent(new CustomEvent("geoponto:queue-synced", { detail: { count: successCount } }));
    }
    if (failedCount > 0) {
      toast.error(
        `${failedCount} registro(s) com falha ao sincronizar. Verifique em "Meu Ponto" e tente reenviar.`,
        { duration: 8000 }
      );
    }
  }, []);

  const retryQueue = useCallback(async () => {
    // Reseta status para "pending" e tenta novamente, independente do estado atual
    const q = getQueue().map((p) => ({ ...p, sync_status: "pending" as const }));
    saveQueue(q);
    setQueue(q);
    await syncQueue();
  }, [syncQueue]);

  const clearFailed = useCallback(() => {
    const kept = getQueue().filter((p) => p.sync_status !== "failed");
    saveQueue(kept);
    setQueue(kept);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (getQueue().some((p) => p.sync_status === "pending")) {
        syncQueue();
      }
    };

    window.addEventListener("online", handleOnline);

    if (navigator.onLine && getQueue().some((p) => p.sync_status === "pending")) {
      syncQueue();
    }

    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueue]);

  const failedCount = queue.filter((p) => p.sync_status === "failed").length;
  const pendingCount = queue.filter((p) => p.sync_status !== "failed").length;

  return {
    queue,
    addToQueue,
    syncQueue,
    retryQueue,
    clearFailed,
    syncing,
    pendingCount,
    failedCount,
    totalCount: queue.length,
  };
};
