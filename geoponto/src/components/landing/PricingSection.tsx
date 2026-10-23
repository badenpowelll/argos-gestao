import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "34,99",
    description: "Para pequenas equipes",
    limit: "Até 5 funcionários",
    features: [
      "Foto com verificação de enquadramento",
      "Geolocalização",
      "Funcionamento offline",
      "Relatórios básicos",
      "Suporte por e-mail",
    ],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "64,99",
    description: "Mais popular",
    limit: "Até 30 funcionários",
    features: [
      "Tudo do Starter",
      "Cálculo automático de jornada",
      "Ajustes de ponto",
      "Dashboard completo",
      "Relatórios CLT avançados",
      "Suporte prioritário",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "94,99",
    description: "Para grandes empresas",
    limit: "Funcionários ilimitados",
    features: [
      "Tudo do Pro",
      "API de integração",
      "Auditoria completa",
      "Geofence personalizado",
      "Suporte dedicado",
    ],
    highlighted: false,
  },
];

const PricingSection = () => {
  return (
    <section className="bg-secondary py-20 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Planos e preços
          </h2>
          <p className="text-muted-foreground">
            7 dias grátis em todos os planos. Sem compromisso.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-lg border p-8 ${
                plan.highlighted
                  ? "border-primary bg-card shadow-lg ring-2 ring-primary"
                  : "bg-card shadow-sm"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Recomendado
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-card-foreground">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-black text-foreground">
                  R$ {plan.price}
                </span>
                <span className="text-muted-foreground">/mês</span>
                <p className="mt-1 text-sm font-medium text-primary">
                  {plan.limit}
                </p>
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full rounded-lg py-5 font-semibold ${
                  plan.highlighted
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
