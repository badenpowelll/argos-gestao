import { MapPin, Phone, Mail, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import argosLogo from "@/assets/argos-logo.jpg";

const Footer = () => {
  return (
    <footer className="border-t bg-background py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 md:grid-cols-3">
          {/* GeoPonto */}
          <div className="flex flex-col items-center gap-2 md:items-start">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <MapPin className="h-5 w-5 text-primary" />
              GeoPonto
            </div>
            <p className="text-sm text-muted-foreground text-center md:text-left">
              Sistema de ponto eletrônico com foto de conferência e geolocalização.
            </p>
            <div className="flex gap-6 text-sm text-muted-foreground mt-2">
              <Link to="/termos" className="hover:text-foreground transition-colors">Termos</Link>
              <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
              <Link to="/lgpd" className="hover:text-foreground transition-colors">LGPD</Link>
            </div>
          </div>

          {/* Argos Soluções */}
          <div className="flex flex-col items-center gap-3">
            <img src={argosLogo} alt="Argos Soluções" className="h-14 w-auto" />
            <p className="text-sm font-semibold text-foreground">Argos Soluções®</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />
                CNPJ: 65.305.027/0001-38
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3 w-3" />
                Rua Feira de Santana, Potengi, Natal/RN — 59120-080
              </p>
            </div>
            <div className="mt-2 overflow-hidden rounded-lg border">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d215.4776428221883!2d-35.24591161719203!3d-5.756383396990624!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x7b3aa4518ce6d7f%3A0x44ed4058432f2460!2sR.%20Feira%20de%20Santana%20-%20Potengi%2C%20Natal%20-%20RN%2C%2059120-080!5e1!3m2!1spt-BR!2sbr!4v1774579637674!5m2!1spt-BR!2sbr"
                width="100%"
                height="150"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Localização Argos Soluções"
              />
            </div>
          </div>

          {/* Contato */}
          <div className="flex flex-col items-center gap-3 md:items-start">
            <p className="text-sm font-semibold text-foreground">Contato</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <a href="https://wa.me/5584998590183" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <svg className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                (84) 99859-0183 — Fale conosco
              </a>
              <a href="mailto:contato@portalargossolucoes.com" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Mail className="h-3 w-3" />
                contato@portalargossolucoes.com
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-4 text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} GeoPonto — Um produto da <span className="font-semibold text-foreground">Argos Soluções®</span>. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
