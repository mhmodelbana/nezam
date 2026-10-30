(() => {
  const client = window.votaSupabase;
  if (!client) {
    throw new Error("Supabase client not initialized. Load supabase-data.js first.");
  }

  const numberOrNull = (value) => value === null || value === undefined ? null : Number(value);
  const pageSize = 1000;

  async function fetchAllRows(createQuery) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await createQuery()
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = data || [];
      rows.push(...page);
      if (page.length < pageSize) return rows;
    }
  }

  function studentFromRow(row, profiles = []) {
    const profile = profiles.find((item) => Number(item.student_id) === Number(row.id));
    return {
      id: Number(row.id),
      name: row.name,
      phone: row.phone,
      pickup: row.pickup,
      university: row.university || "",
      faculty: row.faculty || "",
      studyYear: row.study_year || "",
      emergencyPhone: row.emergency_phone || "",
      subscription: row.subscription,
      termId: numberOrNull(row.term_id),
      notes: row.notes || "",
      archivedAt: row.archived_at || undefined,
      mustChangePassword: Boolean(row.must_change_password),
      authUserId: profile?.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function studentToRow(student) {
    const row = {};
    const fields = {
      name: "name",
      phone: "phone",
      pickup: "pickup",
      university: "university",
      faculty: "faculty",
      studyYear: "study_year",
      emergencyPhone: "emergency_phone",
      subscription: "subscription",
      termId: "term_id",
      notes: "notes",
      archivedAt: "archived_at",
      mustChangePassword: "must_change_password",
    };
    for (const [source, target] of Object.entries(fields)) {
      if (Object.hasOwn(student, source)) {
        const value = student[source];
        row[target] = value === "" && ["university", "faculty", "studyYear", "emergencyPhone", "notes"].includes(source)
          ? null
          : value;
      }
    }
    return row;
  }

  function termFromRow(row) {
    return {
      id: Number(row.id),
      name: row.name,
      academicYear: row.academic_year,
      priceCents: Number(row.price_cents),
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function termToRow(term) {
    const row = {};
    for (const [source, target] of Object.entries({
      name: "name",
      academicYear: "academic_year",
      priceCents: "price_cents",
      startDate: "start_date",
      endDate: "end_date",
    })) {
      if (Object.hasOwn(term, source)) row[target] = term[source];
    }
    return row;
  }

  function subscriptionFromRow(row) {
    const student = row.students || {};
    const term = row.terms || {};
    return {
      id: Number(row.id),
      studentId: Number(row.student_id),
      studentName: student.name || "",
      studentPhone: student.phone || "",
      termId: Number(row.term_id),
      termName: term.name || "",
      academicYear: term.academic_year || "",
      priceCents: Number(row.price_cents),
      startDate: row.start_date,
      endDate: row.end_date,
      payments: Array.isArray(row.payments) ? row.payments : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function subscriptionToRow(subscription) {
    const row = {};
    for (const [source, target] of Object.entries({
      studentId: "student_id",
      termId: "term_id",
      startDate: "start_date",
      endDate: "end_date",
      priceCents: "price_cents",
      payments: "payments",
    })) {
      if (Object.hasOwn(subscription, source)) row[target] = subscription[source];
    }
    return row;
  }

  function scheduleFromRow(row) {
    return {
      id: Number(row.id),
      direction: row.direction,
      time: row.time,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function requestFromRow(row) {
    return {
      id: Number(row.id),
      studentId: Number(row.student_id),
      studentName: row.student_name || row.students?.name || "",
      tripType: row.trip_type,
      tripDate: row.trip_date,
      tripTime: row.trip_time,
      scheduleId: numberOrNull(row.schedule_id),
      destination: row.destination,
      pickup: row.pickup || "",
      notes: row.notes || "",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async function getStudentProfiles() {
    return fetchAllRows(() => client.from("profiles")
      .select("user_id, student_id")
      .eq("role", "student")
      .order("user_id"));
  }

  async function getStudents() {
    const [data, profiles] = await Promise.all([
      fetchAllRows(() => client.from("students").select("*")
        .order("created_at", { ascending: false }).order("id", { ascending: false })),
      getStudentProfiles(),
    ]);
    return data.map((row) => studentFromRow(row, profiles));
  }

  async function getStudent(id) {
    const [{ data, error }, profiles] = await Promise.all([
      client.from("students").select("*").eq("id", id).single(),
      getStudentProfiles(),
    ]);
    if (error) throw error;
    return studentFromRow(data, profiles);
  }

  async function createStudent(student) {
    const { data, error } = await client
      .from("students")
      .insert({
        ...studentToRow(student),
        must_change_password: student.mustChangePassword ?? true,
      })
      .select()
      .single();
    if (error) throw error;
    return studentFromRow(data);
  }

  async function updateStudent(id, updates) {
    const { data, error } = await client
      .from("students")
      .update(studentToRow(updates))
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return studentFromRow(data);
  }

  async function deleteStudent(id) {
    const { error } = await client.from("students").delete().eq("id", id);
    if (error) throw error;
  }

  async function getTerms() {
    const data = await fetchAllRows(() => client.from("terms").select("*")
      .order("created_at", { ascending: false }).order("id", { ascending: false }));
    return data.map(termFromRow);
  }

  async function getTerm(id) {
    const { data, error } = await client.from("terms").select("*").eq("id", id).single();
    if (error) throw error;
    return termFromRow(data);
  }

  async function createTerm(term) {
    const { data, error } = await client.from("terms").insert(termToRow(term)).select().single();
    if (error) throw error;
    return termFromRow(data);
  }

  async function updateTerm(id, updates) {
    const { data, error } = await client
      .from("terms")
      .update(termToRow(updates))
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return termFromRow(data);
  }

  async function deleteTerm(id) {
    const { error } = await client.from("terms").delete().eq("id", id);
    if (error) throw error;
  }

  async function getSubscriptions() {
    const data = await fetchAllRows(() => client.from("subscriptions")
      .select("*, students(name, phone), terms(name, academic_year)")
      .order("created_at", { ascending: false }).order("id", { ascending: false }));
    return data.map(subscriptionFromRow);
  }

  async function getStudentSubscriptions(studentId) {
    const data = await fetchAllRows(() => client.from("subscriptions")
      .select("*, students(name, phone), terms(name, academic_year)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }));
    return data.map(subscriptionFromRow);
  }

  async function createSubscription(subscription) {
    const { data, error } = await client
      .from("subscriptions")
      .insert(subscriptionToRow(subscription))
      .select("*, students(name, phone), terms(name, academic_year)")
      .single();
    if (error) throw error;
    return subscriptionFromRow(data);
  }

  async function updateSubscription(id, updates) {
    const { data, error } = await client
      .from("subscriptions")
      .update(subscriptionToRow(updates))
      .eq("id", id)
      .select("*, students(name, phone), terms(name, academic_year)")
      .single();
    if (error) throw error;
    return subscriptionFromRow(data);
  }

  async function addPayment(subscriptionId, payment) {
    const { data: subscription, error: getError } = await client
      .from("subscriptions")
      .select("payments")
      .eq("id", subscriptionId)
      .single();
    if (getError) throw getError;

    const payments = [...(subscription.payments || []), payment];
    const { data, error } = await client
      .from("subscriptions")
      .update({ payments })
      .eq("id", subscriptionId)
      .select("*, students(name, phone), terms(name, academic_year)")
      .single();
    if (error) throw error;
    return subscriptionFromRow(data);
  }

  async function deleteSubscription(id) {
    const { error } = await client.from("subscriptions").delete().eq("id", id);
    if (error) throw error;
  }

  async function getTripSchedules() {
    const data = await fetchAllRows(() => client.from("trip_schedules").select("*")
      .order("time").order("id"));
    return data.map(scheduleFromRow);
  }

  async function createTripSchedule(schedule) {
    const { data, error } = await client
      .from("trip_schedules")
      .insert({ direction: schedule.direction, time: schedule.time, active: schedule.active !== false })
      .select()
      .single();
    if (error) throw error;
    return scheduleFromRow(data);
  }

  async function updateTripSchedule(id, updates) {
    const { data, error } = await client
      .from("trip_schedules")
      .update({ direction: updates.direction, time: updates.time, active: updates.active })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return scheduleFromRow(data);
  }

  async function deleteTripSchedule(id) {
    const { error } = await client.from("trip_schedules").delete().eq("id", id);
    if (error) throw error;
  }

  async function toggleTripSchedule(id) {
    const { data: schedule, error: getError } = await client
      .from("trip_schedules")
      .select("active")
      .eq("id", id)
      .single();
    if (getError) throw getError;
    return updateTripSchedule(id, { active: !schedule.active });
  }

  async function getTripRequests() {
    const data = await fetchAllRows(() => client.from("trip_requests")
      .select("*, students(name)")
      .order("created_at", { ascending: false }).order("id", { ascending: false }));
    return data.map(requestFromRow);
  }

  async function getTripRequestsByDate(date) {
    const data = await fetchAllRows(() => client.from("trip_requests")
      .select("*, students(name)")
      .eq("trip_date", date)
      .in("status", ["pending", "approved"])
      .order("trip_time").order("id"));
    return data.map(requestFromRow);
  }

  async function getStudentTripRequests(studentId) {
    const data = await fetchAllRows(() => client.from("trip_requests")
      .select("*, students(name)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }));
    return data.map(requestFromRow);
  }

  async function createTripRequest(request) {
    const { data, error } = await client
      .from("trip_requests")
      .insert({
        student_id: request.studentId,
        student_name: request.studentName,
        trip_type: request.tripType,
        trip_date: request.tripDate,
        trip_time: request.tripTime,
        schedule_id: request.scheduleId,
        destination: request.destination,
        pickup: request.pickup,
        notes: request.notes || "",
        status: request.status || "pending",
      })
      .select("*, students(name)")
      .single();
    if (error) throw error;
    return requestFromRow(data);
  }

  async function updateTripRequest(id, updates) {
    const { data, error } = await client
      .from("trip_requests")
      .update({ status: updates.status })
      .eq("id", id)
      .select("*, students(name)")
      .single();
    if (error) throw error;
    return requestFromRow(data);
  }

  async function deleteTripRequest(id) {
    const { error } = await client.from("trip_requests").delete().eq("id", id);
    if (error) throw error;
  }

  window.votaAPI = Object.freeze({
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
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
    getTripRequests,
    getTripRequestsByDate,
    getStudentTripRequests,
    createTripRequest,
    updateTripRequest,
    deleteTripRequest,
  });
})();
