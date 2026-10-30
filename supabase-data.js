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

  const stateKeys = [
    "vota-travel.students.v1",
    "vota-travel.terms.v1",
    "vota-travel.subscriptions.v1",
    "vota-travel.trip-schedules.v1",
    "vota-travel.trip-requests.v1",
  ];
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const pendingState = new Map();
  const pendingPromises = new Set();
  let currentRole = null;
  let currentProfile = null;
  let currentUserId = null;
  let pendingWrites = 0;
  let batchTimer = null;
  let activeBatch = null;
  let syncMessage;

  function getLocal(key) {
    return originalGetItem.call(window.localStorage, key);
  }

  function setLocal(key, value) {
    originalSetItem.call(window.localStorage, key, value);
  }

  function createSyncMessage() {
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
    if (syncMessage) syncMessage.hidden = true;
  }

  function updatePendingMessage() {
    if (pendingWrites > 0) {
      showSyncMessage("جاري حفظ التغييرات في قاعدة البيانات...");
    } else {
      hideSyncMessage();
    }
  }

  function queueStateWrite(key, rawValue, previousValue) {
    const payload = JSON.parse(rawValue);
    let entry = pendingState.get(key);
    if (!entry) {
      entry = { previousValue, payload, rawValue, waiters: [] };
      pendingState.set(key, entry);
    } else {
      entry.payload = payload;
      entry.rawValue = rawValue;
    }
    let resolveWrite;
    let rejectWrite;
    const write = new Promise((resolve, reject) => {
      resolveWrite = resolve;
      rejectWrite = reject;
    });
    entry.waiters.push({ resolve: resolveWrite, reject: rejectWrite });
    pendingPromises.add(write);
    write.then(
      () => pendingPromises.delete(write),
      () => pendingPromises.delete(write)
    );
    pendingWrites++;
    updatePendingMessage();
    if (batchTimer === null) batchTimer = window.setTimeout(() => flushPendingState(), 0);
    return write;
  }

  async function flushPendingState() {
    if (batchTimer !== null) {
      window.clearTimeout(batchTimer);
      batchTimer = null;
    }
    if (activeBatch) await activeBatch;
    if (pendingState.size === 0) return;

    const batch = pendingState;
    pendingState.clear();
    activeBatch = (async () => {
      try {
        const state = Object.fromEntries(
          [...batch.entries()].map(([key, entry]) => [key, entry.payload])
        );
        const { error } = await client.rpc("admin_save_state_batch", { p_state: state });
        if (error) throw error;
        for (const entry of batch.values()) {
          for (const waiter of entry.waiters) waiter.resolve();
        }
      } catch (error) {
        console.error("Unable to persist application state to Supabase.", error);
        for (const [key, entry] of batch.entries()) {
          if (getLocal(key) === entry.rawValue) {
            if (entry.previousValue === null) originalRemoveItem.call(window.localStorage, key);
            else originalSetItem.call(window.localStorage, key, entry.previousValue);
          }
          for (const waiter of entry.waiters) waiter.reject(error);
        }
        showSyncMessage(
          "فشل حفظ التغييرات على Supabase. تحقق من الاتصال والصلاحيات ثم أعد تحميل الصفحة.",
          true
        );
      } finally {
        for (const entry of batch.values()) pendingWrites -= entry.waiters.length;
        if (pendingWrites === 0 &&
            !document.querySelector(".supabase-sync-message.is-error:not([hidden])")) {
          hideSyncMessage();
        }
      }
    })();
    try {
      await activeBatch;
    } finally {
      activeBatch = null;
    }
    if (pendingState.size > 0 && batchTimer === null) {
      batchTimer = window.setTimeout(() => flushPendingState(), 0);
    }
  }

  function installStorageAdapter() {
    Storage.prototype.setItem = function (key, value) {
      const stringKey = String(key);
      const stringValue = String(value);
      if (this === window.localStorage && stateKeys.includes(stringKey)) {
        if (currentRole !== "admin") {
          throw new Error("Only authenticated administrators can update shared application data.");
        }
        const previousValue = originalGetItem.call(this, stringKey);
        originalSetItem.call(this, stringKey, stringValue);
        queueStateWrite(stringKey, stringValue, previousValue).catch(() => {});
        return;
      }
      originalSetItem.call(this, stringKey, stringValue);
    };

    Storage.prototype.removeItem = function (key) {
      const stringKey = String(key);
      if (this === window.localStorage && stateKeys.includes(stringKey)) {
        if (currentRole !== "admin") {
          throw new Error("Only authenticated administrators can update shared application data.");
        }
        const previousValue = originalGetItem.call(this, stringKey);
        originalRemoveItem.call(this, stringKey);
        queueStateWrite(stringKey, "[]", previousValue).catch(() => {});
        return;
      }
      originalRemoveItem.call(this, stringKey);
    };
  }

  function hydrateAdminState(records) {
    const saved = new Map(records.map((record) => [record.state_key, record.payload]));
    for (const key of stateKeys) {
      setLocal(key, JSON.stringify(saved.get(key) ?? []));
    }
  }

  function hydrateStudentState(data) {
    const student = data?.student;
    if (!student || !Number.isSafeInteger(student.id) || student.archivedAt) {
      throw new Error("The authenticated student profile is unavailable.");
    }
    setLocal("vota-travel.students.v1", JSON.stringify([student]));
    setLocal("vota-travel.terms.v1", JSON.stringify(data.terms || []));
    setLocal("vota-travel.subscriptions.v1", JSON.stringify(data.subscriptions || []));
    setLocal("vota-travel.trip-schedules.v1", JSON.stringify(data.tripSchedules || []));
    setLocal("vota-travel.trip-requests.v1", JSON.stringify(data.tripRequests || []));
    window.sessionStorage.setItem(
      "vota-travel.portal-session",
      JSON.stringify({ studentId: student.id })
    );
    window.sessionStorage.removeItem("vota-travel.admin-session");
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
    const isLoginPage = document.body.classList.contains("login-page");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data.session;
    if (!session) {
      window.sessionStorage.removeItem("vota-travel.admin-session");
      window.sessionStorage.removeItem("vota-travel.portal-session");
      if (!isLoginPage) {
        window.location.replace("index.html");
        return false;
      }
      return true;
    }

    currentUserId = session.user.id;
    currentProfile = await loadProfile(currentUserId);
    currentRole = currentProfile.role;

    if (isLoginPage) {
      redirectForRole(currentRole);
      return false;
    }

    const isStudentPage = document.body.classList.contains("portal-page");
    if ((currentRole === "student") !== isStudentPage) {
      redirectForRole(currentRole);
      return false;
    }

    if (currentRole === "admin") {
      if (currentProfile.student_id !== null) {
        throw new Error("Administrator profile has an invalid student link.");
      }
      window.sessionStorage.setItem("vota-travel.admin-session", "active");
      window.sessionStorage.removeItem("vota-travel.portal-session");
      const { data: records, error: stateError } = await client
        .from("app_state")
        .select("state_key, payload");
      if (stateError) throw stateError;
      hydrateAdminState(records || []);
    } else if (currentRole === "student") {
      if (!Number.isSafeInteger(currentProfile.student_id)) {
        throw new Error("Student account is not linked to a student record.");
      }
      const { data: studentData, error: studentError } = await client.rpc(
        "student_portal_bootstrap"
      );
      if (studentError) {
        console.error("Unable to load the authenticated student's profile.", studentError);
        await client.auth.signOut();
        window.sessionStorage.removeItem("vota-travel.portal-session");
        window.sessionStorage.setItem(
          "vota-travel.login-error",
          "حساب الطالب غير متاح أو تعذر تحميل بياناته. تواصل مع الإدارة."
        );
        window.location.replace("index.html");
        return false;
      }
      hydrateStudentState(studentData);
    } else {
      throw new Error("Unsupported Vota Travel account role.");
    }

    installStorageAdapter();
    window.addEventListener("beforeunload", (event) => {
      if (pendingWrites === 0) return;
      event.preventDefault();
      event.returnValue = "";
    });
    return true;
  }

  async function refreshStudentState() {
    const { data, error } = await client.rpc("student_portal_bootstrap");
    if (error) throw error;
    hydrateStudentState(data);
    return data;
  }

  async function updateStudentTrip(action, scheduleId, tripDate, requestId) {
    const { data, error } = await client.rpc("student_trip_action", {
      p_action: action,
      p_schedule_id: scheduleId ?? null,
      p_trip_date: tripDate ?? null,
      p_request_id: requestId ?? null,
    });
    if (error) throw error;
    const requests = data?.tripRequests;
    if (!Array.isArray(requests)) {
      throw new Error("Supabase returned an invalid trip registration response.");
    }
    setLocal("vota-travel.trip-requests.v1", JSON.stringify(requests));
    return requests;
  }

  async function completePasswordChange(password) {
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) throw passwordError;
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

  async function flush() {
    while (pendingPromises.size > 0) {
      await flushPendingState();
      await Promise.all([...pendingPromises]);
    }
  }

  window.votaData = Object.freeze({
    initialize,
    refreshStudentState,
    updateStudentTrip,
    completePasswordChange,
    manageStudentAuth,
    flush,
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
