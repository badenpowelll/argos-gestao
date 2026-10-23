import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import FeaturesSection from "@/components/landing/FeaturesSection";

import CTASection from "@/components/landing/CTASection";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <div id="beneficios">
        <BenefitsSection />
      </div>
      <div id="funcionalidades">
        <FeaturesSection />
      </div>
      <CTASection />
      <Footer />
    </div>
  );
};

export default Index;
