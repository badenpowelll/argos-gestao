# Importar proposta — como funciona

O ARGOS não refaz a precificação: ela é feita no Claude. O sistema **recebe o documento, reconhece os dados e cadastra** após a sua conferência.

## Fluxo (3 etapas)
1. **Carregar documento** — PDF, Word (.docx), TXT ou **JSON do Claude** (mais preciso).
2. **Conferir dados** — cliente, CPF/CNPJ, serviço, escopo, valores (implantação, mensalidade, hora técnica), custos pagos pelo cliente, prazos e condições. O que não for encontrado fica em branco; o que for incerto aparece com aviso e o trecho de origem.
3. **Confirmar cadastro** — cria (ou reutiliza) o cliente e registra a **proposta**. Nada é cobrado ainda.

Depois, ao aprovar: **Propostas e contratos → abrir o documento → “Aprovar e gerar cobranças”** (informa a data de aprovação e os vencimentos; vira contrato e cria as cobranças no Financeiro).

## Regras
- Cliente existente é reconhecido por **CPF/CNPJ** (ou pelo nome, com sua escolha). Em cliente existente o sistema **só completa campos em branco**, nunca sobrescreve.
- O arquivo original é guardado (hash SHA-256) e a origem de cada dado fica registrada.
- Valores separados: **implantação**, **mensalidade**, **hora técnica sob demanda** e **custos pagos diretamente pelo cliente** (registrados, sem cobrança).
- Contrato e cobranças só nascem **após a aprovação** e a confirmação explícita.
- Edição manual continua disponível (Propostas e contratos → Criar manualmente).

## JSON do Claude (`argos-proposta/1`)
Ao terminar a precificação no Claude, cole a instrução que está na tela **Importar proposta → “Como gerar o JSON no Claude”** e carregue o arquivo gerado. Exemplo completo: `demo-contratos/exemplo-proposta-claude.json`.

Campos: `cliente` (nome, documento, tipo, email, telefone, whatsapp, endereco, responsavel) · `projeto` (nome, objeto, escopo[], prazo, horas, hospedagem, banco_de_dados, dominio_email) · `itens[]` (tipo, descricao, cobranca, valor em reais, quantidade, parcelas, periodicidade_meses, vencimento, desconto) · `condicoes` (emissao, validade_dias, assinatura, inicio, fim, vigencia_meses, dia_vencimento, reajuste_indice, multa_percentual, juros_mensais_percentual, forma_pagamento, custos_pagos_pelo_cliente[], descontos[]) · `setor_publico` (processo, empenho).

## Contratos fictícios para teste
A pasta `demo-contratos/` traz **15 contratos fictícios em PDF** (clientes pessoa física, empresa privada e órgãos públicos; valores únicos, mensais, parcelados, por usuário e sob demanda; com vencimento, vigência, reajuste, multa/juros, processo e empenho). Todos os dados são inventados. Para regenerar: `npm run demo:contratos -w server`.
O teste automático `server/src/extract/demo.test.ts` confere que o reconhecimento acerta todos os pontos de cada um.

## Limites
PDF digitalizado (imagem) não tem texto: preencha manualmente (o original fica guardado). Não há OCR.
