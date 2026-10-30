import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Method not allowed." });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond(401, { error: "Authentication is required." });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !anonKey || !serviceRoleKey) {
    console.error("Required Supabase Edge Function environment variables are missing.");
    return respond(500, { error: "Student account service is not configured." });
  }

  const token = authorization.slice("Bearer ".length);
  const callerClient = createClient(projectUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData.user) {
    return respond(401, { error: "The current session is invalid." });
  }

  const serviceClient = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("user_id", callerData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to verify administrator role.", profileError);
    return respond(500, { error: "Administrator access could not be verified." });
  }
  if (callerProfile?.role !== "admin") {
    return respond(403, { error: "Administrator access is required." });
  }

  let input: { action?: unknown; studentId?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch (error) {
    console.error("Invalid student account request body.", error);
    return respond(400, { error: "The request body must be valid JSON." });
  }

  const action = input.action;
  const studentId = input.studentId;
  const password = input.password;
  if (
    !["create", "reset"].includes(String(action)) ||
    !Number.isSafeInteger(studentId) ||
    Number(studentId) < 1 ||
    typeof password !== "string" ||
    password.length < 10 ||
    password.length > 128
  ) {
    return respond(400, { error: "Student ID, action, or temporary password is invalid." });
  }

  const studentCode = `VT-${String(studentId).padStart(4, "0")}`;
  const email = `student-${Number(studentId)}@students.votatravel.com`;
  const { data: existingProfile, error: existingProfileError } = await serviceClient
    .from("profiles")
    .select("user_id")
    .eq("student_id", Number(studentId))
    .maybeSingle();
  if (existingProfileError) {
    console.error("Unable to load the student's existing account.", existingProfileError);
    return respond(500, { error: "The existing student account could not be loaded." });
  }

  let userId = existingProfile?.user_id as string | undefined;
  if (userId) {
    const { error } = await serviceClient.auth.admin.updateUserById(userId, {
      email,
      password,
      email_confirm: true,
      ban_duration: "none",
      user_metadata: { role: "student", student_id: Number(studentId), student_code: studentCode },
    });
    if (error) {
      console.error("Unable to update the student's Auth account.", error);
      return respond(500, { error: "The student account could not be updated." });
    }
  } else {
    const { data, error } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "student", student_id: Number(studentId), student_code: studentCode },
    });
    if (error || !data.user) {
      console.error("Unable to create the student's Auth account.", error);
      return respond(500, { error: "The student account could not be created." });
    }
    userId = data.user.id;
  }

  const { error: linkError } = await serviceClient.from("profiles").upsert({
    user_id: userId,
    role: "student",
    student_id: Number(studentId),
  }, { onConflict: "user_id" });
  if (linkError) {
    console.error("Unable to link the student's Auth account to a profile.", linkError);
    return respond(500, { error: "The student account was created but could not be linked." });
  }

  return respond(200, { userId, username: studentCode });
});
