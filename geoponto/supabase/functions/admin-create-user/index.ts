import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use the apikey from the request header (sent by supabase-js client)
    const anonKey = req.headers.get("apikey") || supabaseServiceKey;

    // Verify caller is admin/owner using the caller's JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || !["admin", "owner"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, name, company_id, team_id, phone, avatar_url, address } = await req.json();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email e senha são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      console.log(`User ${email} already exists (${userId}), updating...`);
      
      await adminClient.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { name },
      });
    } else {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = newUser.user.id;
    }

    // Wait for trigger to create profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Tentar atualizar o perfil (se o trigger já tiver criado) ou forçar criação
    const { data: profileCheck } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const profileData = {
      company_id: company_id || null,
      name: name || "",
      phone: phone || null,
      team_id: team_id || null,
      avatar_url: avatar_url || null,
      face_template: {
        photos_count: 0,
        trained: false,
        address: address || null,
      },
    };

    let profileError;
    if (profileCheck) {
      const { error } = await adminClient
        .from("profiles")
        .update(profileData)
        .eq("user_id", userId);
      profileError = error;
    } else {
      const { error } = await adminClient
        .from("profiles")
        .insert({ user_id: userId, ...profileData });
      profileError = error;
    }

    if (profileError) {
      console.error("Erro na gestão do perfil:", profileError);
    }

    // 3. Garantir que a Role de funcionário esteja definida
    const { data: roleCheck } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
      
    if (!roleCheck) {
      await adminClient.from("user_roles").insert({ user_id: userId, role: "employee" });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
