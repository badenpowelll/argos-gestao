import { motion } from "framer-motion";
import {
  ScanFace,
  MapPin,
  WifiOff,
  Clock,
  FileText,
  Shield,
} from "lucide-react";

const benefits = [
  {
    icon: ScanFace,
    title: "Sem relógio físico",
    description: "Foto com verificação de enquadramento pelo celular. Prático e auditável.",
  },
  {
    icon: WifiOff,
    title: "Funciona offline",
    description: "Registre ponto mesmo sem internet. Sincroniza automaticamente.",
  },
  {
    icon: MapPin,
    title: "Funcionários externos",
    description: "Geolocalização para equipes em campo com geofence configurável.",
  },
  {
    icon: Clock,
    title: "Cálculo automático de jornada",
    description: "Diferença de jornada calculada automaticamente em cada relatório de ponto.",
  },
  {
    icon: FileText,
    title: "Relatórios CLT",
    description: "Espelho de ponto, atrasos, faltas. Exporte PDF e CSV.",
  },
  {
    icon: Shield,
    title: "Seguro e em conformidade",
    description: "LGPD e auditoria completa, com conferência manual de fotos e localização pelo gestor.",
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const BenefitsSection = () => {
  return (
    <section className="bg-secondary py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Por que escolher o <span className="text-primary">GeoPonto</span>?
          </h2>
          <p className="text-muted-foreground">
            Tudo o que sua empresa precisa para controle de ponto, em uma única plataforma.
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-3"
        >
          {benefits.map((b) => (
            <motion.div
              key={b.title}
              variants={itemVariants}
              className="rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <b.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-card-foreground">
                {b.title}
              </h3>
              <p className="text-sm text-muted-foreground">{b.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default BenefitsSection;
