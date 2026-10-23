import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MapPin, ScanFace, WifiOff, ArrowRight } from "lucide-react";

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-primary pt-32 pb-20 md:pt-40 md:pb-32">
      {/* Abstract grid pattern */}
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="container relative z-10 mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mx-auto max-w-3xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-1.5 text-sm text-primary-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" />
            Controle de ponto inteligente
          </div>

          <h1 className="mb-6 text-4xl font-black leading-tight tracking-tight text-primary-foreground md:text-6xl">
            Sistema de Ponto Eletrônico{" "}
            <span className="text-accent">Inteligente</span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-lg text-primary-foreground/80 md:text-xl">
            Foto com verificação de enquadramento, geolocalização e funcionamento offline.
            Elimine o relógio físico e registre presença direto pelo celular.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-6 text-base font-semibold rounded-lg"
              asChild
            >
              <a href="/login">Acessar plataforma <ArrowRight className="ml-2 h-5 w-5" /></a>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 px-8 py-6 text-base rounded-lg"
            >
              Ver demonstração
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mx-auto mt-16 flex max-w-lg justify-center gap-8 text-primary-foreground/70"
        >
          <div className="flex items-center gap-2 text-sm">
            <ScanFace className="h-5 w-5" /> Facial
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-5 w-5" /> Geolocalização
          </div>
          <div className="flex items-center gap-2 text-sm">
            <WifiOff className="h-5 w-5" /> Offline
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroSection;
