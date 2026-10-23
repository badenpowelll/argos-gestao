import { cn } from "@/lib/utils";

type PunchStatus = "verified" | "outside_perimeter" | "flagged" | "pending";

const statusConfig: Record<PunchStatus, { label: string; className: string }> = {
  verified: {
    label: "Verificado",
    className: "bg-accent/10 text-accent border-accent/30",
  },
  outside_perimeter: {
    label: "Fora do Perímetro",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
  flagged: {
    label: "Irregularidade",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
  pending: {
    label: "Pendente",
    className: "bg-muted text-muted-foreground border-border",
  },
};

const StatusBadge = ({ status }: { status: PunchStatus }) => {
  const c = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        c.className
      )}
    >
      {c.label}
    </span>
  );
};

export default StatusBadge;
