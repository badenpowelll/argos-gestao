import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="bg-primary py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="mb-4 text-3xl font-bold text-primary-foreground md:text-4xl">
          Pronto para modernizar seu controle de ponto?
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-primary-foreground/80">
          Entre em contato conosco e conheça nossos planos.
        </p>
        <Button
          size="lg"
          className="bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-6 text-base font-semibold rounded-lg"
          asChild
        >
          <a href="https://wa.me/5584998590183" target="_blank" rel="noopener noreferrer">
            Fale conosco <ArrowRight className="ml-2 h-5 w-5" />
          </a>
        </Button>
      </div>
    </section>
  );
};

export default CTASection;
