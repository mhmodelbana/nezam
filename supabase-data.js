(() => {
  const config = window.VOTA_SUPABASE_CONFIG;
  const client = window.supabase?.createClient(config?.url, config?.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  if (!client) {
    throw new Error("تعذر تهيئة اتصال Supabase. تحقق من رابط المشروع والمفتاح العام.");
  }

  window.votaSupabase = client;

  let currentProfile = null;

  function showError(text) {
    let message = document.querySelector(".local-storage-message");
    if (!message) {
      message = document.createElement("p");
      message.className = "local-storage-message";
      message.setAttribute("role", "status");
      message.setAttribute("aria-live", "polite");
      message.hidden = true;
      document.body.append(message);
    }
    message.textContent = text;
    message.classList.add("is-error");
    message.hidden = false;
  }

  async function loadProfile(userId) {
    const { data, error } = await client
      .from("profiles")
      .select("user_id, role, student_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("لا توجد صلاحية مرتبطة بهذا الحساب. تواصل مع الإدارة.");
    return data;
  }

  async function initialize() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      currentProfile = null;
      return false;
    }
    try {
      currentProfile = await loadProfile(data.session.user.id);
    } catch (profileError) {
      await client.auth.signOut();
      currentProfile = null;
      throw profileError;
    }
    return Boolean(currentProfile);
  }

  function loginEmail(loginName) {
    const normalized = String(loginName || "").trim();
    const studentCode = /^vt-(\d+)$/i.exec(normalized);
    if (!studentCode) return normalized;
    const studentId = Number(studentCode[1]);
    if (!Number.isSafeInteger(studentId) || studentId < 1) return normalized;
    return `student-${studentId}@students.votatravel.com`;
  }

  async function signIn(loginName, password) {
    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail(loginName),
      password,
    });
    if (error) {
      if (error.code === "invalid_credentials" || error.status === 400) return null;
      throw error;
    }
    try {
      currentProfile = await loadProfile(data.user.id);
    } catch (profileError) {
      await client.auth.signOut();
      currentProfile = null;
      throw profileError;
    }

    if (currentProfile.role === "student") {
      const student = await window.votaAPI.getStudent(currentProfile.student_id);
      if (!student || student.archivedAt) {
        await signOut();
        return null;
      }
    }
    return currentProfile;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    currentProfile = null;
  }

  async function refreshStudentState() {
    if (currentProfile?.role !== "student" || !currentProfile.student_id) {
      throw new Error("لا توجد جلسة طالب نشطة.");
    }

    const studentId = currentProfile.student_id;
    const [student, subscriptions, requests, schedules, terms] = await Promise.all([
      window.votaAPI.getStudent(studentId),
      window.votaAPI.getStudentSubscriptions(studentId),
      window.votaAPI.getStudentTripRequests(studentId),
      window.votaAPI.getTripSchedules(),
      window.votaAPI.getTerms(),
    ]);
    if (!student || student.archivedAt) throw new Error("ملف الطالب غير متاح.");
    return {
      student,
      subscriptions,
      requests,
      schedules: schedules.filter((schedule) => schedule.active),
      terms,
    };
  }

  async function completePasswordChange(password) {
    if (currentProfile?.role !== "student") {
      throw new Error("يجب تسجيل الدخول بحساب الطالب لتغيير كلمة المرور.");
    }
    const { error: passwordError } = await client.auth.updateUser({ password });
    if (passwordError) throw passwordError;
    const { error } = await client.rpc("student_complete_password_change");
    if (error) throw error;
    return refreshStudentState();
  }

  async function changeAdministratorPassword(currentPassword, newPassword) {
    if (currentProfile?.role !== "admin") {
      throw new Error("يجب تسجيل الدخول بحساب الإدارة لتغيير كلمة المرور.");
    }
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!userData.user?.email) throw new Error("تعذر تحديد بريد حساب الإدارة.");

    const { error: verifyError } = await client.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });
    if (verifyError) throw new Error("كلمة المرور الحالية غير صحيحة.");

    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function changeAdministratorLoginName(currentPassword, newEmail) {
    if (currentProfile?.role !== "admin") {
      throw new Error("يجب تسجيل الدخول بحساب الإدارة لتعديل البريد الإلكتروني.");
    }
    const email = String(newEmail || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
    }
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!userData.user?.email) throw new Error("تعذر تحديد بريد حساب الإدارة.");

    const { error: verifyError } = await client.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });
    if (verifyError) throw new Error("كلمة المرور الحالية غير صحيحة.");

    const { error } = await client.auth.updateUser({ email });
    if (error) throw error;
    return email;
  }

  async function manageStudentAuth(action, studentId, password) {
    if (currentProfile?.role !== "admin") {
      throw new Error("يجب تسجيل الدخول بحساب الإدارة لإدارة حسابات الطلاب.");
    }
    const { data, error } = await client.functions.invoke("manage-student-auth", {
      body: { action, studentId, password },
    });
    if (error) throw error;
    if (action !== "delete" && !data?.userId) {
      throw new Error("تعذر ربط حساب الطالب بقاعدة البيانات.");
    }
    return data;
  }

  async function bookStudentTrip(scheduleId, tripDate) {
    if (currentProfile?.role !== "student" || !currentProfile.student_id) {
      throw new Error("لا توجد جلسة طالب نشطة.");
    }
    return window.votaAPI.bookStudentTrip(currentProfile.student_id, scheduleId, tripDate);
  }

  async function cancelStudentTrip(requestId) {
    if (currentProfile?.role !== "student" || !currentProfile.student_id) {
      throw new Error("لا توجد جلسة طالب نشطة.");
    }
    return window.votaAPI.cancelStudentTrip(currentProfile.student_id, requestId);
  }

  window.votaData = Object.freeze({
    initialize,
    refreshStudentState,
    hasAdministrator: () => window.votaAPI.hasAdministrator(),
    signIn,
    signOut,
    bookStudentTrip,
    cancelStudentTrip,
    completePasswordChange,
    changeAdministratorPassword,
    changeAdministratorLoginName,
    manageStudentAuth,
    get profile() {
      return currentProfile;
    },
    get role() {
      return currentProfile?.role || null;
    },
    get studentId() {
      return currentProfile?.student_id;
    },
    showError,
  });
})();
