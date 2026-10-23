import { Link } from "react-router-dom";
import { MapPin, ArrowLeft } from "lucide-react";

// Esta página descreve as práticas reais implementadas no GeoPonto, alinhadas
// com o texto de /lgpd. Não usar linguagem que sugira validação biométrica
// automática, hash irreversível ou exclusão instantânea — nada disso existe hoje.
const Privacy = () => (
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
      <h1 className="mb-6 text-3xl font-bold text-foreground">Política de Privacidade</h1>
      <div className="prose prose-sm max-w-none text-muted-foreground space-y-4">
        <p><strong>Última atualização:</strong> 28 de julho de 2026</p>

        <p>
          Esta política descreve, de forma honesta e verificável, como o GeoPonto trata
          dados pessoais. Para o detalhamento específico do tratamento de dados no
          momento do registro de ponto, consulte também{" "}
          <Link to="/lgpd" className="text-primary hover:underline">Tratamento de Dados — LGPD</Link>.
        </p>

        <h2 className="text-lg font-semibold text-foreground">1. Dados coletados</h2>
        <p>No uso do GeoPonto podemos coletar:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Nome, e-mail e telefone informados no cadastro;</li>
          <li>Data, hora e tipo do registro de ponto;</li>
          <li>Coordenadas GPS (latitude, longitude, precisão) quando o funcionário permite;</li>
          <li>Foto capturada pela câmera do dispositivo no momento do ponto;</li>
          <li>Endereço IP e identificação do dispositivo (user-agent) para auditoria;</li>
          <li>Nota opcional de humor informada pelo próprio funcionário.</li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">2. Finalidade do tratamento</h2>
        <p>
          Os dados são utilizados para controle de jornada, geração de relatórios
          trabalhistas, auditoria de registros pelo gestor da empresa contratante e
          cumprimento de obrigações legais.
        </p>
        <p>
          <strong>Importante:</strong> o GeoPonto <em>não</em> executa validação
          biométrica automática de identidade. A verificação feita no aparelho
          durante a captura é apenas de enquadramento facial (confirma que há um
          rosto na moldura). A conferência da foto, quando necessária, é feita
          manualmente pelo gestor.
        </p>

        <h2 className="text-lg font-semibold text-foreground">3. Base legal (LGPD)</h2>
        <p>
          Cumprimento de obrigação legal e regulatória de controle de jornada
          (Art. 7º, II), execução de contrato de trabalho (Art. 7º, V) e
          consentimento específico do titular quando aplicável (Art. 7º, I e Art. 11, I).
        </p>

        <h2 className="text-lg font-semibold text-foreground">4. Compartilhamento</h2>
        <p>
          Os dados não são compartilhados com terceiros, exceto quando necessário
          para cumprimento de obrigação legal ou por determinação judicial. Dados
          de cada empresa contratante são isolados por controle de acesso baseado
          em função (RBAC) e políticas de segurança em nível de linha.
        </p>

        <h2 className="text-lg font-semibold text-foreground">5. Armazenamento e segurança</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Registros de ponto ficam no banco de dados relacional, com acesso restrito.</li>
          <li>
            As fotos capturadas ficam em bucket privado, acessíveis apenas ao
            próprio funcionário e a gestores da mesma empresa mediante URL assinada
            de curta duração. As fotos <strong>são armazenadas em sua forma original</strong>,
            não como hash — isso é necessário para permitir a conferência manual.
          </li>
          <li>Comunicação entre app e servidor via TLS.</li>
          <li>
            Se o funcionário estiver sem internet, a foto e o registro ficam
            temporariamente no armazenamento local do navegador e são descartados
            do dispositivo em até 3 dias após a sincronização ou tentativa.
          </li>
        </ul>

        <h2 className="text-lg font-semibold text-foreground">6. Retenção e exclusão</h2>
        <p>
          Registros de ponto seguem os prazos legais da CLT. O titular pode
          solicitar a exclusão de sua foto ou revogar o consentimento a qualquer
          momento pelo canal de contato abaixo; nesse caso a foto é removida do
          armazenamento em até 48 horas.
        </p>

        <h2 className="text-lg font-semibold text-foreground">7. Direitos do titular</h2>
        <p>
          Conforme o Art. 18 da LGPD, o titular tem direito a: acesso, correção,
          exclusão, portabilidade, informação sobre compartilhamento, revogação do
          consentimento e oposição ao tratamento.
        </p>

        <h2 className="text-lg font-semibold text-foreground">8. Contato do Encarregado (DPO)</h2>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de
          dados, entre em contato pelo e-mail:{" "}
          <a href="mailto:contato@portalargossolucoes.com" className="text-primary hover:underline">
            contato@portalargossolucoes.com
          </a>
        </p>

        <p className="text-xs italic pt-4 border-t border-border">
          Este documento descreve as práticas atualmente implementadas.
          Funcionalidades futuras que envolvam comparação biométrica automática,
          detecção de vivacidade ou anti-fraude por imagem serão descritas aqui
          somente após entrarem em operação.
        </p>
      </div>
    </main>
  </div>
);

export default Privacy;
