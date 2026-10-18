# ARGOS GESTÃO 360° — arquitetura e estado do projeto

> Documento para quem for revisar/consultar o projeto (engenharia, finanças, contabilidade). Atualizado em 18/10/2026.
> Regra do projeto: **nada é declarado pronto sem estar implementado e validado**. Esta página separa o que está validado do que está pendente.

## 1. Visão geral

Sistema web único (SPA + API) que concentra a carteira da Argos Soluções: clientes, sistemas, contratos, cobranças, PDV financeiro e o módulo **Argos Pricing** (precificação + propostas em PDF).

| Camada | Tecnologia |
|---|---|
| Front | React 18 + TypeScript + Vite; **Argos Design System 2.0** vendorizado em `web/src/ds` (tokens `--ads-*`, tema claro/escuro) |
| API | Node 24 + Express + TypeScript (ESM), validação com Zod |
| Banco | PostgreSQL 18 (Railway). Valores monetários **sempre em centavos** (`bigint`) |
| Auth | Senha com bcrypt (custo 12), sessão JWT em cookie `httpOnly` + `SameSite=Strict`, bloqueio após 5 falhas, perfis admin/financeiro/operador/leitura |
| PDF/QR | pdfkit + qrcode (propostas e relatórios) |
| Hospedagem | Railway (serviço `web` + `Postgres`), um único serviço serve API e front |

```
web/         front (src/pages, src/pricing, src/ds)
server/
  migrations/  001_init.sql (ERP) · 002_pricing.sql (Pricing)
  src/routes/  auth, users, clients, systems, contracts, imports, charges, documents, dashboard, reports, misc, pricing, proposals
  src/services/billing.ts payments.ts   ← regras financeiras críticas
  src/extract/  extração de contratos (regras, sem inventar valores)
  src/pricing/  engine.ts payment.ts catalog.ts pix.ts compute.ts pdf.ts content.ts data.ts
brand/       logomarca, favicon e brandbooks oficiais
```

## 2. Garantias de integridade (testadas)

- **Sem baixa duplicada:** `idempotency_key` único por recebimento + `SELECT … FOR UPDATE` na cobrança. Duas baixas simultâneas do saldo total → só uma vence.
- **Sem cobrança duplicada:** `dedupe_key` único (`item|competência`); gerar de novo não cria nada.
- **Pagamentos imutáveis:** trigger no banco proíbe `DELETE`/alteração; só estorno (com motivo, operador e data). **Auditoria imutável** (`audit_log` com trigger).
- **Proposta ≠ contrato:** propostas nunca geram cobrança; contrato só gera após **ativação confirmada** (data de assinatura obrigatória).
- **Importação com revisão humana:** o PDF/DOCX é lido, cada campo mostra origem, página e confiança; **nada é gravado antes da confirmação**. Campo ausente fica ausente (nunca presumido). Original preservado (hash SHA-256, armazenamento privado em `bytea`).
- **Versão de proposta emitida é congelada** (trigger): custos, câmbio e tributação posteriores não alteram propostas já emitidas.
- Testes: `npm test` (103 testes; usam um *schema* descartável no Postgres, nunca os dados reais).

## 3. Módulo Argos Pricing — regras de cálculo

- **Margem** é sobre o **preço** e líquida de tributos: `preço = custo ÷ (1 − margem − tributo)`. **Markup** é sobre o custo: `preço = custo × (1 + markup)`. (Margem 20% ≙ markup 25%.)
- Licença é componente de **preço** (sem custo): fixa, % do custo de desenvolvimento, % do subtotal ou mensal.
- Tributos: **nunca presumidos**. Só valem configurações marcadas como *validadas pela contabilidade* (quem, referência). Alterar alíquota revoga a validação. Sem validação → tributos R$ 0,00 e emissão bloqueada até confirmação expressa.
- Alertas **bloqueantes** (impedem emitir sem confirmação): preço abaixo do custo, lucro negativo, tributação não validada, margem impossível, horas abaixo do mínimo (24 h) sem justificativa.
- Catálogo de custos: moeda, periodicidade, rateio (÷ projetos ou % manual), conversão cambial com fonte/data, **sem dupla contagem** (item "incluído em" outro plano) e **sem preço inventado** (item sem preço fica de fora com aviso).
- Cartão: taxa repassada = `base ÷ (1 − taxa)`; parcela arredondada ao centavo.
- Pix: payload BR Code gerado e **validado** (TLV, CRC16, campos obrigatórios) antes de entrar no PDF.
- **Referência de validação:** o motor reproduz exatamente a proposta PDV ATEC (custos R$ 1.081,44 → projeto R$ 1.351,80 → entrada R$ 1.499,80 → cartão R$ 3.497,48 → 10 × R$ 349,75) e a AH Crédito (preço R$ 400,00 com alerta de prejuízo). Ver `server/src/pricing/*.test.ts`.
- Visão do cliente: margem, tributos, rateios e tabelas de custo só aparecem com **autorização expressa** na proposta.

