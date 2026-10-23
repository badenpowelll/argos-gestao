
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'manager', 'employee');

-- Subscription plan enum
CREATE TYPE public.plan_type AS ENUM ('starter', 'pro', 'enterprise');

-- Punch type enum
CREATE TYPE public.punch_type AS ENUM ('in', 'out');

-- Punch audit status enum
CREATE TYPE public.punch_status AS ENUM ('verified', 'outside_perimeter', 'flagged', 'pending');

-- Sync status enum
CREATE TYPE public.sync_status AS ENUM ('synced', 'pending', 'failed');

-- Adjustment status enum
CREATE TYPE public.adjustment_status AS ENUM ('pending', 'approved', 'rejected');

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  plan public.plan_type NOT NULL DEFAULT 'starter',
  max_users INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar_url TEXT,
  face_template JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES (separate table per security guidelines) ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ TIME ENTRIES ============
CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  type public.punch_type NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  accuracy NUMERIC,
  face_score NUMERIC,
  status public.punch_status NOT NULL DEFAULT 'pending',
  sync_status public.sync_status NOT NULL DEFAULT 'pending',
  device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- ============ GEOFENCES ============
CREATE TABLE public.geofences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Sede',
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_geofences_updated_at BEFORE UPDATE ON public.geofences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HOUR BANK ============
CREATE TABLE public.hour_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  balance_minutes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hour_bank ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_hour_bank_updated_at BEFORE UPDATE ON public.hour_bank
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ADJUSTMENTS ============
CREATE TABLE public.adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  reason TEXT NOT NULL,
  status public.adjustment_status NOT NULL DEFAULT 'pending',
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_adjustments_updated_at BEFORE UPDATE ON public.adjustments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUDIT LOGS ============
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  snapshot_before JSONB,
  snapshot_after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan public.plan_type NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WORK SCHEDULES ============
CREATE TABLE public.work_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT '5x2',
  daily_hours NUMERIC NOT NULL DEFAULT 8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_work_schedules_updated_at BEFORE UPDATE ON public.work_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RLS POLICIES ============

-- Companies: users can see their own company
CREATE POLICY "Users can view own company" ON public.companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can update company" ON public.companies
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view company profiles" ON public.profiles
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

-- Time entries
CREATE POLICY "Users can view own entries" ON public.time_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Managers can view company entries" ON public.time_entries
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  );

CREATE POLICY "Users can insert own entries" ON public.time_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Geofences
CREATE POLICY "Company members can view geofences" ON public.geofences
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage geofences" ON public.geofences
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

-- Hour bank
CREATE POLICY "Users can view own hour bank" ON public.hour_bank
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Managers can view company hour bank" ON public.hour_bank
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'))
  );

-- Adjustments
CREATE POLICY "Users can view own adjustments" ON public.adjustments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own adjustments" ON public.adjustments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Managers can view company adjustments" ON public.adjustments
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Managers can update adjustments" ON public.adjustments
  FOR UPDATE USING (
    public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin')
  );

-- Audit logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- Subscriptions
CREATE POLICY "Admins can view subscriptions" ON public.subscriptions
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'))
  );

-- Work schedules
CREATE POLICY "Company members can view schedules" ON public.work_schedules
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage schedules" ON public.work_schedules
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')
  );

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
