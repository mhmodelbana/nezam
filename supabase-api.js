(() => {
  const client = window.votaSupabase;
  if (!client) throw new Error("Supabase client is not initialized.");

  const defaultSettings = {
    companyName: "",
    companyPhone: "",
    companyAddress: "",
    logoDataUrl: "",
    primaryColor: "#174b55",
    tripLabels: { outbound: "ذهاب للجامعة", return: "عودة" },
    pickupAreas: [],
  };

  const studentFields = [
    "name", "phone", "pickup", "university", "faculty", "studyYear",
    "emergencyPhone", "subscription", "termId", "notes", "archivedAt",
    "mustChangePassword", "photoDataUrl", "createdAt", "updatedAt",
  ];
  const termFields = ["name", "academicYear", "priceCents", "startDate", "endDate", "createdAt", "updatedAt"];
  const subscriptionFields = [
    "studentId", "termId", "priceCents", "startDate", "endDate",
    "payments", "paymentAudit", "createdAt", "updatedAt",
  ];
  const scheduleFields = ["direction", "time", "active", "createdAt", "updatedAt"];
  const tripRequestFields = [
    "studentId", "studentName", "tripType", "tripDate", "tripTime", "scheduleId",
    "destination", "pickup", "notes", "status", "createdAt", "updatedAt",
  ];
  const settingsFields = [
    "companyName", "companyPhone", "companyAddress", "logoDataUrl", "primaryColor",
    "tripLabels", "pickupAreas", "updatedAt",
  ];

  function toModel(row) {
    if (!row) return null;
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, character) => character.toUpperCase()),
      value,
    ]));
  }

  function toRow(record, fields) {
    return Object.fromEntries(fields
      .filter((field) => Object.hasOwn(record, field))
      .map((field) => [
        field.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`),
        ["startDate", "endDate"].includes(field) && record[field] === "" ? null : record[field],
      ]));
  }

  function requireAdministrator() {
    if (window.votaData?.role !== "admin") {
      throw new Error("يجب تسجيل الدخول بحساب الإدارة لإجراء هذا التغيير.");
    }
  }

  function requireStudent(studentId) {
    if (window.votaData?.role !== "student" ||
      Number(window.votaData.studentId) !== Number(studentId)) {
      throw new Error("لا تملك صلاحية الوصول إلى بيانات هذا الطالب.");
    }
  }

  async function fetchAllRows(createQuery) {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await createQuery().range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  }

  async function studentProfiles(studentIds) {
    if (!studentIds.length) return new Map();
    const { data, error } = await client
      .from("profiles")
      .select("user_id, student_id")
      .in("student_id", studentIds);
    if (error) throw error;
    return new Map(data.map((profile) => [Number(profile.student_id), profile.user_id]));
  }

  async function enrichStudent(row) {
    const student = toModel(row);
    const profiles = await studentProfiles([student.id]);
    return { ...student, authUserId: profiles.get(Number(student.id)) };
  }

  async function enrichSubscriptions(rows) {
    if (!rows.length) return [];
    const [students, terms] = await Promise.all([
      fetchAllRows(() => client.from("students").select("id, name, phone")),
      fetchAllRows(() => client.from("terms").select("id, name, academic_year, start_date, end_date")),
    ]);
    const studentById = new Map(students.map((row) => [Number(row.id), toModel(row)]));
    const termById = new Map(terms.map((row) => [Number(row.id), toModel(row)]));

    return rows.map((row) => {
      const subscription = toModel(row);
      const student = studentById.get(Number(subscription.studentId));
      const term = termById.get(Number(subscription.termId));
      return {
        ...subscription,
        studentName: student?.name || "",
        studentPhone: student?.phone || "",
        termName: term?.name || "",
        academicYear: term?.academicYear || "",
        startDate: subscription.startDate || term?.startDate || "",
        endDate: subscription.endDate || term?.endDate || "",
        payments: Array.isArray(subscription.payments) ? subscription.payments : [],
        paymentAudit: Array.isArray(subscription.paymentAudit) ? subscription.paymentAudit : [],
      };
    });
  }

  async function enrichTripRequests(rows) {
    if (!rows.length) return [];
    const studentIds = [...new Set(rows.map((row) => Number(row.student_id)))];
    const { data, error } = await client
      .from("students")
      .select("id, name")
      .in("id", studentIds);
    if (error) throw error;
    const names = new Map(data.map((row) => [Number(row.id), row.name]));
    return rows.map((row) => {
      const request = toModel(row);
      return { ...request, studentName: request.studentName || names.get(Number(request.studentId)) || "" };
    });
  }

  async function getStudentProfiles() {
    requireAdministrator();
    const { data, error } = await client
      .from("profiles")
      .select("user_id, student_id")
      .eq("role", "student");
    if (error) throw error;
    return data;
  }

  async function getStudentNotificationState(studentId) {
    requireStudent(studentId);
    const { data, error } = await client
      .from("profiles")
      .select("notification_state")
      .eq("user_id", window.votaData.profile.user_id)
      .single();
    if (error) throw error;
    return data.notification_state || { lastSeen: 0, dismissed: [] };
  }

  async function updateStudentNotificationState(studentId, state) {
    requireStudent(studentId);
    if (!state || !Number.isFinite(Number(state.lastSeen)) ||
      !Array.isArray(state.dismissed) ||
      state.dismissed.some((id) => typeof id !== "string")) {
      throw new Error("حالة التنبيهات غير صالحة.");
    }
    const { error } = await client
      .from("profiles")
      .update({ notification_state: {
        lastSeen: Number(state.lastSeen),
        dismissed: [...new Set(state.dismissed)],
      } })
      .eq("user_id", window.votaData.profile.user_id);
    if (error) throw error;
  }

  async function getStudents() {
    const rows = await fetchAllRows(() =>
      client.from("students").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })
    );
    const profiles = await studentProfiles(rows.map((row) => Number(row.id)));
    return rows.map((row) => ({
      ...toModel(row),
      authUserId: profiles.get(Number(row.id)),
    }));
  }

  async function getStudent(id) {
    const { data, error } = await client
      .from("students")
      .select("*")
      .eq("id", Number(id))
      .maybeSingle();
    if (error) throw error;
    return data ? enrichStudent(data) : null;
  }

  async function createStudent(student) {
    requireAdministrator();
    const { data, error } = await client
      .from("students")
      .insert(toRow({
        ...student,
        mustChangePassword: student.mustChangePassword ?? true,
      }, studentFields))
      .select("*")
      .single();
    if (error) throw error;
    return enrichStudent(data);
  }

  async function updateStudent(id, updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("students")
      .update(toRow(updates, studentFields))
      .eq("id", Number(id))
      .select("*")
      .single();
    if (error) throw error;
    return enrichStudent(data);
  }

  async function updateCurrentStudentProfile(updates) {
    requireStudent(window.votaData.studentId);
    const { data, error } = await client.rpc("student_update_profile", { p_updates: updates });
    if (error) throw error;
    return enrichStudent(data);
  }

  async function deleteStudent(id) {
    requireAdministrator();
    const studentId = Number(id);
    await window.votaData.manageStudentAuth("delete", studentId, null);
    const { error } = await client.from("students").delete().eq("id", studentId);
    if (error) throw error;
  }

  async function getTerms() {
    const rows = await fetchAllRows(() =>
      client.from("terms").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })
    );
    return rows.map(toModel);
  }

  async function getTerm(id) {
    const { data, error } = await client.from("terms").select("*").eq("id", Number(id)).maybeSingle();
    if (error) throw error;
    return toModel(data);
  }

  async function createTerm(term) {
    requireAdministrator();
    const { data, error } = await client.from("terms").insert(toRow(term, termFields)).select("*").single();
    if (error) throw error;
    return toModel(data);
  }

  async function updateTerm(id, updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("terms")
      .update(toRow(updates, termFields))
      .eq("id", Number(id))
      .select("*")
      .single();
    if (error) throw error;
    return toModel(data);
  }

  async function deleteTerm(id) {
    requireAdministrator();
    const { error } = await client.from("terms").delete().eq("id", Number(id));
    if (error) throw error;
  }

  async function getSubscriptions() {
    const rows = await fetchAllRows(() =>
      client.from("subscriptions").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })
    );
    return enrichSubscriptions(rows);
  }

  async function getStudentSubscriptions(studentId) {
    requireStudent(studentId);
    const rows = await fetchAllRows(() =>
      client.from("subscriptions")
        .select("*")
        .eq("student_id", Number(studentId))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
    );
    return enrichSubscriptions(rows);
  }

  async function createSubscription(subscription) {
    requireAdministrator();
    const { data, error } = await client
      .from("subscriptions")
      .insert(toRow(subscription, subscriptionFields))
      .select("*")
      .single();
    if (error) throw error;
    return (await enrichSubscriptions([data]))[0];
  }

  async function updateSubscription(id, updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("subscriptions")
      .update(toRow(updates, subscriptionFields))
      .eq("id", Number(id))
      .select("*")
      .single();
    if (error) throw error;
    return (await enrichSubscriptions([data]))[0];
  }

  async function addPayment(subscriptionId, payment) {
    requireAdministrator();
    const { data, error } = await client.rpc("add_subscription_payment", {
      p_subscription_id: Number(subscriptionId),
      p_payment: payment,
    });
    if (error) throw error;
    return (await enrichSubscriptions([data]))[0];
  }

  async function deleteSubscription(id) {
    requireAdministrator();
    const { error } = await client.from("subscriptions").delete().eq("id", Number(id));
    if (error) throw error;
  }

  async function getTripSchedules() {
    const rows = await fetchAllRows(() =>
      client.from("trip_schedules").select("*").order("time").order("id")
    );
    return rows.map(toModel);
  }

  async function createTripSchedule(schedule) {
    requireAdministrator();
    const { data, error } = await client
      .from("trip_schedules")
      .insert(toRow(schedule, scheduleFields))
      .select("*")
      .single();
    if (error) throw error;
    return toModel(data);
  }

  async function updateTripSchedule(id, updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("trip_schedules")
      .update(toRow(updates, scheduleFields))
      .eq("id", Number(id))
      .select("*")
      .single();
    if (error) throw error;
    return toModel(data);
  }

  async function deleteTripSchedule(id) {
    requireAdministrator();
    const { error } = await client.from("trip_schedules").delete().eq("id", Number(id));
    if (error) throw error;
  }

  async function toggleTripSchedule(id) {
    requireAdministrator();
    const { data: schedule, error } = await client
      .from("trip_schedules")
      .select("active")
      .eq("id", Number(id))
      .single();
    if (error) throw error;
    return updateTripSchedule(id, { active: !schedule.active });
  }

  async function getSystemSettings() {
    const { data, error } = await client.from("system_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("إعدادات النظام غير موجودة في قاعدة البيانات. أعد تشغيل مخطط Supabase.");
    return {
      ...defaultSettings,
      ...toModel(data),
      tripLabels: { ...defaultSettings.tripLabels, ...data.trip_labels },
    };
  }

  async function updateSystemSettings(updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("system_settings")
      .upsert({ id: 1, ...toRow(updates, settingsFields) }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw error;
    return {
      ...defaultSettings,
      ...toModel(data),
      tripLabels: { ...defaultSettings.tripLabels, ...data.trip_labels },
    };
  }

  async function getAdministratorLoginName() {
    if (window.votaData.role !== "admin") {
      throw new Error("يجب تسجيل الدخول بحساب الإدارة.");
    }
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user?.email || "";
  }

  async function changeAdministratorLoginName(currentPassword, newLoginName) {
    return window.votaData.changeAdministratorLoginName(currentPassword, newLoginName);
  }

  async function getTripRequests() {
    const rows = await fetchAllRows(() =>
      client.from("trip_requests").select("*").order("created_at", { ascending: false }).order("id", { ascending: false })
    );
    return enrichTripRequests(rows);
  }

  async function getTripRequestsByDate(date) {
    const rows = await fetchAllRows(() =>
      client.from("trip_requests")
        .select("*")
        .eq("trip_date", date)
        .in("status", ["pending", "approved"])
        .order("trip_time")
        .order("id")
    );
    return enrichTripRequests(rows);
  }

  async function getStudentTripRequests(studentId) {
    requireStudent(studentId);
    const rows = await fetchAllRows(() =>
      client.from("trip_requests")
        .select("*")
        .eq("student_id", Number(studentId))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
    );
    return enrichTripRequests(rows);
  }

  async function createTripRequest(request) {
    requireAdministrator();
    const { data, error } = await client
      .from("trip_requests")
      .insert(toRow(request, tripRequestFields))
      .select("*")
      .single();
    if (error) throw error;
    return (await enrichTripRequests([data]))[0];
  }

  async function updateTripRequest(id, updates) {
    requireAdministrator();
    const { data, error } = await client
      .from("trip_requests")
      .update(toRow(updates, ["status", "notes", "updatedAt"]))
      .eq("id", Number(id))
      .select("*")
      .single();
    if (error) throw error;
    return (await enrichTripRequests([data]))[0];
  }

  async function deleteTripRequest(id) {
    requireAdministrator();
    const { error } = await client.from("trip_requests").delete().eq("id", Number(id));
    if (error) throw error;
  }

  async function hasAdministrator() {
    const { data, error } = await client.rpc("has_vota_admin");
    if (error) throw error;
    return Boolean(data);
  }

  async function createFirstAdministrator() {
    throw new Error("أنشئ حساب الإدارة من لوحة Supabase ثم اربطه بجدول profiles حسب دليل الإعداد.");
  }

  async function authenticate(loginName, password) {
    return window.votaData.signIn(loginName, password);
  }

  async function getSessionProfile() {
    return window.votaData.profile;
  }

  async function signOut() {
    return window.votaData.signOut();
  }

  async function manageStudentAuth(action, studentId, password) {
    const result = await window.votaData.manageStudentAuth(action, studentId, password);
    if (action !== "delete") {
      await updateStudent(studentId, { mustChangePassword: true });
    }
    return result;
  }

  async function changeStudentPassword(studentId, password) {
    requireStudent(studentId);
    return window.votaData.completePasswordChange(password);
  }

  async function changeAdministratorPassword(currentPassword, newPassword) {
    return window.votaData.changeAdministratorPassword(currentPassword, newPassword);
  }

  async function bookStudentTrip(studentId, scheduleId, tripDate) {
    requireStudent(studentId);
    const { error } = await client.rpc("student_trip_action", {
      p_action: "book",
      p_schedule_id: Number(scheduleId),
      p_trip_date: tripDate,
      p_request_id: null,
    });
    if (error) throw error;
    return getStudentTripRequests(studentId);
  }

  async function cancelStudentTrip(studentId, requestId) {
    requireStudent(studentId);
    const { error } = await client.rpc("student_trip_action", {
      p_action: "cancel",
      p_schedule_id: null,
      p_trip_date: null,
      p_request_id: Number(requestId),
    });
    if (error) throw error;
    return getStudentTripRequests(studentId);
  }

  window.votaAPI = Object.freeze({
    getStudentProfiles,
    getStudentNotificationState,
    updateStudentNotificationState,
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    updateCurrentStudentProfile,
    deleteStudent,
    getTerms,
    getTerm,
    createTerm,
    updateTerm,
    deleteTerm,
    getSubscriptions,
    getStudentSubscriptions,
    createSubscription,
    updateSubscription,
    addPayment,
    deleteSubscription,
    getTripSchedules,
    createTripSchedule,
    updateTripSchedule,
    deleteTripSchedule,
    toggleTripSchedule,
    getSystemSettings,
    updateSystemSettings,
    getAdministratorLoginName,
    changeAdministratorLoginName,
    getTripRequests,
    getTripRequestsByDate,
    getStudentTripRequests,
    createTripRequest,
    updateTripRequest,
    deleteTripRequest,
    hasAdministrator,
    createFirstAdministrator,
    authenticate,
    getSessionProfile,
    signOut,
    manageStudentAuth,
    changeStudentPassword,
    changeAdministratorPassword,
    bookStudentTrip,
    cancelStudentTrip,
  });
})();