## 4. Fluxos principais

1. **Importar contrato → revisar → confirmar → cliente/sistema/contrato (rascunho) → ativar → cobranças → PDV (receber/baixar) → painel.**
2. **Proposta:** criar → calcular (simulação ao vivo) → salvar rascunho → emitir (congela + PDF oficial) → [nova versão se mudar] → aprovar → **contrato em rascunho + sistema + cliente vinculado** → ativar → cobranças no PDV.

## 5. Estado atual

| Área | Estado |
|---|---|
| Clientes, sistemas, contratos, itens, aditivos | ✅ implementado e testado |
| Importação PDF/DOCX/TXT com revisão | ✅ (PDF digitalizado/imagem **não** tem OCR: preenchimento manual) |
| Cobranças, recorrência, PDV, estorno, juros/multa/desconto | ✅ testado |
| Dashboard, relatórios CSV e PDF | ✅ |
| Argos Pricing: motor, catálogo, câmbio, tributos, propostas versionadas, PDF, Pix, aprovação→contrato | ✅ testado (API) e telas criadas |
| WhatsApp | ⚠️ **manual**: cobrança e **envio da proposta** (link seguro e revogável do PDF + mensagem pronta + wa.me + compartilhar arquivo no celular + registro do envio). API Business **não** integrada (falta conta/credenciais Meta) |
| Análise de link do sistema (escopo/infra) | ✅ sugere telas, módulos e hospedagem a partir do link (com proteção SSRF); banco de dados, horas e prazo ficam **manuais**; telas atrás de login não são visíveis |
| IA (Assistente Argos, sugestão de escopo) | ❌ não implementado |
| Projetos/Kanban, Suporte, automações avançadas, conciliação bancária | ❌ não implementado (roadmap) |
| Boleto/Pix automático (provedor de pagamento) | ❌ não implementado |
| Cobrança de consumo/por usuário no ERP | parcial: por usuário ✔ (item recorrente); consumo só como texto da proposta |

## 6. Pendências que dependem de dados/decisões da Argos

- **Tributação:** cadastrar regime/alíquotas e registrar a validação da contabilidade (o sistema não presume).
- **Catálogo:** preços ainda em branco (não verificados): ChatGPT, Railway/PostgreSQL, Hetzner (backups, IPv4, Storage Box BX11), Cloudflare (Pages, Workers, Turnstile). Verificados: Hetzner CX33 € 8,49/mês (informado), Lovable/Claude/domínio/e-mail (proposta PDV ATEC).
- **Google:** informar o link oficial de avaliação (`Precificação → Parâmetros`). Sem link, o QR não aparece.
- **Telefone:** a proposta-modelo usa (84) 99620-6159; o contato WhatsApp informado é (84) 99859-0183. Definir qual aparece onde.
- **E-mail/domínio (Hostinger):** apontar o domínio para o serviço no Railway (CNAME) e criar o e-mail institucional.
- **Fonte oficial Argos Sans** e logotipo vetorial/branco (para fundo escuro) ainda não fornecidos: o logo fica sobre placa branca.
- Dependência com aviso `npm audit` moderado em `mammoth` (ReDoS transitivo em `sprintf-js`); baixo risco (arquivos enviados por usuários autenticados).

## 7. Segurança

Cookies `httpOnly`/`SameSite=Strict`, cabeçalho anti-CSRF nas escritas, CSP via Helmet, limite de tentativas, upload com checagem de assinatura de arquivo (não confia na extensão), documentos só por rota autenticada, **nenhum campo de senha de cliente** (sistemas guardam apenas tipo/provedor do banco). Primeiro acesso protegido por `SETUP_CODE`. Segredos só em variáveis de ambiente (`.env` nunca versionado).

## 8. Rodar, testar, publicar

```bash
npm install
cp .env.example .env      # preencher DATABASE_URL e SESSION_SECRET
npm run migrate           # aplica as migrações
npm run dev               # API :3000 + front :5173
npm test                  # 103 testes (precisa de DATABASE_URL)
npm run build && npm start
```
Produção: Railway (`railway up`), variáveis `DATABASE_URL` (referência ao Postgres), `SESSION_SECRET`, `NODE_ENV=production`, `DB_SSL=false`, `SETUP_CODE`.

