(() => {
  const client = window.votaSupabase;
  if (!client) {
    throw new Error("Supabase client not initialized. Load supabase-data.js first.");
  }

  // Students API
  async function getStudents() {
    const { data, error } = await client
      .from("students")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getStudent(id) {
    const { data, error } = await client
      .from("students")
      .select("*, subscriptions(*, terms(*))")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async function createStudent(student) {
    const { data, error } = await client
      .from("students")
      .insert({
        name: student.name,
        phone: student.phone,
        pickup: student.pickup,
        university: student.university || null,
        faculty: student.faculty || null,
        study_year: student.studyYear || null,
        emergency_phone: student.emergencyPhone || null,
        subscription: student.subscription || "active",
        term_id: student.termId || null,
        notes: student.notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateStudent(id, updates) {
    const { data, error } = await client
      .from("students")
      .update({
        name: updates.name,
        phone: updates.phone,
        pickup: updates.pickup,
        university: updates.university,
        faculty: updates.faculty,
        study_year: updates.studyYear,
        emergency_phone: updates.emergencyPhone,
        subscription: updates.subscription,
        term_id: updates.termId,
        notes: updates.notes,
        archived_at: updates.archivedAt,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteStudent(id) {
    const { error } = await client
      .from("students")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  // Terms API
  async function getTerms() {
    const { data, error } = await client
      .from("terms")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getTerm(id) {
    const { data, error } = await client
      .from("terms")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }

  async function createTerm(term) {
    const { data, error } = await client
      .from("terms")
      .insert({
        name: term.name,
        academic_year: term.academicYear,
        price_cents: term.priceCents,
        start_date: term.startDate,
        end_date: term.endDate,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateTerm(id, updates) {
    const { data, error } = await client
      .from("terms")
      .update({
        name: updates.name,
        academic_year: updates.academicYear,
        price_cents: updates.priceCents,
        start_date: updates.startDate,
        end_date: updates.endDate,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteTerm(id) {
    const { error } = await client
      .from("terms")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  // Subscriptions API
  async function getSubscriptions() {
    const { data, error } = await client
      .from("subscriptions")
      .select("*, students(*), terms(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getStudentSubscriptions(studentId) {
    const { data, error } = await client
      .from("subscriptions")
      .select("*, terms(*)")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function createSubscription(subscription) {
    const { data, error } = await client
      .from("subscriptions")
      .insert({
        student_id: subscription.studentId,
        term_id: subscription.termId,
        start_date: subscription.startDate,
        end_date: subscription.endDate,
        price_cents: subscription.priceCents,
        payments: subscription.payments || [],
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateSubscription(id, updates) {
    const { data, error } = await client
      .from("subscriptions")
      .update({
        start_date: updates.startDate,
        end_date: updates.endDate,
        price_cents: updates.priceCents,
        payments: updates.payments,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function addPayment(subscriptionId, payment) {
    const { data: subscription, error: subError } = await client
      .from("subscriptions")
      .select("payments")
      .eq("id", subscriptionId)
      .single();
    if (subError) throw subError;

    const payments = subscription.payments || [];
    payments.push(payment);

    const { data, error } = await client
      .from("subscriptions")
      .update({ payments })
      .eq("id", subscriptionId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteSubscription(id) {
    const { error } = await client
      .from("subscriptions")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  // Trip Schedules API
  async function getTripSchedules() {
    const { data, error } = await client
      .from("trip_schedules")
      .select("*")
      .order("time");
    if (error) throw error;
    return data || [];
  }

  async function createTripSchedule(schedule) {
    const { data, error } = await client
      .from("trip_schedules")
      .insert({
        direction: schedule.direction,
        time: schedule.time,
        active: schedule.active !== false,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateTripSchedule(id, updates) {
    const { data, error } = await client
      .from("trip_schedules")
      .update({
        direction: updates.direction,
        time: updates.time,
        active: updates.active,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteTripSchedule(id) {
    const { error } = await client
      .from("trip_schedules")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async function toggleTripSchedule(id) {
    const { data: schedule, error: getError } = await client
      .from("trip_schedules")
      .select("*")
      .eq("id", id)
      .single();
    if (getError) throw getError;

    const { data, error } = await client
      .from("trip_schedules")
      .update({ active: !schedule.active })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Trip Requests API
  async function getTripRequests() {
    const { data, error } = await client
      .from("trip_requests")
      .select("*, students(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getTripRequestsByDate(date) {
    const { data, error } = await client
      .from("trip_requests")
      .select("*, students(*)")
      .eq("trip_date", date)
      .in("status", ["pending", "approved"])
      .order("trip_time");
    if (error) throw error;
    return data || [];
  }

  async function getStudentTripRequests(studentId) {
    const { data, error } = await client
      .from("trip_requests")
      .select("*")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
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
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateTripRequest(id, updates) {
    const { data, error } = await client
      .from("trip_requests")
      .update({
        status: updates.status,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteTripRequest(id) {
    const { error } = await client
      .from("trip_requests")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  // Export API
  window.votaAPI = Object.freeze({
    // Students
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    deleteStudent,
    // Terms
    getTerms,
    getTerm,
    createTerm,
    updateTerm,
    deleteTerm,
    // Subscriptions
    getSubscriptions,
    getStudentSubscriptions,
    createSubscription,
    updateSubscription,
    addPayment,
    deleteSubscription,
    // Trip Schedules
    getTripSchedules,
    createTripSchedule,
    updateTripSchedule,
    deleteTripSchedule,
    toggleTripSchedule,
    // Trip Requests
    getTripRequests,
    getTripRequestsByDate,
    getStudentTripRequests,
    createTripRequest,
    updateTripRequest,
    deleteTripRequest,
  });
})();
