import { Button } from "@/components/ui/button";
import { MapPin, LogIn } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const Navbar = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-primary-foreground/10 bg-primary/95 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-2 font-bold text-primary-foreground">
          <MapPin className="h-5 w-5" />
          <span>GeoPonto</span>
        </div>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#beneficios" className="text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors">
            Benefícios
          </a>
          <a href="#funcionalidades" className="text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors">
            Funcionalidades
          </a>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold"
            asChild
          >
            <Link to="/login">Login</Link>
          </Button>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="flex flex-col gap-1.5 md:hidden"
          aria-label="Menu"
        >
          <span className={`block h-0.5 w-6 bg-primary-foreground transition-transform ${open ? "translate-y-2 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-6 bg-primary-foreground transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-6 bg-primary-foreground transition-transform ${open ? "-translate-y-2 -rotate-45" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="border-t border-primary-foreground/10 bg-primary px-4 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            <a href="#beneficios" className="text-sm text-primary-foreground/80" onClick={() => setOpen(false)}>Benefícios</a>
            <a href="#funcionalidades" className="text-sm text-primary-foreground/80" onClick={() => setOpen(false)}>Funcionalidades</a>
            
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg font-semibold w-full" asChild>
              <Link to="/login">Login</Link>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
