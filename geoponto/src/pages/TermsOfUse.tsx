import { Link } from "react-router-dom";
import { MapPin, ArrowLeft } from "lucide-react";

const TermsOfUse = () => (
  <div className="min-h-screen bg-background">
    <header className="border-b bg-card py-4">
      <div className="container mx-auto flex items-center gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-foreground">
          <MapPin className="h-5 w-5 text-primary" /> GeoPonto
        </Link>
      </div>
    </header>
    <main className="container mx-auto max-w-3xl px-4 py-12">
      <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="mb-6 text-3xl font-bold text-foreground">Termos de Uso</h1>
      <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
        <p><strong>Última atualização:</strong> 27 de março de 2026</p>

        <h2 className="text-lg font-semibold text-foreground">1. Aceitação dos Termos</h2>
        <p>Ao acessar e utilizar o GeoPonto, você concorda com estes Termos de Uso. Caso não concorde, não utilize o serviço.</p>

        <h2 className="text-lg font-semibold text-foreground">2. Descrição do Serviço</h2>
        <p>O GeoPonto é um sistema SaaS de controle de ponto eletrônico com foto com verificação de enquadramento, geolocalização e funcionamento offline, destinado a empresas de todos os portes.</p>

        <h2 className="text-lg font-semibold text-foreground">3. Cadastro e Conta</h2>
        <p>O usuário é responsável por manter a confidencialidade de suas credenciais de acesso. Todas as atividades realizadas em sua conta são de sua responsabilidade.</p>

        <h2 className="text-lg font-semibold text-foreground">4. Planos e Pagamento</h2>
        <p>O GeoPonto oferece planos Starter (R$ 34,99/mês), Pro (R$ 64,99/mês) e Enterprise (R$ 94,99/mês). O pagamento é cobrado mensalmente após a contratação.</p>

        <h2 className="text-lg font-semibold text-foreground">5. Uso Aceitável</h2>
        <p>É proibido utilizar o serviço para fins ilegais, tentar burlar os mecanismos de verificação de ponto (foto, geolocalização), ou compartilhar credenciais de acesso com terceiros não autorizados.</p>

        <h2 className="text-lg font-semibold text-foreground">6. Propriedade Intelectual</h2>
        <p>Todo o conteúdo, design, código e funcionalidades do GeoPonto são propriedade exclusiva da empresa e protegidos por leis de propriedade intelectual.</p>

        <h2 className="text-lg font-semibold text-foreground">7. Limitação de Responsabilidade</h2>
        <p>O GeoPonto não se responsabiliza por danos indiretos, incidentais ou consequenciais decorrentes do uso ou da impossibilidade de uso do serviço.</p>

        <h2 className="text-lg font-semibold text-foreground">8. Rescisão</h2>
        <p>Ambas as partes podem rescindir o contrato a qualquer momento. O cancelamento pode ser feito diretamente pelo painel administrativo.</p>

        <h2 className="text-lg font-semibold text-foreground">9. Alterações</h2>
        <p>Reservamo-nos o direito de alterar estes termos a qualquer momento, notificando os usuários com antecedência mínima de 30 dias.</p>

        <h2 className="text-lg font-semibold text-foreground">10. Foro</h2>
        <p>Fica eleito o foro da comarca de Natal/RN para dirimir quaisquer controvérsias decorrentes destes Termos.</p>
      </div>
    </main>
  </div>
);

export default TermsOfUse;
