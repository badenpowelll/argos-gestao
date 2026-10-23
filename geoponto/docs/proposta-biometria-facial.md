# Proposta técnica — reconhecimento facial real no GeoPonto

## Situação atual
A validação de "rosto" hoje (`CameraPreview.tsx`, `FaceAnalysis.tsx`) é uma heurística de contagem de pixels em tom de pele numa região central do vídeo. Ela confirma presença de algo com cor de pele na moldura, não a identidade da pessoa. A coluna `profiles.face_template` existe no banco mas hoje armazena dados de endereço, não um template biométrico.

## Objetivo
Comparar, no momento do ponto, o rosto capturado com uma foto de referência do funcionário cadastrada no onboarding, e só validar o ponto se a similaridade passar de um limiar configurável por empresa.

## Opções de implementação

**Opção A — biblioteca client-side (face-api.js ou MediaPipe Face Landmarker)**
Gera um vetor de embedding facial diretamente no navegador, tanto no cadastro quanto no momento do ponto. Vantagem: não depende de serviço de terceiros pago, funciona offline depois de carregado. Desvantagem: processamento mais pesado no celular do funcionário, é preciso validar desempenho em aparelhos de entrada.

**Opção B — serviço de terceiros (AWS Rekognition, Azure Face, ou similar)**
Uma edge function do Supabase recebe a foto, chama a API do serviço, recebe de volta um score de similaridade contra a foto de referência armazenada. Vantagem: maior precisão e suporte a anti-spoofing/liveness de verdade. Desvantagem: custo por verificação, dependência de um provedor externo, e a foto passa a trafegar para fora da infraestrutura da empresa — precisa entrar no RIPD e no contrato com o cliente.

## Mudanças de esquema necessárias
Renomear/reestruturar `profiles.face_template` para separar claramente o que é endereço do que é dado biométrico — por exemplo, mover o endereço para colunas próprias e usar `face_template` (ou uma nova coluna `face_embedding`) só para o vetor de referência, armazenado de forma que não seja reversível para a imagem original.

## Cadastro (onboarding)
No fluxo de `EmployeeRegister.tsx`, ao anexar a foto do funcionário, gerar o embedding de referência (via Opção A ou B) e salvar apenas o vetor, não a imagem original, quando possível — ou armazenar a imagem de forma privada e de acesso restrito caso seja necessário mantê-la para auditoria.

## Validação no ponto
No fluxo de `CameraPreview.tsx`/`PunchClock.tsx`, ao capturar a foto, gerar o embedding da nova captura e comparar com o embedding de referência do funcionário logado. Só marcar o ponto como validado se a distância/similaridade passar do limiar (ex.: configurável por empresa em `companies` ou `work_schedules`). Registrar o score real de similaridade em `time_entries.face_score` (substituindo o valor hoje fictício).

## Impacto em `FaceAnalysis.tsx`
Uma vez implementada a comparação real, o `face_score` salvo no banco passa a ser confiável, e a tela de análise administrativa pode voltar a exibir esse percentual como uma métrica válida — hoje ela precisa parar de fazer isso (ver Bloco 3 deste documento de melhorias).

## Esforço estimado e decisão pendente
Este documento é só o levantamento técnico. Antes de implementar, decidir: (1) Opção A ou B, (2) se o custo por verificação da Opção B é aceitável dado o número de funcionários dos planos Starter/Pro/Enterprise, e (3) se a mudança exige atualizar o RIPD e o termo de consentimento de biometria já mencionados em `/lgpd`.
