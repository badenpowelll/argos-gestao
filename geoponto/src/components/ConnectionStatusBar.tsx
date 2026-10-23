import { motion } from "framer-motion";

type Status = "online" | "syncing" | "offline";

const config: Record<Status, { color: string; label: string; dot: string }> = {
  online: { color: "bg-accent", label: "Online", dot: "bg-accent" },
  syncing: { color: "bg-amber-500", label: "Sincronizando...", dot: "bg-amber-500" },
  offline: { color: "bg-primary", label: "Modo sem internet: ponto liberado", dot: "bg-primary" },
};

const ConnectionStatusBar = ({ status }: { status: Status }) => {
  const c = config[status];

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className={`flex items-center justify-center gap-2 py-1.5 text-xs font-medium ${
        status === "online"
          ? "bg-accent/10 text-accent"
          : status === "syncing"
          ? "bg-amber-500/10 text-amber-600"
          : "bg-primary/10 text-primary"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {status === "syncing" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${c.dot}`} />
      </span>
      {c.label}
    </motion.div>
  );
};

export default ConnectionStatusBar;
