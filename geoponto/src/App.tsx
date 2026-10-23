import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TermsOfUse from "./pages/TermsOfUse";
import Privacy from "./pages/Privacy";
import LGPD from "./pages/LGPD";
import RequestRegistration from "./pages/RequestRegistration";
import NotFound from "./pages/NotFound";
import AppLayout from "./layouts/AppLayout";
import PunchPage from "./pages/Punch";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import ManagerPanel from "./pages/ManagerPanel";
import EmployeeRegister from "./pages/EmployeeRegister";
import Adjustments from "./pages/Adjustments";
import MyPunches from "./pages/MyPunches";
import Suporte from "./pages/Suporte";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/termos" element={<TermsOfUse />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/lgpd" element={<LGPD />} />
            <Route path="/solicitar-cadastro" element={<RequestRegistration />} />
            {/* Redirecionamento defensivo: atalhos/favoritos antigos que apontam para /punch */}
            <Route path="/punch" element={<Navigate to="/app" replace />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<PunchPage />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="admin" element={<Admin />} />
              <Route path="gestor" element={<ManagerPanel />} />
              {/* Employee registration is now inside Admin */}
              <Route path="adjustments" element={<Adjustments />} />
              <Route path="my-punches" element={<MyPunches />} />
              <Route path="suporte" element={<Suporte />} />
            </Route>
            <Route
              path="/suporte"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Suporte />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
