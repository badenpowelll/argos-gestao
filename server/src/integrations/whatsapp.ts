/**
 * Camada de integração com WhatsApp.
 *
 * v1: envio MANUAL — o sistema gera a mensagem e um link wa.me; o operador envia e registra o contato.
 * Futuro: provedor "cloud_api" (WhatsApp Business Cloud API da Meta). Ele só passa a existir como
 * disponível quando WHATSAPP_CLOUD_TOKEN e WHATSAPP_PHONE_NUMBER_ID estiverem configurados E o envio
 * for implementado e testado com a conta aprovada. Enquanto isso, `send()` recusa explicitamente.
 */
export interface MessageProvider {
  name: 'manual' | 'cloud_api';
  /** true somente quando o envio automático está realmente operacional. */
  automatic: boolean;
  send(to: string, body: string): Promise<{id: string}>;
}

const manual: MessageProvider = {
  name: 'manual',
  automatic: false,
  async send() {
    throw new Error('Envio automático indisponível: use o link do WhatsApp e registre o envio manualmente.');
  }
};

export function whatsappProvider(env: NodeJS.ProcessEnv = process.env): {name: string; automatic: boolean; cloud_api_configured: boolean} {
  const configured = !!(env.WHATSAPP_CLOUD_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  // Credenciais presentes NÃO significam integração concluída: o envio via Cloud API ainda não foi implementado.
  return {name: manual.name, automatic: false, cloud_api_configured: configured};
}

export {manual as manualProvider};
