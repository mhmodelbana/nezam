(() => {
  const client = window.supabase?.createClient(
    window.VOTA_SUPABASE_CONFIG?.url,
    window.VOTA_SUPABASE_CONFIG?.publishableKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    }
  );
  if (!client) {
    throw new Error("Supabase SDK or public project configuration is unavailable.");
  }

  window.votaSupabase = client;

  let currentRole = null;
  let currentProfile = null;
  let currentUserId = null;

  function createSyncMessage() {
    let syncMessage = document.querySelector(".supabase-sync-message");
    if (syncMessage) return syncMessage;
    syncMessage = document.createElement("p");
    syncMessage.className = "supabase-sync-message";
    syncMessage.setAttribute("role", "status");
    syncMessage.setAttribute("aria-live", "polite");
    syncMessage.hidden = true;
    document.body.append(syncMessage);
    return syncMessage;
  }

  function showSyncMessage(text, isError = false) {
    const message = createSyncMessage();
    message.textContent = text;
    message.classList.toggle("is-error", isError);
    message.hidden = false;
  }

  function hideSyncMessage() {
    const syncMessage = document.querySelector(".supabase-sync-message");
    if (syncMessage) syncMessage.hidden = true;
  }

  async function loadProfile(userId) {
    const { data, error } = await client
      .from("profiles")
      .select("user_id, role, student_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("No Vota Travel role is assigned to this account.");
    return data;
  }

  function redirectForRole(role) {
    if (role === "admin") window.location.replace("dashboard.html");
    else if (role === "student") window.location.replace("portal.html");
  }

  async function initialize() {
    // Authentication disabled - always return true
    window.sessionStorage.setItem("vota-travel.admin-session", "active");
    window.sessionStorage.removeItem("vota-travel.portal-session");
    currentRole = "admin";
    currentProfile = { role: "admin", student_id: null };
    return true;
  }

  async function refreshStudentState() {
    const session = JSON.parse(window.sessionStorage.getItem("vota-travel.portal-session") || "null");
    if (!session || !session.studentId) throw new Error("No active student session");

    const { data: student, error: studentError } = await client
      .from("students")
      .select("*")
      .eq("id", session.studentId)
      .single();
    if (studentError) throw studentError;
    if (!student || student.archived_at) throw new Error("Student record is unavailable");

    const { data: subscriptions, error: subError } = await client
      .from("subscriptions")
      .select("*, terms(*)")
      .eq("student_id", session.studentId);
    if (subError) throw subError;

    const { data: requests, error: reqError } = await client
      .from("trip_requests")
      .select("*")
      .eq("student_id", session.studentId);
    if (reqError) throw reqError;

    const { data: schedules, error: schedError } = await client
      .from("trip_schedules")
      .select("*")
      .eq("active", true);
    if (schedError) throw schedError;

    return { student, subscriptions, requests, schedules };
  }

  async function updateStudentTrip(action, scheduleId, tripDate, requestId) {
    const session = JSON.parse(window.sessionStorage.getItem("vota-travel.portal-session") || "null");
    if (!session || !session.studentId) throw new Error("No active student session");

    if (action === "cancel") {
      const { error } = await client
        .from("trip_requests")
        .update({ status: "cancelled" })
        .eq("id", requestId)
        .eq("student_id", session.studentId);
      if (error) throw error;
    } else if (action === "book") {
      const { data: student, error: studentError } = await client
        .from("students")
        .select("*, subscriptions(*, terms(*))")
        .eq("id", session.studentId)
        .single();
      if (studentError) throw studentError;

      const { data: schedule, error: schedError } = await client
        .from("trip_schedules")
        .select("*")
        .eq("id", scheduleId)
        .eq("active", true)
        .single();
      if (schedError) throw schedError;
      if (!schedule) throw new Error("This trip time is not available");

      const today = new Date().toISOString().split('T')[0];
      if (tripDate !== today) throw new Error("Bookings are available for today only");

      const { data: existing, error: existingError } = await client
        .from("trip_requests")
        .select("*")
        .eq("student_id", session.studentId)
        .eq("trip_date", tripDate)
        .eq("trip_type", schedule.direction)
        .in("status", ["pending", "approved"])
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error("A registration already exists for this direction today");

      const { error: insertError } = await client
        .from("trip_requests")
        .insert({
          student_id: session.studentId,
          student_name: student.name,
          trip_type: schedule.direction,
          trip_date: tripDate,
          trip_time: schedule.time,
          schedule_id: scheduleId,
          destination: student.pickup,
          pickup: student.pickup,
          notes: "",
          status: "approved"
        });
      if (insertError) throw insertError;
    }

    const { data: requests, error } = await client
      .from("trip_requests")
      .select("*")
      .eq("student_id", session.studentId);
    if (error) throw error;
    return requests;
  }

  async function completePasswordChange(password) {
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) throw passwordError;

    const session = JSON.parse(window.sessionStorage.getItem("vota-travel.portal-session") || "null");
    if (!session || !session.studentId) throw new Error("No active student session");

    const { error: profileError } = await client
      .from("students")
      .update({ must_change_password: false })
      .eq("id", session.studentId);
    if (profileError) throw profileError;

    return refreshStudentState();
  }

  async function manageStudentAuth(action, studentId, password) {
    const { data, error } = await client.functions.invoke("manage-student-auth", {
      body: { action, studentId, password },
    });
    if (error) throw error;
    if (!data?.userId) throw new Error("Student authentication setup returned no user ID.");
    return data;
  }

  window.votaData = Object.freeze({
    initialize,
    refreshStudentState,
    updateStudentTrip,
    completePasswordChange,
    manageStudentAuth,
    get profile() {
      return currentProfile;
    },
    get role() {
      return currentRole;
    },
    showError(message) {
      showSyncMessage(message, true);
    },
  });
})();
