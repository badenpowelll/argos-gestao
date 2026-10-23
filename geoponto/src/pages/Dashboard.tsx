import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import FaceImage from "@/components/FaceImage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { calculateDailyMinutes } from "@/utils/timeCalculations";
import {
  Users,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  UserX,
  Loader2,
  Coffee,
  Activity,
  Clock,
  Camera,
} from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [allProfileMap, setAllProfileMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      // First get the logged-in user's company_id
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();

      const companyId = myProfile?.company_id;

      // Fetch all company profiles
      const profileQuery = supabase
        .from("profiles")
        .select("user_id, name, company_id");
      if (companyId) profileQuery.eq("company_id", companyId);
      const { data: profileData } = await profileQuery;

      // Fetch user roles to filter only employees
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const employeeUserIds = new Set(
        (rolesData || [])
          .filter((r) => r.role === "employee")
          .map((r) => r.user_id)
      );

      // Only keep profiles that have the employee role
      const employeeProfiles = (profileData || []).filter((p) =>
        employeeUserIds.has(p.user_id)
      );

      // Build a map of ALL profiles (not just employees) for name lookups
      const allProfileMap = Object.fromEntries(
        (profileData || []).map((p) => [p.user_id, p.name || "Sem nome"])
      );

      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      
      const entryQuery = supabase
        .from("time_entries")
        .select("*")
        .gte("timestamp", todayStr + "T00:00:00.000Z")
        .order("timestamp", { ascending: false });
      if (companyId) entryQuery.eq("company_id", companyId);
      const { data: entryData } = await entryQuery;

      setProfiles(employeeProfiles);
      setEntries(entryData || []);
      setAllProfileMap(allProfileMap);
      setLoading(false);
    };

    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalEmployees = profiles.length;
  const uniqueUsersToday = new Set(entries.map((e) => e.user_id)).size;
  const absentToday = Math.max(0, totalEmployees - uniqueUsersToday);

  const profileMap = allProfileMap;

  // Determine who is at lunch vs active
  // Logic: group today's entries by user, check last entry type
  const userLastEntry: Record<string, { type: string; timestamp: string }> = {};
  entries.forEach((e) => {
    if (!userLastEntry[e.user_id] || e.timestamp > userLastEntry[e.user_id].timestamp) {
      userLastEntry[e.user_id] = { type: e.type, timestamp: e.timestamp };
    }
  });

  const activeUsers: string[] = [];
  const lunchUsers: string[] = [];
  
  Object.entries(userLastEntry).forEach(([userId, last]) => {
    // If last entry is "out" and user has exactly 1 out (lunch break), they're at lunch
    const userEntries = entries.filter((e) => e.user_id === userId);
    const outs = userEntries.filter((e) => e.type === "out");
    const ins = userEntries.filter((e) => e.type === "in");
    
    if (last.type === "out" && outs.length === 1 && ins.length === 1) {
      // Only 1 in and 1 out = went to lunch
      lunchUsers.push(userId);
    } else if (last.type === "in") {
      activeUsers.push(userId);
    }
  });

  const punchedUserIds = new Set(entries.map(e => e.user_id));
  const notPunchedUsers = profiles.filter(p => !punchedUserIds.has(p.user_id));

  const todayEntries = entries;
  const delayedEntries = todayEntries.filter(e => {
    if (e.type !== "in") return false;
    const time = new Date(e.timestamp);
    return (time.getHours() > 8 || (time.getHours() === 8 && time.getMinutes() > 15));
  }).length;

  const flagEntries = todayEntries.filter(e => e.status === "flagged" || e.status === "outside_perimeter").length;
  
  const moodEntries = todayEntries.filter(e => e.mood_score != null);
  const avgMood = moodEntries.length > 0 
    ? moodEntries.reduce((acc, curr) => acc + curr.mood_score, 0) / moodEntries.length 
    : 0;

  const moodEmojis: Record<number, string> = { 1: "😢", 2: "😞", 3: "😐", 4: "🙂", 5: "😄" };
  const avgMoodEmoji = moodEmojis[Math.round(avgMood)] || "😶";

  // Horas extras hoje: soma o excedente da jornada de 8h de cada funcionário
  // que já bateu entrada+saída. Baseado em intervalos fechados; entradas em
  // aberto não contam. Regra: max(0, totalMin - 480) por funcionário.
  let extraMinutesToday = 0;
  const entriesByUser: Record<string, { timestamp: string; type: "in" | "out" }[]> = {};
  entries.forEach((e) => {
    (entriesByUser[e.user_id] ||= []).push({ timestamp: e.timestamp, type: e.type });
  });
  Object.values(entriesByUser).forEach((userEntries) => {
    const total = calculateDailyMinutes(userEntries);
    if (total > 480) extraMinutesToday += total - 480;
  });
  const extraHoursStr = extraMinutesToday > 0
    ? `${Math.floor(extraMinutesToday / 60)}h${String(Math.round(extraMinutesToday % 60)).padStart(2, "0")}`
    : "0h00";

  const stats = [
    { 
      label: "Total Funcionários", 
      value: String(totalEmployees), 
      icon: Users, 
      color: "bg-blue-500", 
      textColor: "text-blue-500",
      bgLight: "bg-blue-50 dark:bg-blue-950/20"
    },
    { 
      label: "Presentes Hoje", 
      value: String(uniqueUsersToday), 
      icon: UserCheck, 
      change: totalEmployees > 0 ? `${Math.round((uniqueUsersToday / totalEmployees) * 100)}%` : "0%", 
      color: "bg-emerald-500", 
      textColor: "text-emerald-500",
      bgLight: "bg-emerald-50 dark:bg-emerald-950/20"
    },
    { 
      label: "Ausentes", 
      value: String(absentToday), 
      icon: UserX, 
      color: "bg-indigo-500", 
      textColor: "text-indigo-500",
      bgLight: "bg-indigo-50 dark:bg-indigo-950/20"
    },
    { 
      label: "Registros Hoje", 
      value: String(entries.length), 
      icon: TrendingUp, 
      color: "bg-violet-500", 
      textColor: "text-violet-500",
      bgLight: "bg-violet-50 dark:bg-violet-950/20"
    },
    { 
      label: "Felicidade", 
      value: avgMoodEmoji, 
      icon: Activity, 
      change: avgMood > 0 ? `${avgMood.toFixed(1)}/5` : "Sem dados",
      color: "bg-pink-500", 
      textColor: "text-pink-500",
      bgLight: "bg-pink-50 dark:bg-pink-950/20"
    },
    { 
      label: "Irregularidades", 
      value: String(flagEntries), 
      icon: AlertTriangle, 
      color: "bg-rose-500", 
      textColor: "text-rose-500",
      bgLight: "bg-rose-50 dark:bg-rose-950/20"
    },
    { 
      label: "Atrasos (>08:15)", 
      value: String(delayedEntries), 
      icon: Clock, 
      color: "bg-amber-500", 
      textColor: "text-amber-500",
      bgLight: "bg-amber-50 dark:bg-amber-950/20"
    },
    {
      label: "Horas Extras Hoje",
      value: extraHoursStr,
      icon: TrendingUp,
      color: "bg-teal-500",
      textColor: "text-teal-500",
      bgLight: "bg-teal-50 dark:bg-teal-950/20",
    },
  ];

  const recentEntries = entries.slice(0, 10).map((e) => ({
    id: e.id,
    name: profileMap[e.user_id] || "Desconhecido",
    time: new Date(e.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    type: e.type,
    status: e.status,
    face_image_url: e.face_image_url,
    timestamp: e.timestamp,
  }));

  return (
    <div className="flex flex-col gap-[clamp(1rem,3vh,2rem)] p-[clamp(1rem,4vw,2rem)] w-full max-w-[1920px] mx-auto overflow-x-hidden">
      <header className="flex flex-col gap-1">
        <h1 className="text-[clamp(1.5rem,5vw,2.25rem)] font-bold text-foreground leading-tight">Dashboard</h1>
        <p className="text-[clamp(0.875rem,2vw,1rem)] text-muted-foreground">Visão geral da equipe — dados em tempo real</p>
      </header>

      {/* Stats grid */}
      <div className="grid gap-[clamp(0.75rem,2vw,1.5rem)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className={`border-none shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden ${s.bgLight} group h-full`}>
              <CardContent className="flex items-center gap-[clamp(0.75rem,2vw,1rem)] p-[clamp(1rem,3vw,1.5rem)]">
                <div className={`flex h-[clamp(3rem,8vw,3.5rem)] w-[clamp(3rem,8vw,3.5rem)] shrink-0 items-center justify-center rounded-[clamp(0.75rem,2vw,1rem)] ${s.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                  <s.icon className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[clamp(0.65rem,1.5vw,0.75rem)] font-bold text-muted-foreground uppercase tracking-widest mb-1">{s.label}</p>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className={`text-[clamp(1.5rem,4vw,2.25rem)] font-black ${s.textColor} leading-none`}>{s.value}</p>
                    {s.change && (
                      <span className={`text-[clamp(0.6rem,1.2vw,0.7rem)] font-black px-2 py-0.5 rounded-full bg-white/80 dark:bg-white/10 ${s.textColor} shadow-sm border border-black/5`}>
                        {s.change}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Active vs Lunch vs Not Punched */}
      <div className="grid gap-[clamp(0.75rem,2vw,1.5rem)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-none shadow-sm bg-emerald-50/30 dark:bg-emerald-950/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-green-600" /> Ativos Agora ({activeUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum funcionário ativo no momento.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                {activeUsers.map((userId) => (
                  <div key={userId} className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-foreground">{profileMap[userId] || "Desconhecido"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-amber-50/30 dark:bg-amber-950/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coffee className="h-4 w-4 text-amber-600" /> Em Almoço ({lunchUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lunchUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Ninguém em horário de almoço.</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                {lunchUsers.map((userId) => (
                  <div key={userId} className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2">
                    <Coffee className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-sm font-medium text-foreground">{profileMap[userId] || "Desconhecido"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-rose-50/30 dark:bg-rose-950/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserX className="h-4 w-4 text-rose-600" /> Sem Ponto Hoje ({notPunchedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notPunchedUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Todos bateram ponto hoje!</p>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 no-scrollbar">
                {notPunchedUsers.map((emp) => (
                  <div key={emp.user_id} className="flex items-center gap-2 rounded-md bg-rose-500/10 px-3 py-2">
                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="text-sm font-medium text-foreground">{emp.name || "Sem nome"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Additional Insights Grid */}
      <div className="grid gap-[clamp(0.75rem,2vw,1.5rem)] grid-cols-1 sm:grid-cols-2">
        <Card className="border-none shadow-sm bg-orange-50/50 dark:bg-orange-950/10">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold text-orange-600 uppercase tracking-wider">Horário de Pico</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-black text-orange-700">
              {(() => {
                if (entries.length === 0) return "—";
                const hours = entries.map(e => new Date(e.timestamp).getHours());
                const mostFrequent = hours.sort((a,b) =>
                  hours.filter(v => v===a).length - hours.filter(v => v===b).length
                ).pop();
                return `${String(mostFrequent).padStart(2, '0')}:00`;
              })()}
            </p>
            <p className="text-[10px] text-orange-600/70">Hora com maior volume de entradas/saídas hoje.</p>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm bg-slate-50/50 dark:bg-slate-950/10">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold text-slate-600 uppercase tracking-wider">Status de Sincronização</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-black text-slate-700">
                {Math.round((entries.filter(e => e.sync_status === 'synced').length / (entries.length || 1)) * 100)}%
              </p>
              <div className="flex-1">
                <p className="text-[10px] text-slate-600/70">Registros sincronizados com a nuvem.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent entries */}
      <Card className="border-none shadow-md overflow-hidden bg-card">
        <CardHeader className="pb-4 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 text-[clamp(1rem,2.5vw,1.125rem)] font-bold">
            <Activity className="h-5 w-5 text-primary" /> Últimos Registros de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentEntries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum registro de ponto hoje.
            </p>
          ) : (
            <div className="grid gap-2 grid-cols-1">
              {recentEntries.map((e, i) => (
                <div
                  key={e.id || i}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-4 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
                >
                  <div className="flex items-center gap-3">
                    {e.face_image_url ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="h-10 w-10 cursor-pointer overflow-hidden rounded-full border-2 border-primary/20 bg-muted shrink-0">
                            <FaceImage src={e.face_image_url} alt={e.name} className="h-full w-full object-cover transition-transform hover:scale-110" />
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Registro de {e.name}</DialogTitle>
                          </DialogHeader>
                          <div className="aspect-square overflow-hidden rounded-xl border-2 border-primary/20">
                            <FaceImage src={e.face_image_url} alt={e.name} className="h-full w-full object-cover" />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>{new Date(e.timestamp).toLocaleDateString("pt-BR")} às {e.time}</span>
                            <StatusBadge status={e.status} />
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {e.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.time} — {e.type === "in" ? "Entrada" : "Saída"}</p>
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
