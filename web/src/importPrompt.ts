/** Instrução para colar no Claude ao final da precificação: gera o JSON que o ARGOS importa sem "adivinhar" nada. */
export const CLAUDE_JSON_PROMPT = `Ao final da proposta, gere UM arquivo JSON no formato "argos-proposta/1" com os dados fechados da proposta.
Regras: não invente nada (use null quando não souber); valores em reais como número (ex.: 1351.8); datas AAAA-MM-DD; separe o que a Argos cobra do que o cliente paga direto (custos_pagos_pelo_cliente).

{
  "schema": "argos-proposta/1",
  "tipo": "proposta",
  "cliente": { "nome": "", "documento": null, "tipo": "empresa_privada", "email": null, "telefone": null, "whatsapp": null, "endereco": null, "responsavel": null },
  "projeto": { "nome": "", "objeto": "", "escopo": ["módulo ou funcionalidade 1", "módulo ou funcionalidade 2"], "prazo": null, "horas": null, "hospedagem": null, "banco_de_dados": null, "dominio_email": null },
  "itens": [
    { "tipo": "implementacao", "descricao": "Implantação e desenvolvimento", "cobranca": "unico", "valor": 0, "vencimento": null },
    { "tipo": "mensalidade", "descricao": "Mensalidade (suporte e manutenção)", "cobranca": "recorrente", "valor": 0, "periodicidade_meses": 1, "vencimento": null }
  ],
  "condicoes": { "emissao": null, "validade_dias": 15, "dia_vencimento": null, "reajuste_indice": null, "multa_percentual": null, "juros_mensais_percentual": null, "forma_pagamento": null, "custos_pagos_pelo_cliente": [], "descontos": [] },
  "setor_publico": null
}

Valores permitidos — tipo do item: implementacao, desenvolvimento, licenca, mensalidade, hospedagem, dominio, treinamento, suporte, outro. cobranca: unico, recorrente, parcelado (informe "parcelas"), por_usuario (informe "quantidade"), sob_demanda. cliente.tipo: pessoa_fisica, empresa_privada, orgao_publico.`;
