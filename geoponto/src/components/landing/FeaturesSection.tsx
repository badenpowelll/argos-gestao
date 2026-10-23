import { motion } from "framer-motion";
import {
  ScanFace,
  MapPin,
  LayoutDashboard,
  Edit,
} from "lucide-react";

const features = [
  {
    icon: ScanFace,
    title: "Foto com verificação de enquadramento",
    description:
      "Captura de foto no momento do ponto, com verificação de enquadramento facial. Conferência de identidade feita manualmente pelo gestor.",
  },
  {
    icon: MapPin,
    title: "Geolocalização e Geofence",
    description:
      "Valide a localização do funcionário automaticamente contra o perímetro configurado pela empresa.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard Administrativo",
    description:
      "Presença em tempo real, atrasos, faltas e horas extras em um painel completo.",
  },
  {
    icon: Edit,
    title: "Ajustes de Ponto",
    description:
      "Funcionários solicitam ajustes. Gestores aprovam com auditoria completa.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="bg-background py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Funcionalidades completas
          </h2>
          <p className="text-muted-foreground">
            Tudo integrado para substituir seu sistema de ponto atual.
          </p>
        </div>

        <div className="mx-auto max-w-4xl space-y-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex items-start gap-5 rounded-lg border bg-card p-6"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-card-foreground">
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {f.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
