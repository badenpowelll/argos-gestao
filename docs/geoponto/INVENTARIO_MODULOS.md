# Inventário de módulos do GeoPonto IA

Legenda: ✅ funciona (confirmado no código) · 🟡 parcial · ❌ ausente. "Confirmado" = lido no código, **não** executado em produção.

| Módulo | Estado | Onde | Observações |
|---|---|---|---|
| Landing page | ✅ | `components/landing/*`, `Index.tsx` | planos starter/pro/enterprise |
| Login, recuperar senha, Google | ✅ | `Login`, `ForgotPassword`, `ResetPassword` | |
| Solicitação de cadastro | ✅ | `RequestRegistration`, `RegistrationRequests` | |
| Registro de ponto (4 botões) | ✅ | `PunchClock.tsx` | pausa/retorno = out/in |
| Foto na marcação | 🟡 | `CameraPreview.tsx` | heurística de cor de pele, sem reconhecimento |
| Geolocalização + cerca virtual | ✅ | `useGeolocation`, `geo.ts`, `GeofenceMapPicker` | |
| Offline + sincronização | ✅ | `useOfflineQueue`, `ConnectionStatusBar`, service worker | relógio do cliente |
| Meu Ponto / histórico | ✅ | `MyPunches.tsx` | |
| Ajustes (solicitar/aprovar/rejeitar) | ✅ | `Adjustments.tsx`, `Admin.tsx` | aprovar insere marcação |
| Abonos/ausências | 🟡 | `AbsenceManagement.tsx` | só folga/feriados |
| Dashboard do gestor | ✅ | `Dashboard.tsx` | atraso fixo 08:15 |
| Humor/felicidade | ✅ | `MoodPicker.tsx` | |
| Espelho/relatório PDF | ✅ | `EmployeeReport.tsx` | editável antes do PDF (campos) |
| Admin: empresa, equipes, geofences, auditoria, funcionários | ✅ | `Admin.tsx` (1268 linhas) | arquivo grande, candidato a divisão |
| Criar/editar funcionário | ✅ | edge functions `admin-create-user/update-user` | |
| Análise facial (admin) | 🟡 | `FaceAnalysis.tsx` | 634 linhas; sem modelo de reconhecimento |
| Suporte | ✅ | `Suporte.tsx` + 2 edge functions | |
| Notificações | ✅ | `NotificationBell` | |
| Fechamento mensal | 🟡 | `MonthlyClosing.tsx`, `monthlyClosing.ts` (novo) | sem estados, bloqueio, versões |
| Portaria 671 (hash/AFD) | 🟡 | `Portaria671Panel.tsx`, `portaria671.ts` (novo) | simplificado, não oficial |
| Escalas com horários | ❌ | `work_schedules` só tem `daily_hours` | |
| Banco de horas (livro) | ❌ | `hour_bank` só saldo | |
| Cadastro trabalhista (CPF, matrícula…) | ❌ | | |
| Férias, atestados, licenças | ❌ | | |
| Folha, contabilidade, centros de custo | ❌ | | |
| Contratos, postos, glosas | ❌ | | |
| Central de integrações / API / webhooks | ❌ | | |
| IA assistente | ❌ | | |
| Testes automatizados / CI | ❌ | | |
