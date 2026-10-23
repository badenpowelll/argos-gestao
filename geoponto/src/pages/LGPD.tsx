import { Link } from "react-router-dom";
import { MapPin, ArrowLeft } from "lucide-react";

const LGPD = () => (
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
      <h1 className="mb-6 text-3xl font-bold text-foreground">
        Tratamento de Dados Pessoais — LGPD
      </h1>
      <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
        <p>
          <strong>Última atualização:</strong> 27 de julho de 2026
        </p>

        <p>
          Esta página descreve, de forma honesta e verificável, como o GeoPonto trata
          os dados pessoais dos funcionários no momento do registro de ponto. O
          conteúdo reflete a implementação real do sistema na data indicada acima e
          será atualizado sempre que essa implementação mudar.
        </p>

        <h2 className="text-lg font-semibold text-foreground">1. Dados coletados no ponto</h2>
        <p>Ao bater o ponto pelo aplicativo, o GeoPonto pode coletar:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Data e hora do registro;</li>
          <li>Coordenadas GPS (latitude, longitude, precisão) quando o funcionário permite;</li>
          <li>Uma foto capturada pela câmera frontal do próprio dispositivo, quando disponível;</li>
          <li>Endereço IP e identificação do dispositivo (user-agent) para fins de auditoria;</li>
          <li>Uma nota opcional de humor informada pelo próprio funcionário.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">2. Sobre a foto do ponto</h2>
        <p>
          Importante: o GeoPonto <strong>armazena a foto capturada no momento do ponto</strong>.
          A foto fica associada ao registro correspondente e é usada para auditoria posterior
          pelo gestor da empresa. Na versão atual do sistema:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            A verificação feita no aparelho durante a captura é de <strong>enquadramento facial</strong>
            (confirma que existe um rosto na moldura), <em>não</em> é uma comparação biométrica
            de identidade — o app não confere se o rosto é o do funcionário logado.
          </li>
          <li>
            Não há, hoje, detecção automática de vivacidade (liveness) nem verificação
            anti-fraude por foto. A conferência de identidade, quando necessária, é feita
            manualmente pelo gestor a partir da foto salva.
          </li>
          <li>
            Se o funcionário estiver sem internet, a foto é guardada temporariamente no próprio
            dispositivo (armazenamento local do navegador) até ser enviada ao servidor, e é
            descartada automaticamente do dispositivo em até 7 dias.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">3. Base legal</h2>
        <p>
          O tratamento dos dados acima ocorre no contexto da relação de trabalho para
          cumprimento de obrigações legais e regulatórias de controle de jornada (Art. 7º,
          II e V da LGPD) e mediante consentimento específico do titular quando aplicável
          (Art. 7º, I e Art. 11, I).
        </p>

        <h2 className="text-lg font-semibold text-foreground">4. Onde os dados ficam</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Registros de ponto ficam no banco de dados da empresa contratante, com controle de acesso por função (RBAC).</li>
          <li>As fotos são armazenadas em bucket privado, com acesso restrito ao próprio funcionário e a gestores/administradores da mesma empresa.</li>
          <li>Comunicação entre app e servidor usa TLS.</li>
          <li>Toda ação relevante fica registrada em log de auditoria.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">5. Retenção e exclusão</h2>
        <p>
          Registros de ponto seguem os prazos exigidos pela legislação trabalhista.
          O titular pode solicitar a exclusão da sua foto ou revogar o consentimento
          a qualquer momento pelo canal de contato indicado abaixo. Quando isso ocorre,
          a foto deixa de ser exibida e é removida do armazenamento em até 48 horas.
        </p>

        <h2 className="text-lg font-semibold text-foreground">6. Geolocalização</h2>
        <p>
          Os dados de geolocalização são coletados apenas no momento do registro de ponto,
          com consentimento do funcionário. Não há rastreamento contínuo da localização
          fora do momento da batida.
        </p>

        <h2 className="text-lg font-semibold text-foreground">7. Direitos do titular</h2>
        <p>
          Você pode a qualquer momento solicitar acesso, correção, portabilidade,
          anonimização, revogação de consentimento e exclusão dos seus dados,
          conforme Art. 18 da LGPD.
        </p>

        <h2 className="text-lg font-semibold text-foreground">8. Incidentes de segurança</h2>
        <p>
          Em caso de incidente de segurança envolvendo dados pessoais, a ANPD e os
          titulares afetados serão comunicados nos prazos previstos no Art. 48 da LGPD.
        </p>

        <h2 className="text-lg font-semibold text-foreground">9. Contato do Encarregado (DPO)</h2>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas, entre em contato:{" "}
          <a
            href="mailto:contato@portalargossolucoes.com"
            className="text-primary hover:underline"
          >
            contato@portalargossolucoes.com
          </a>
        </p>

        <p className="text-xs italic pt-4 border-t border-border">
          Este documento descreve as práticas atualmente implementadas. Quaisquer
          funcionalidades futuras que envolvam comparação biométrica automática de
          identidade, detecção de vivacidade ou anti-fraude por imagem serão descritas
          aqui somente após entrarem em operação.
        </p>
      </div>
    </main>
  </div>
);

export default LGPD;
