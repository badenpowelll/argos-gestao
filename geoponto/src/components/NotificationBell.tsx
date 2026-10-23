import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MoodNotification {
  id: string;
  employeeName: string;
  moodScore: number;
  timestamp: string;
  read: boolean;
}

const NotificationBell = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<MoodNotification[]>([]);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;

    // Get user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) return;

    // Get recent time_entries with mood_score 1 or 2 from the company
    const { data: entries } = await supabase
      .from("time_entries")
      .select("id, user_id, mood_score, timestamp")
      .eq("company_id", profile.company_id)
      .in("mood_score", [1, 2])
      .order("timestamp", { ascending: false })
      .limit(20);

    if (!entries || entries.length === 0) {
      setNotifications([]);
      return;
    }

    // Get employee names
    const userIds = [...new Set(entries.map((e) => e.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", userIds);

    const nameMap: Record<string, string> = {};
    profiles?.forEach((p) => {
      nameMap[p.user_id] = p.name || "Sem nome";
    });

    // Check localStorage for read status
    const readIds: string[] = JSON.parse(localStorage.getItem("read_notifications") || "[]");

    setNotifications(
      entries.map((e) => ({
        id: e.id,
        employeeName: nameMap[e.user_id] || "Funcionário",
        moodScore: e.mood_score!,
        timestamp: e.timestamp,
        read: readIds.includes(e.id),
      }))
    );
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const hasUrgent = notifications.some((n) => !n.read);

  const markAllRead = () => {
    const ids = notifications.map((n) => n.id);
    localStorage.setItem("read_notifications", JSON.stringify(ids));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      markAllRead();
    }
  };

  const moodLabel = (score: number) =>
    score === 1 ? "Muito triste (1)" : "Triste (2)";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
          title="Notificações"
        >
          <Bell
            className={cn(
              "h-4 w-4",
              hasUrgent
                ? "text-destructive animate-[bell-pulse_0.4s_ease-in-out_infinite]"
                : "text-muted-foreground"
            )}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground animate-[bell-pulse_0.4s_ease-in-out_infinite]">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="border-b p-3">
          <h4 className="text-sm font-semibold text-foreground">Notificações</h4>
          {notifications.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} não lida(s)`
                : "Todas lidas"}
            </p>
          )}
        </div>
        <ScrollArea className="max-h-72">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação.
            </p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex gap-3 p-3 text-sm",
                    !n.read && "bg-destructive/5"
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                    <span className="text-lg">
                      {n.moodScore === 1 ? "😢" : "😞"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {n.employeeName}
                    </p>
                    <p className="text-xs text-destructive font-semibold">
                      {moodLabel(n.moodScore)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(n.timestamp), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
