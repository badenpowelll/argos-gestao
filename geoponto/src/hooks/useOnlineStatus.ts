import { useState, useEffect } from "react";

type ConnectionStatus = "online" | "syncing" | "offline";

export const useOnlineStatus = () => {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? "online" : "offline"
  );

  useEffect(() => {
    const goOnline = () => setStatus("online");
    const goOffline = () => setStatus("offline");

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const setSyncing = () => setStatus("syncing");
  const setOnline = () => setStatus("online");

  return { status, setSyncing, setOnline };
};
