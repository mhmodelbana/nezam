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
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;

    if (!session) {
      currentRole = null;
      currentProfile = null;
      currentUserId = null;
      return false;
    }

    currentUserId = session.user.id;
    currentProfile = await loadProfile(currentUserId);
    currentRole = currentProfile.role;

    return true;
  }

  async function refreshStudentState() {
    if (!currentProfile || currentProfile.role !== "student" || !currentProfile.student_id) {
      throw new Error("No active student session");
    }

    const studentId = currentProfile.student_id;
    const [student, subscriptions, requests, schedules, terms] = await Promise.all([
      window.votaAPI.getStudent(studentId),
      window.votaAPI.getStudentSubscriptions(studentId),
      window.votaAPI.getStudentTripRequests(studentId),
      window.votaAPI.getTripSchedules(),
      window.votaAPI.getTerms(),
    ]);
    if (!student || student.archivedAt) throw new Error("Student record is unavailable");
    return {
      student,
      subscriptions,
      requests,
      schedules: schedules.filter((schedule) => schedule.active),
      terms,
    };
  }

  async function updateStudentTrip(action, scheduleId, tripDate, requestId) {
    if (!currentProfile || currentProfile.role !== "student" || !currentProfile.student_id) {
      throw new Error("No active student session");
    }

    const { error } = await client.rpc("student_trip_action", {
      p_action: action,
      p_schedule_id: scheduleId,
      p_trip_date: tripDate,
      p_request_id: requestId,
    });
    if (error) throw error;
    return window.votaAPI.getStudentTripRequests(currentProfile.student_id);
  }

  async function completePasswordChange(password) {
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) throw passwordError;

    if (!currentProfile || currentProfile.role !== "student" || !currentProfile.student_id) {
      throw new Error("No active student session");
    }

    const { error: profileError } = await client.rpc("student_complete_password_change");
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
    get studentId() {
      return currentProfile?.student_id;
    },
    showError(message) {
      showSyncMessage(message, true);
    },
  });
})();
