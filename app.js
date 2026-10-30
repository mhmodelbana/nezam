function initializeDateTime() {
  const dateElement = document.querySelector("#current-date");
  const timeElement = document.querySelector("#current-time");
  if (!dateElement || !timeElement) return;

  const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const updateDateTime = () => {
    const now = new Date();
    dateElement.textContent = dateFormatter.format(now);
    timeElement.dateTime = now.toISOString();
    timeElement.textContent = timeFormatter.format(now);
  };

  updateDateTime();
  window.setInterval(updateDateTime, 1000);
}

function initializeSessionLogout() {
  for (const link of document.querySelectorAll(".logout-link")) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const destination = link.href;
      try {
        const { error } = await window.votaSupabase.auth.signOut();
        if (error) throw error;
      } catch (error) {
        console.error("Unable to sign out from Supabase.", error);
        window.votaData.showError("تعذر تسجيل الخروج. حاول مرة أخرى.");
        return;
      }
      window.sessionStorage.removeItem("vota-travel.admin-session");
      window.sessionStorage.removeItem("vota-travel.portal-session");
      window.location.assign(destination);
    });
  }
}

function initializeLogin() {
  const loginForm = document.querySelector("#login-form");
  if (!loginForm) return;

  const passwordInput = document.querySelector("#password");
  const passwordToggle = document.querySelector("#password-toggle");
  const usernameInput = document.querySelector("#username");
  const formMessage = document.querySelector("#form-message");
  const savedLoginError = window.sessionStorage.getItem("vota-travel.login-error");
  if (savedLoginError) {
    formMessage.textContent = savedLoginError;
    window.sessionStorage.removeItem("vota-travel.login-error");
  }

  passwordToggle.addEventListener("click", () => {
    const isPasswordHidden = passwordInput.type === "password";
    passwordInput.type = isPasswordHidden ? "text" : "password";
    passwordToggle.setAttribute("aria-pressed", String(isPasswordHidden));
    passwordToggle.setAttribute(
      "aria-label",
      isPasswordHidden ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
    );
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    formMessage.textContent = "";
    try {
      const loginName = usernameInput.value.trim();
      const studentCode = /^VT-(\d+)$/i.exec(loginName);
      const email = studentCode
        ? `student-${Number(studentCode[1])}@students.votatravel.com`
        : loginName;
      const { data, error } = await window.votaSupabase.auth.signInWithPassword({
        email,
        password: passwordInput.value,
      });
      if (error) {
        formMessage.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
        return;
      }

      const { data: profile, error: profileError } = await window.votaSupabase
        .from("profiles")
        .select("role, student_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (profileError || !profile) {
        await window.votaSupabase.auth.signOut();
        throw profileError || new Error("The authenticated account has no assigned role.");
      }
      if (profile.role === "admin" && profile.student_id === null) {
        window.sessionStorage.setItem("vota-travel.admin-session", "active");
        window.sessionStorage.removeItem("vota-travel.portal-session");
        window.location.assign("dashboard.html");
      } else if (profile.role === "student" && Number.isSafeInteger(profile.student_id)) {
        window.sessionStorage.setItem(
          "vota-travel.portal-session",
          JSON.stringify({ studentId: profile.student_id })
        );
        window.sessionStorage.removeItem("vota-travel.admin-session");
        window.location.assign("portal.html");
      } else {
        await window.votaSupabase.auth.signOut();
        throw new Error("The authenticated account has an invalid role assignment.");
      }
    } catch (error) {
      console.error("Unable to authenticate student portal login.", error);
      formMessage.textContent = "تعذر تسجيل الدخول الآن. حاول مرة أخرى.";
    }
  });
}

const studentRecordsKey = "vota-travel.students.v1";
const tripRequestsKey = "vota-travel.trip-requests.v1";
const tripSchedulesKey = "vota-travel.trip-schedules.v1";
const subscriptionExpiryAlertDays = 15;
const tripDirectionLabels = { outbound: "ذهاب للجامعة", return: "عودة" };
const tripStatusLabels = {
  pending: "مسجل",
  approved: "مسجل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function studentUsername(studentId) {
  return `VT-${String(studentId).padStart(4, "0")}`;
}

function formatLocalDate(value) {
  if (!value) return "غير محدد";
  const dateOnly = value.slice(0, 10);
  if (!isValidDateOnly(dateOnly)) return "غير محدد";
  const date = new Date(`${dateOnly}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "غير محدد"
    : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
}

function formatTripCardDate(value) {
  if (!isValidDateOnly(value)) return "غير محدد";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "غير محدد"
    : new Intl.DateTimeFormat("ar-EG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isTripSchedule(record) {
  return record !== null &&
    typeof record === "object" &&
    Number.isSafeInteger(record.id) &&
    record.id > 0 &&
    ["outbound", "return"].includes(record.direction) &&
    typeof record.time === "string" &&
    /^\d{2}:\d{2}$/.test(record.time) &&
    Number(record.time.slice(0, 2)) < 24 &&
    Number(record.time.slice(3, 5)) < 60 &&
    typeof record.active === "boolean";
}

function readTripSchedules() {
  const stored = window.localStorage.getItem(tripSchedulesKey);
  if (stored === null) return [];
  const schedules = JSON.parse(stored);
  if (!Array.isArray(schedules) || !schedules.every(isTripSchedule)) {
    throw new TypeError("Saved trip schedule data has an invalid format.");
  }
  if (new Set(schedules.map((schedule) => schedule.id)).size !== schedules.length) {
    throw new TypeError("Saved trip schedule data contains duplicate IDs.");
  }
  return schedules;
}

function formatTripTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function isStudentEligibleForTrips(student, tripDate = localDateString()) {
  if (student.subscription !== "active" || student.archivedAt) return false;
  const subscriptions = JSON.parse(
    window.localStorage.getItem("vota-travel.subscriptions.v1") || "[]"
  );
  const terms = JSON.parse(window.localStorage.getItem("vota-travel.terms.v1") || "[]");
  if (!Array.isArray(subscriptions) || !Array.isArray(terms)) {
    throw new TypeError("Saved subscription data has an invalid format.");
  }
  const subscription = subscriptions.find((record) =>
    record.studentId === student.id && record.termId === student.termId
  );
  const term = terms.find((record) => record.id === student.termId);
  const startDate = subscription?.startDate || term?.startDate;
  const endDate = subscription?.endDate || term?.endDate;
  return Boolean(
    startDate &&
    endDate &&
    isValidDateOnly(startDate) &&
    isValidDateOnly(endDate) &&
    isValidDateOnly(tripDate) &&
    startDate <= tripDate &&
    endDate >= tripDate
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "غير محدد"
    : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function arabicNumber(value) {
  return new Intl.NumberFormat("ar-EG").format(value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function printReceipt(student, subscription, payment) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    window.alert("تعذر فتح نافذة الإيصال. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");
    return;
  }
  const methodLabels = { cash: "نقدي", transfer: "تحويل بنكي / محفظة", other: "أخرى" };
  const receiptNumber = payment.receiptNumber ||
    `VOTA-${subscription.id}-${subscription.payments.indexOf(payment) + 1}`;
  const paidAt = new Date(payment.paidAt);
  const paidDate = Number.isNaN(paidAt.getTime())
    ? "غير محدد"
    : new Intl.DateTimeFormat("ar-EG", { dateStyle: "long", timeStyle: "short" }).format(paidAt);
  const markup = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال ${escapeHtml(receiptNumber)}</title><style>
    body{font-family:Tahoma,Arial,sans-serif;color:#26372c;margin:0;padding:36px}
    main{max-width:680px;margin:0 auto;border:1px solid #dfe7da;border-radius:16px;padding:32px}
    header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e8eee5;padding-bottom:18px}
    h1{font-size:24px;margin:0 0 6px}p{margin:5px 0;color:#657369}.receipt-no{direction:ltr}
    dl{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin:24px 0}
    dt{font-size:12px;color:#7c897f}dd{margin:5px 0 0;font-weight:700}
    .amount{padding:18px;border-radius:12px;background:#f2f7ed;text-align:center}
    .amount strong{display:block;color:#315a3b;font-size:26px;margin-top:8px}
    footer{margin-top:30px;text-align:center;color:#8a968c;font-size:12px}
    @media print{body{padding:0}main{border:0}}
  </style></head><body><main><header><div><h1>Vota Travel</h1><p>إيصال استلام دفعة اشتراك</p></div><p class="receipt-no">${escapeHtml(receiptNumber)}</p></header>
  <dl><div><dt>اسم الطالب</dt><dd>${escapeHtml(student.name)}</dd></div><div><dt>كود الطالب</dt><dd dir="ltr">${escapeHtml(studentUsername(student.id))}</dd></div>
  <div><dt>الترم</dt><dd>${escapeHtml(`${subscription.termName} — ${subscription.academicYear}`)}</dd></div><div><dt>تاريخ الدفع</dt><dd>${escapeHtml(paidDate)}</dd></div>
  <div><dt>طريقة الدفع</dt><dd>${escapeHtml(methodLabels[payment.method] || "أخرى")}</dd></div><div><dt>رقم الهاتف</dt><dd dir="ltr">${escapeHtml(student.phone)}</dd></div></dl>
  <section class="amount">المبلغ المستلم<strong>${escapeHtml(new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(payment.amountCents / 100))} ج.م</strong></section>
  <footer>شكرًا لاختياركم Vota Travel</footer></main></body></html>`;
  printWindow.document.open();
  printWindow.document.write(markup);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
}

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = window.crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function readStudentRecords() {
  const stored = window.localStorage.getItem(studentRecordsKey);
  if (stored === null) return [];
  const students = JSON.parse(stored);
  if (!Array.isArray(students) || !students.every(
    (student) => student && Number.isSafeInteger(student.id) && student.id > 0
  )) {
    throw new TypeError("Saved student data has an invalid format.");
  }
  return students;
}

function isTripRequest(record) {
  const date = typeof record?.tripDate === "string"
    ? new Date(`${record.tripDate}T00:00:00.000Z`)
    : null;
  const [hours, minutes] = typeof record?.tripTime === "string"
    ? record.tripTime.split(":").map(Number)
    : [];
  return (
    record !== null &&
    typeof record === "object" &&
    Number.isSafeInteger(record.id) &&
    record.id > 0 &&
    Number.isSafeInteger(record.studentId) &&
    record.studentId > 0 &&
    typeof record.studentName === "string" &&
    ["round-trip", "to-university", "from-university", "additional", "outbound", "return"].includes(record.tripType) &&
    date !== null &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === record.tripDate &&
    Number.isInteger(hours) &&
    hours >= 0 &&
    hours < 24 &&
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes < 60 &&
    typeof record.destination === "string" &&
    typeof record.notes === "string" &&
    typeof record.createdAt === "string" &&
    !Number.isNaN(Date.parse(record.createdAt)) &&
    (record.pickup === undefined || typeof record.pickup === "string") &&
    (record.scheduleId === undefined ||
      Number.isSafeInteger(record.scheduleId) && record.scheduleId > 0) &&
    ["pending", "approved", "rejected", "cancelled"].includes(record.status)
  );
}

function readTripRequests() {
  const stored = window.localStorage.getItem(tripRequestsKey);
  if (stored === null) return [];
  const records = JSON.parse(stored);
  if (!Array.isArray(records) || !records.every(isTripRequest)) {
    throw new TypeError("Saved trip request data has an invalid format.");
  }
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new TypeError("Saved trip request data contains duplicate IDs.");
  }
  return records;
}

function initializeTripScheduleManager() {
  const manager = document.querySelector(".settings-trip-schedule-manager");
  if (!manager) return;

  const form = document.querySelector("#trip-schedule-form");
  const rows = document.querySelector("#admin-trip-schedule-rows");
  const empty = document.querySelector("#admin-trip-schedules-empty");
  const error = document.querySelector("#trip-schedule-error");
  const accessError = document.querySelector("#trip-schedule-access-error");
  const submitButton = document.querySelector("#save-trip-schedule");
  const cancelEditButton = document.querySelector("#cancel-trip-schedule-edit");

  if (window.sessionStorage.getItem("vota-travel.admin-session") !== "active") {
    accessError.textContent = "سجّل دخولك للإدارة لتعديل مواعيد الرحلات.";
    accessError.hidden = false;
    form.hidden = true;
    rows.closest(".trip-schedule-table-wrap").hidden = true;
    return;
  }

  function renderSchedules(schedules) {
    rows.replaceChildren();
    for (const schedule of [...schedules].sort((first, second) =>
      first.direction.localeCompare(second.direction) || first.time.localeCompare(second.time)
    )) {
      const row = document.createElement("tr");
      const directionCell = document.createElement("td");
      directionCell.textContent = tripDirectionLabels[schedule.direction];
      const timeCell = document.createElement("td");
      timeCell.textContent = formatTripTime(schedule.time);
      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `trip-schedule-status${schedule.active ? " is-active" : ""}`;
      status.textContent = schedule.active ? "نشط" : "متوقف";
      statusCell.append(status);
      const actions = document.createElement("td");
      actions.className = "trip-admin-actions";
      actions.append(
        createScheduleAction(schedule.id, "edit", "تعديل"),
        createScheduleAction(schedule.id, "toggle", schedule.active ? "إيقاف" : "تفعيل"),
        createScheduleAction(schedule.id, "delete", "حذف")
      );
      row.append(directionCell, timeCell, statusCell, actions);
      rows.append(row);
    }
    empty.hidden = schedules.length > 0;
  }

  function createScheduleAction(id, action, label) {
    const button = document.createElement("button");
    button.className = "student-action";
    button.type = "button";
    button.dataset.scheduleId = String(id);
    button.dataset.scheduleAction = action;
    button.textContent = label;
    return button;
  }

  function render() {
    try {
      renderSchedules(readTripSchedules());
      error.hidden = true;
    } catch (renderError) {
      console.error("Unable to load trip schedules in settings.", renderError);
      error.textContent = "تعذر تحميل مواعيد الرحلات. تحقق من بيانات المواعيد.";
      error.hidden = false;
      rows.replaceChildren();
      empty.hidden = false;
    }
  }

  function resetForm() {
    form.reset();
    form.elements.scheduleId.value = "";
    submitButton.textContent = "إضافة الموعد";
    cancelEditButton.hidden = true;
    error.textContent = "";
    error.hidden = true;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    error.textContent = "";
    error.hidden = true;
    if (!form.reportValidity()) return;

    try {
      const schedules = readTripSchedules();
      const editingId = Number(form.elements.scheduleId.value);
      const direction = form.elements.direction.value;
      const time = form.elements.time.value;
      const duplicate = schedules.some((schedule) =>
        schedule.id !== editingId && schedule.direction === direction && schedule.time === time
      );
      if (duplicate) {
        error.textContent = "هذا الموعد مضاف بالفعل لنفس اتجاه الرحلة.";
        error.hidden = false;
        return;
      }

      const current = schedules.find((schedule) => schedule.id === editingId);
      const schedule = {
        id: current?.id ||
          schedules.reduce((largestId, item) => Math.max(largestId, item.id), 0) + 1,
        direction,
        time,
        active: current?.active ?? true,
      };
      const updatedSchedules = current
        ? schedules.map((item) => item.id === current.id ? schedule : item)
        : [...schedules, schedule];
      window.localStorage.setItem(tripSchedulesKey, JSON.stringify(updatedSchedules));
      resetForm();
      render();
    } catch (saveError) {
      console.error("Unable to save trip schedule.", saveError);
      error.textContent = "تعذر حفظ الموعد. تحقق من بيانات المواعيد وحاول مرة أخرى.";
      error.hidden = false;
    }
  });

  cancelEditButton.addEventListener("click", resetForm);
  rows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-schedule-id]");
    if (!button) return;
    const scheduleId = Number(button.dataset.scheduleId);
    const action = button.dataset.scheduleAction;
    try {
      const schedules = readTripSchedules();
      const target = schedules.find((schedule) => schedule.id === scheduleId);
      if (!target) return;
      if (action === "edit") {
        form.elements.scheduleId.value = String(target.id);
        form.elements.direction.value = target.direction;
        form.elements.time.value = target.time;
        submitButton.textContent = "حفظ التعديل";
        cancelEditButton.hidden = false;
        error.textContent = "";
        error.hidden = true;
        form.elements.direction.focus();
        return;
      }
      if (action === "delete" && !window.confirm("هل تريد حذف هذا الموعد؟")) return;
      const updatedSchedules = action === "toggle"
        ? schedules.map((schedule) => schedule.id === scheduleId
          ? { ...schedule, active: !schedule.active }
          : schedule)
        : schedules.filter((schedule) => schedule.id !== scheduleId);
      window.localStorage.setItem(tripSchedulesKey, JSON.stringify(updatedSchedules));
      if (Number(form.elements.scheduleId.value) === scheduleId) resetForm();
      render();
    } catch (updateError) {
      console.error("Unable to update trip schedule.", updateError);
      error.textContent = "تعذر تحديث الموعد.";
      error.hidden = false;
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === tripSchedulesKey) render();
  });
  render();
}

function initializeTripAdmin() {
  const page = document.querySelector(".trips-page");
  if (!page) return;

  const error = document.querySelector("#admin-trips-error");
  const dateInput = document.querySelector("#admin-trip-date");
  const scheduleList = document.querySelector("#admin-trip-schedules");
  const scheduleEmpty = document.querySelector("#admin-trip-schedules-empty");
  const directionButtons = [...document.querySelectorAll("[data-admin-direction]")];
  const manifest = document.querySelector("#admin-trip-manifest");
  const manifestTitle = document.querySelector("#trip-manifest-title");
  const manifestDate = document.querySelector("#trip-manifest-date");
  const pickupInput = document.querySelector("#admin-trip-pickup");
  const searchInput = document.querySelector("#admin-trip-search");
  const studentTable = document.querySelector("#admin-trip-table");
  const studentRows = document.querySelector("#admin-trip-students");
  const studentsEmpty = document.querySelector("#admin-trip-students-empty");
  let selectedDirection = "outbound";
  let selectedScheduleKey = "";

  if (window.sessionStorage.getItem("vota-travel.admin-session") !== "active") {
    error.textContent = "سجّل دخولك للإدارة لعرض مواعيد الرحلات.";
    error.hidden = false;
    scheduleList.hidden = true;
    return;
  }

  dateInput.value = localDateString();

  function pickupFor(request, student) {
    return request.pickup || student?.pickup || "منطقة غير محددة";
  }

  function render() {
    try {
      const students = readStudentRecords();
      const requests = readTripRequests();
      const schedules = readTripSchedules();
      const studentById = new Map(students.map((student) => [student.id, student]));
      const selectedDate = dateInput.value;
      const dateRequests = requests.filter((request) => request.tripDate === selectedDate);
      const activeRequests = dateRequests.filter((request) =>
        ["pending", "approved"].includes(request.status)
      );
      const outboundRequests = activeRequests.filter((request) => request.tripType === "outbound");
      const returnRequests = activeRequests.filter((request) => request.tripType === "return");

      document.querySelector("#trip-total-count").textContent = arabicNumber(activeRequests.length);
      document.querySelector("#trip-outbound-count").textContent = arabicNumber(outboundRequests.length);
      document.querySelector("#trip-return-count").textContent = arabicNumber(returnRequests.length);
      const pickupAreas = new Set(activeRequests.map((request) =>
        pickupFor(request, studentById.get(request.studentId))
      ));
      document.querySelector("#trip-pickup-area-count").textContent = arabicNumber(pickupAreas.size);

      for (const button of directionButtons) {
        const isSelected = button.dataset.adminDirection === selectedDirection;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      }

      const groups = new Map();
      for (const schedule of schedules) {
        if (schedule.direction !== selectedDirection || !schedule.active) continue;
        const key = `${schedule.direction}|${schedule.time}`;
        if (!groups.has(key)) {
          groups.set(key, { key, direction: schedule.direction, time: schedule.time, requests: [] });
        }
      }
      for (const request of activeRequests) {
        if (request.tripType !== selectedDirection) continue;
        const key = `${request.tripType}|${request.tripTime}`;
        if (!groups.has(key)) {
          groups.set(key, { key, direction: request.tripType, time: request.tripTime, requests: [] });
        }
        groups.get(key).requests.push(request);
      }

      const sortedGroups = [...groups.values()].sort((first, second) =>
        first.time.localeCompare(second.time)
      );
      scheduleList.replaceChildren();
      for (const group of sortedGroups) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "trip-admin-time-card";
        card.dataset.scheduleKey = group.key;
        card.setAttribute("aria-expanded", String(group.key === selectedScheduleKey));

        const icon = document.createElement("span");
        icon.className = "trip-admin-time-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = group.direction === "outbound" ? "↗" : "↙";
        const details = document.createElement("span");
        details.className = "trip-admin-time-details";
        const direction = document.createElement("small");
        direction.textContent = tripDirectionLabels[group.direction];
        const time = document.createElement("strong");
        time.textContent = formatTripTime(group.time);
        details.append(direction, time);
        const count = document.createElement("span");
        count.className = "trip-admin-time-count";
        const countValue = document.createElement("strong");
        countValue.textContent = arabicNumber(group.requests.length);
        const countLabel = document.createElement("small");
        countLabel.textContent = "مسجل";
        count.append(countValue, countLabel);
        const arrow = document.createElement("span");
        arrow.className = "trip-admin-time-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "←";
        card.append(icon, details, count, arrow);
        scheduleList.append(card);
      }
      scheduleEmpty.hidden = sortedGroups.length > 0;
      scheduleList.hidden = sortedGroups.length === 0;

      const selectedGroup = groups.get(selectedScheduleKey);
      if (!selectedGroup) {
        selectedScheduleKey = "";
        manifest.hidden = true;
        error.hidden = true;
        return;
      }

      manifest.hidden = false;
      manifestTitle.textContent = `${tripDirectionLabels[selectedGroup.direction]} — ${formatTripTime(selectedGroup.time)}`;
      manifestDate.textContent = formatLocalDate(selectedDate);
      const selectedPickup = pickupInput.value;
      const areas = new Map();
      for (const request of selectedGroup.requests) {
        const area = pickupFor(request, studentById.get(request.studentId));
        areas.set(area, (areas.get(area) || 0) + 1);
      }
      pickupInput.replaceChildren(new Option("كل المناطق", ""));
      for (const [area, count] of [...areas.entries()].sort((first, second) =>
        first[0].localeCompare(second[0], "ar")
      )) {
        pickupInput.add(new Option(`${area} (${arabicNumber(count)})`, area));
      }
      pickupInput.value = areas.has(selectedPickup) ? selectedPickup : "";

      const search = searchInput.value.trim().toLocaleLowerCase("ar");
      const visibleRequests = selectedGroup.requests.filter((request) => {
        const student = studentById.get(request.studentId);
        const pickup = pickupFor(request, student);
        const searchable = [
          request.studentName,
          student ? studentUsername(student.id) : "",
          student?.phone,
          student?.emergencyPhone,
          student?.university,
          student?.faculty,
          pickup,
        ].filter(Boolean).join(" ").toLocaleLowerCase("ar");
        return (!pickupInput.value || pickup === pickupInput.value) &&
          (!search || searchable.includes(search));
      }).sort((first, second) =>
        (first.studentName || studentById.get(first.studentId)?.name || "")
          .localeCompare(second.studentName || studentById.get(second.studentId)?.name || "", "ar")
      );

      studentRows.replaceChildren();
      for (const request of visibleRequests) {
        const student = studentById.get(request.studentId);
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.textContent = request.studentName || student?.name || "—";
        const codeCell = document.createElement("td");
        codeCell.textContent = student ? studentUsername(student.id) : "—";
        const pickupCell = document.createElement("td");
        pickupCell.textContent = pickupFor(request, student);
        const phoneCell = document.createElement("td");
        phoneCell.textContent = student?.phone || "—";
        phoneCell.dir = "ltr";
        const schoolCell = document.createElement("td");
        schoolCell.textContent = [student?.university, student?.faculty].filter(Boolean).join(" / ") || "—";
        const actionsCell = document.createElement("td");
        actionsCell.className = "trip-admin-actions";
        actionsCell.append(createTripAction(request.id, "cancelled", "إلغاء التسجيل"));
        if (student) {
          const profileLink = document.createElement("a");
          profileLink.className = "student-action";
          profileLink.href = `student.html?id=${encodeURIComponent(student.id)}`;
          profileLink.textContent = "ملف الطالب";
          actionsCell.append(profileLink);
        }
        row.append(nameCell, codeCell, pickupCell, phoneCell, schoolCell, actionsCell);
        studentRows.append(row);
      }
      document.querySelector("#admin-trip-manifest-count").textContent =
        `${arabicNumber(visibleRequests.length)} من ${arabicNumber(selectedGroup.requests.length)} طالب`;
      studentTable.hidden = visibleRequests.length === 0;
      studentsEmpty.hidden = visibleRequests.length > 0;
      error.hidden = true;
    } catch (renderError) {
      console.error("Unable to load daily trip roster.", renderError);
      error.textContent = "تعذر تحميل بيانات الرحلات. تحقق من سلامة بيانات الطلاب والحجوزات.";
      error.hidden = false;
      manifest.hidden = true;
      scheduleList.hidden = true;
      scheduleEmpty.hidden = true;
    }
  }

  function createTripAction(id, status, label) {
    const button = document.createElement("button");
    button.className = "student-action";
    button.type = "button";
    button.dataset.tripId = String(id);
    button.dataset.tripStatus = status;
    button.textContent = label;
    return button;
  }

  for (const button of directionButtons) {
    button.addEventListener("click", () => {
      selectedDirection = button.dataset.adminDirection;
      selectedScheduleKey = "";
      pickupInput.value = "";
      searchInput.value = "";
      render();
    });
  }
  dateInput.addEventListener("change", () => {
    selectedScheduleKey = "";
    pickupInput.value = "";
    searchInput.value = "";
    render();
  });
  scheduleList.addEventListener("click", (event) => {
    const card = event.target.closest("button[data-schedule-key]");
    if (!card) return;
    selectedScheduleKey = card.dataset.scheduleKey;
    pickupInput.value = "";
    searchInput.value = "";
    render();
    manifest.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#admin-trip-back").addEventListener("click", () => {
    selectedScheduleKey = "";
    render();
    scheduleList.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  pickupInput.addEventListener("change", render);
  searchInput.addEventListener("input", render);
  studentRows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trip-id]");
    if (!button) return;
    const tripId = Number(button.dataset.tripId);
    const nextStatus = button.dataset.tripStatus;
    try {
      const requests = readTripRequests();
      const target = requests.find((request) => request.id === tripId);
      const validTransition = ["pending", "approved"].includes(target?.status) &&
        nextStatus === "cancelled";
      if (!validTransition) return;
      const updatedRequests = requests.map((request) =>
        request.id === tripId ? { ...request, status: nextStatus } : request
      );
      window.localStorage.setItem(tripRequestsKey, JSON.stringify(updatedRequests));
      render();
    } catch (updateError) {
      console.error("Unable to cancel trip booking.", updateError);
      error.textContent = "تعذر إلغاء تسجيل الرحلة.";
      error.hidden = false;
    }
  });
  document.querySelector("#print-trip-manifest").addEventListener("click", () => window.print());
  window.addEventListener("storage", (event) => {
    if ([tripRequestsKey, tripSchedulesKey, studentRecordsKey].includes(event.key)) render();
  });
  render();
}
function initializeStudentPortal() {
  const page = document.querySelector("#student-portal");
  if (!page) return;

  const message = document.querySelector("#portal-message");
  const passwordForm = document.querySelector("#portal-password-form");
  const passwordSection = document.querySelector("#portal-password-section");
  const profileSection = document.querySelector("#portal-profile");
  const passwordError = document.querySelector("#portal-password-error");
  const sectionName = page.dataset.portalSection;
  let refreshTripAvailability = () => {};
  let session;
  try {
    session = JSON.parse(
      window.sessionStorage.getItem("vota-travel.portal-session") || "null"
    );
  } catch (error) {
    console.error("Unable to read the student portal session.", error);
    message.textContent = "تعذر التحقق من تسجيل الدخول. سجّل الدخول مرة أخرى.";
    message.hidden = false;
    return;
  }
  if (!session || !Number.isSafeInteger(session.studentId)) {
    message.textContent = "سجّل دخولك بحساب الطالب لعرض ملفك.";
    message.hidden = false;
    return;
  }

  let students;
  try {
    students = readStudentRecords();
  } catch (error) {
    console.error("Unable to load the student portal profile.", error);
    message.textContent = "تعذر تحميل بيانات الحساب.";
    message.hidden = false;
    return;
  }
  const student = students.find((record) => record.id === session.studentId);
  if (!student || student.archivedAt) {
    window.sessionStorage.removeItem("vota-travel.portal-session");
    message.textContent = "الحساب غير متاح. سجّل الدخول مرة أخرى.";
    message.hidden = false;
    return;
  }

  const formatMoney = (cents) =>
    `${new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)} ج.م`;
  function setText(id, value) {
    const element = document.querySelector(`#${id}`);
    if (element) element.textContent = value || "—";
  }

  function updateHome() {
    setText("portal-student-name", student.name);
  }

  function updatePersonal() {
    const values = {
      "portal-student-name": student.name,
      "portal-student-code": studentUsername(student.id),
      "portal-phone": student.phone,
      "portal-pickup": student.pickup,
      "portal-university": student.university,
      "portal-faculty": student.faculty,
      "portal-study-year": student.studyYear,
      "portal-emergency-phone": student.emergencyPhone,
    };
    for (const [id, value] of Object.entries(values)) setText(id, value);
  }

  function updateSubscription() {
    let subscriptionRecords;
    try {
      subscriptionRecords = JSON.parse(
        window.localStorage.getItem("vota-travel.subscriptions.v1") || "[]"
      );
      if (!Array.isArray(subscriptionRecords)) {
        throw new TypeError("Saved subscription data has an invalid format.");
      }
    } catch (error) {
      console.error("Unable to load student subscription details.", error);
      message.textContent = "تعذر تحميل بيانات الاشتراك.";
      message.hidden = false;
      return;
    }
    const subscriptions = subscriptionRecords.filter(
      (record) => record.studentId === student.id
    );
    const currentSubscription = subscriptions.find(
      (record) => record.termId === student.termId
    );
    const paidTotal = currentSubscription
      ? currentSubscription.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
      : 0;
    setText("portal-student-name", student.name);
    setText("portal-term", currentSubscription
      ? `${currentSubscription.termName} — ${currentSubscription.academicYear}`
      : "لا يوجد اشتراك مسجل");
    setText("portal-price", currentSubscription ? formatMoney(currentSubscription.priceCents) : "—");
    setText("portal-payment-status", !currentSubscription || paidTotal === 0
      ? "غير مدفوع"
      : paidTotal >= currentSubscription.priceCents
        ? "مدفوع بالكامل"
        : "مدفوع جزئيًا");
    setText("portal-paid", currentSubscription ? formatMoney(paidTotal) : "—");
    setText("portal-remaining", currentSubscription
      ? formatMoney(Math.max(0, currentSubscription.priceCents - paidTotal))
      : "—");

    const history = document.querySelector("#portal-payment-history");
    if (!history) return;
    history.replaceChildren();
    let paymentCount = 0;
    for (const subscription of subscriptions) {
      for (const payment of subscription.payments) {
        paymentCount++;
        const item = document.createElement("li");
        const date = new Date(payment.paidAt);
        const readableDate = Number.isNaN(date.getTime())
          ? "تاريخ غير متاح"
          : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
        item.textContent =
          `${subscription.termName}: ${formatMoney(payment.amountCents)} — ${readableDate}`;
        history.append(item);
      }
    }
    const empty = document.querySelector("#portal-no-payments");
    if (empty) empty.hidden = paymentCount > 0;
  }

  function updateTripPage() {
    setText("trip-pickup-location", student.pickup);
    const cards = document.querySelector("#trip-schedule-cards");
    if (!cards) return;
    const empty = document.querySelector("#trip-schedules-empty");
    const successMessage = document.querySelector("#trip-booking-success");
    const errorMessage = document.querySelector("#trip-request-error");
    const directionButtons = [...document.querySelectorAll("[data-trip-direction]")];
    let selectedDirection = "outbound";
    cards.hidden = true;
    empty.hidden = true;
    for (const button of directionButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.tripDirection === selectedDirection)
      );
    }

    function showBookingError(text) {
      errorMessage.textContent = text;
      errorMessage.hidden = false;
      successMessage.hidden = true;
    }

    function updateAvailableTimes() {
      try {
        const schedules = selectedDirection
          ? readTripSchedules()
            .filter((schedule) => schedule.active)
            .filter((schedule) => schedule.direction === selectedDirection)
            .sort((first, second) => first.time.localeCompare(second.time))
          : [];
        const requests = readTripRequests();
        const tripDate = localDateString();
        const eligible = isStudentEligibleForTrips(student, tripDate);
        const activeRequests = requests.filter((request) =>
          request.studentId === student.id &&
          request.tripDate === tripDate &&
          ["pending", "approved"].includes(request.status)
        );
        cards.replaceChildren();
        cards.hidden = !selectedDirection;
        for (const schedule of schedules) {
          const existing = activeRequests.find((request) =>
            request.tripType === schedule.direction &&
            request.tripTime === schedule.time
          );
          const directionRegistration = activeRequests.find((request) =>
            request.tripType === schedule.direction
          );
          const registeredElsewhere = directionRegistration && !existing;
          const card = document.createElement("article");
          card.className = "trip-schedule-card";
          const top = document.createElement("div");
          top.className = "trip-schedule-card-top";
          const direction = document.createElement("span");
          direction.className = `trip-direction-badge trip-direction-${schedule.direction}`;
          direction.textContent = tripDirectionLabels[schedule.direction];
          const cardStatus = document.createElement("span");
          cardStatus.className = `trip-card-status${existing ? " is-registered" : eligible && !registeredElsewhere ? "" : " is-unavailable"}`;
          cardStatus.textContent = existing
            ? "مسجل"
            : registeredElsewhere
              ? "لديك تسجيل اليوم"
              : eligible
                ? "متاح للتسجيل"
                : "غير متاح";
          top.append(direction, cardStatus);

          const timeBlock = document.createElement("div");
          timeBlock.className = "trip-schedule-card-time-block";
          const time = document.createElement("strong");
          time.className = "trip-schedule-card-time";
          time.textContent = formatTripTime(schedule.time);
          const timeCaption = document.createElement("span");
          timeCaption.className = "trip-schedule-card-caption";
          timeCaption.textContent = "موعد الرحلة";
          timeBlock.append(time, timeCaption);

          const details = document.createElement("div");
          details.className = "trip-schedule-card-details";
          const date = document.createElement("span");
          date.className = "trip-schedule-card-date";
          date.textContent = formatTripCardDate(tripDate);
          details.append(date);

          const action = document.createElement("div");
          action.className = "trip-schedule-card-action";
          if (existing) {
            const cancelButton = document.createElement("button");
            cancelButton.className = "secondary-button trip-cancel-registration";
            cancelButton.type = "button";
            cancelButton.textContent = "مسجل — إلغاء التسجيل";
            cancelButton.addEventListener("click", () => cancelTrip(existing.id));
            action.append(cancelButton);
          } else if (registeredElsewhere) {
            const unavailable = document.createElement("span");
            unavailable.className = "trip-card-state";
            unavailable.textContent = "لا يمكنك التسجيل في موعد آخر اليوم";
            action.append(unavailable);
          } else if (!eligible) {
            const unavailable = document.createElement("span");
            unavailable.className = "trip-card-state";
            unavailable.textContent = "الاشتراك غير مؤهل للتسجيل";
            action.append(unavailable);
          } else {
            const button = document.createElement("button");
            button.className = "primary-button";
            button.type = "button";
            button.textContent = "تسجيل";
            button.addEventListener("click", () => bookSchedule(schedule.id));
            action.append(button);
          }
          card.append(top, timeBlock, details, action);
          cards.append(card);
        }
        empty.hidden = !selectedDirection || schedules.length > 0;
        empty.textContent = selectedDirection
          ? "لا توجد مواعيد مضافة لهذا الاتجاه حاليًا."
          : "لا توجد مواعيد رحلات متاحة حاليًا.";
        errorMessage.hidden = true;
      } catch (scheduleError) {
        console.error("Unable to load trip schedules.", scheduleError);
        cards.replaceChildren();
        empty.hidden = true;
        cards.hidden = !selectedDirection;
        showBookingError("تعذر تحميل مواعيد الرحلات. أعد تحميل الصفحة أو تواصل مع الإدارة.");
      }
    }

    async function bookSchedule(scheduleId) {
      try {
        const tripDate = localDateString();
        const schedule = readTripSchedules().find((item) =>
          item.id === scheduleId && item.active && item.direction === selectedDirection
        );
        if (!schedule) {
          showBookingError("هذا الموعد لم يعد متاحًا. حدّث الصفحة واختر موعدًا آخر.");
          updateAvailableTimes();
          return;
        }
        if (!isStudentEligibleForTrips(student, tripDate)) {
          showBookingError("التسجيل متاح للطلاب النشطين خلال فترة اشتراكهم فقط.");
          updateAvailableTimes();
          return;
        }
        const requests = readTripRequests();
        const directionRegistration = requests.find((request) =>
          request.studentId === student.id &&
          request.tripDate === tripDate &&
          request.tripType === schedule.direction &&
          ["pending", "approved"].includes(request.status)
        );
        if (directionRegistration) {
          updateAvailableTimes();
          showBookingError(
            directionRegistration.tripTime === schedule.time
              ? "أنت مسجل بالفعل في هذا الموعد."
              : `لديك تسجيل ${tripDirectionLabels[schedule.direction]} اليوم. ألغِ التسجيل الحالي أولًا.`
          );
          return;
        }

        await window.votaData.updateStudentTrip("book", schedule.id, tripDate);
        errorMessage.hidden = true;
        successMessage.textContent = "تم تسجيلك في الرحلة فورًا.";
        successMessage.hidden = false;
        updateAvailableTimes();
      } catch (bookingError) {
        console.error("Unable to register for the trip.", bookingError);
        showBookingError("تعذر تسجيلك في الرحلة. حاول مرة أخرى.");
      }
    }

    async function cancelTrip(requestId) {
      try {
        const requests = readTripRequests();
        const target = requests.find((request) =>
          request.id === requestId &&
          request.studentId === student.id &&
          ["pending", "approved"].includes(request.status)
        );
        if (!target) {
          showBookingError("تعذر العثور على تسجيل نشط لهذا الموعد.");
          updateAvailableTimes();
          return;
        }
        await window.votaData.updateStudentTrip("cancel", null, null, requestId);
        errorMessage.hidden = true;
        successMessage.textContent = "تم إلغاء تسجيلك في الرحلة.";
        successMessage.hidden = false;
        updateAvailableTimes();
      } catch (cancelError) {
        console.error("Unable to cancel the trip registration.", cancelError);
        showBookingError("تعذر إلغاء التسجيل. حاول مرة أخرى.");
      }
    }

    refreshTripAvailability = updateAvailableTimes;
    for (const button of directionButtons) {
      button.addEventListener("click", () => {
        selectedDirection = button.dataset.tripDirection;
        for (const directionButton of directionButtons) {
          directionButton.setAttribute(
            "aria-pressed",
            String(directionButton === button)
          );
        }
        errorMessage.hidden = true;
        successMessage.hidden = true;
        updateAvailableTimes();
      });
    }
    updateAvailableTimes();
  }

  const needsPasswordChange = Boolean(student.mustChangePassword);
  passwordSection.hidden = !needsPasswordChange;
  profileSection.hidden = needsPasswordChange;
  if (!needsPasswordChange) {
    if (sectionName === "home") updateHome();
    if (sectionName === "personal") updatePersonal();
    if (sectionName === "subscription") updateSubscription();
    if (sectionName === "trips") updateTripPage();
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    passwordError.textContent = "";
    if (!passwordForm.reportValidity()) return;
    const password = passwordForm.elements.newPassword.value;
    if (password.length < 10) {
      passwordError.textContent = "كلمة المرور لازم تكون 10 أحرف على الأقل.";
      return;
    }
    if (password !== passwordForm.elements.confirmPassword.value) {
      passwordError.textContent = "تأكيد كلمة المرور غير مطابق.";
      return;
    }

    try {
      const updatedData = await window.votaData.completePasswordChange(password);
      Object.assign(student, updatedData.student);
      passwordSection.hidden = true;
      profileSection.hidden = false;
      if (sectionName === "home") updateHome();
      if (sectionName === "personal") updatePersonal();
      if (sectionName === "subscription") updateSubscription();
      if (sectionName === "trips") updateTripPage();
    } catch (error) {
      console.error("Unable to update the student portal password.", error);
      passwordError.textContent = "تعذر حفظ كلمة المرور. حاول مرة أخرى.";
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === tripRequestsKey && sectionName === "trips") refreshTripAvailability();
    if (event.key === tripSchedulesKey && sectionName === "trips") refreshTripAvailability();
    if (event.key === "vota-travel.subscriptions.v1" && sectionName === "subscription") {
      updateSubscription();
    }
    if (event.key === "vota-travel.subscriptions.v1" && sectionName === "trips") {
      refreshTripAvailability();
    }
    if (event.key === studentRecordsKey) {
      try {
        const updatedStudent = readStudentRecords().find((record) => record.id === student.id);
        if (!updatedStudent || updatedStudent.archivedAt) {
          window.sessionStorage.removeItem("vota-travel.portal-session");
          window.location.assign("lojin.html");
          return;
        }
        Object.assign(student, updatedStudent);
        if (sectionName === "home") updateHome();
        if (sectionName === "personal") updatePersonal();
        if (sectionName === "trips") {
          setText("trip-pickup-location", student.pickup);
          refreshTripAvailability();
        }
      } catch (error) {
        console.error("Unable to refresh student portal data.", error);
      }
    }
  });
}

function initializeStudentFile() {
  const profile = document.querySelector("#student-profile");
  if (!profile) return;
  const message = document.querySelector("#student-profile-message");
  if (window.sessionStorage.getItem("vota-travel.admin-session") !== "active") {
    message.textContent = "سجّل دخولك للإدارة لعرض ملف الطالب.";
    message.hidden = false;
    return;
  }

  const studentId = Number(new URLSearchParams(window.location.search).get("id"));
  if (!Number.isSafeInteger(studentId) || studentId < 1) {
    message.textContent = "رابط ملف الطالب غير صحيح.";
    message.hidden = false;
    return;
  }

  try {
    const students = readStudentRecords();
    const student = students.find((record) => record.id === studentId);
    if (!student) {
      message.textContent = "لم يتم العثور على الطالب.";
      message.hidden = false;
      return;
    }
    const subscriptions = JSON.parse(
      window.localStorage.getItem("vota-travel.subscriptions.v1") || "[]"
    );
    const terms = JSON.parse(window.localStorage.getItem("vota-travel.terms.v1") || "[]");
    if (!Array.isArray(subscriptions)) {
      throw new TypeError("Saved subscription data has an invalid format.");
    }
    if (!Array.isArray(terms)) {
      throw new TypeError("Saved term data has an invalid format.");
    }

    const studentSubscriptions = subscriptions.filter(
      (record) => record.studentId === student.id
    );
    const tripRequests = readTripRequests()
      .filter((record) => record.studentId === student.id)
      .sort((first, second) =>
        `${second.tripDate}T${second.tripTime}`.localeCompare(`${first.tripDate}T${first.tripTime}`)
      );
    const statusLabels = {
      active: "نشط",
      pending: "بانتظار التفعيل",
      inactive: "موقوف",
      paused: "متوقف مؤقتًا",
      withdrawn: "منسحب",
      expired: "منتهي الاشتراك",
    };
    const currentSubscription = studentSubscriptions.find(
      (record) => record.termId === student.termId
    );
    const currentTerm = terms.find((record) => record.id === student.termId);
    const effectiveStudentStatus = ["active", "pending"].includes(student.subscription) &&
      currentSubscription?.endDate && currentSubscription.endDate < localDateString()
      ? "expired"
      : student.subscription;
    const dateTimeLabel = (value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? "غير محدد"
        : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
    };
    const textValues = {
      "profile-name": student.name,
      "profile-code": studentUsername(student.id),
      "profile-phone": student.phone,
      "profile-pickup": student.pickup,
      "profile-university": student.university,
      "profile-faculty": student.faculty,
      "profile-study-year": student.studyYear,
      "profile-emergency-phone": student.emergencyPhone,
      "profile-status": statusLabels[effectiveStudentStatus] || "—",
      "profile-account-status": student.archivedAt
        ? "مؤرشف — دخول البوابة موقوف"
        : !student.authUserId
          ? "لم يتم إنشاء حساب"
          : student.mustChangePassword
            ? "بانتظار تغيير كلمة المرور"
            : "مفعّل",
      "profile-notes": student.notes || "لا توجد ملاحظات.",
      "profile-created-at": dateTimeLabel(student.createdAt),
      "profile-updated-at": dateTimeLabel(student.updatedAt || student.createdAt),
      "profile-subscription-start": formatLocalDate(currentSubscription?.startDate || currentTerm?.startDate),
      "profile-subscription-end": formatLocalDate(currentSubscription?.endDate || currentTerm?.endDate),
    };
    for (const [id, value] of Object.entries(textValues)) {
      document.querySelector(`#${id}`).textContent = value || "—";
    }
    document.querySelector("#profile-edit").href =
      `students.html?edit=${encodeURIComponent(student.id)}`;

    const formatMoney = (cents) =>
      `${new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2 }).format(cents / 100)} ج.م`;
    const rows = document.querySelector("#profile-subscription-rows");
    const paymentHistory = document.querySelector("#profile-payment-history");
    rows.replaceChildren();
    paymentHistory.replaceChildren();
    let paymentCount = 0;
    for (const subscription of studentSubscriptions) {
      const paid = subscription.payments.reduce(
        (sum, payment) => sum + payment.amountCents,
        0
      );
      const remaining = Math.max(0, subscription.priceCents - paid);
      const row = document.createElement("tr");
      const cells = [
        `${subscription.termName} — ${subscription.academicYear}`,
        formatLocalDate(subscription.startDate || terms.find((term) => term.id === subscription.termId)?.startDate),
        formatLocalDate(subscription.endDate || terms.find((term) => term.id === subscription.termId)?.endDate),
        formatMoney(subscription.priceCents),
        formatMoney(paid),
        formatMoney(remaining),
        subscription.payments.length
          ? dateTimeLabel(subscription.payments.at(-1).paidAt)
          : "لا توجد دفعات",
        subscription.payments.length
          ? ({ cash: "نقدي", transfer: "تحويل بنكي / محفظة", other: "أخرى" })[subscription.payments.at(-1).method] || "أخرى"
          : "—",
        remaining === 0 ? "مدفوع بالكامل" : paid ? "مدفوع جزئيًا" : "غير مدفوع",
      ];
      for (const value of cells) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      rows.append(row);
      for (const payment of subscription.payments) {
        paymentCount++;
        const item = document.createElement("li");
        const date = new Date(payment.paidAt);
        const readableDate = Number.isNaN(date.getTime())
          ? ""
          : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
        const method = ({ cash: "نقدي", transfer: "تحويل بنكي / محفظة", other: "أخرى" })[payment.method] || "أخرى";
        const details = document.createElement("span");
        details.textContent = `${formatMoney(payment.amountCents)} — ${readableDate || "تاريخ غير متاح"} — ${method}`;
        const receiptButton = document.createElement("button");
        receiptButton.className = "student-action";
        receiptButton.type = "button";
        receiptButton.textContent = "طباعة الإيصال";
        receiptButton.addEventListener("click", () => printReceipt(student, subscription, payment));
        item.append(details, receiptButton);
        paymentHistory.append(item);
      }
    }
    document.querySelector("#profile-no-subscriptions").hidden =
      studentSubscriptions.length > 0;
    document.querySelector("#profile-no-payments").hidden = paymentCount > 0;
    renderAdminTripRequests(tripRequests);
    profile.hidden = false;
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      window.setTimeout(() => window.print(), 0);
    }
  } catch (error) {
    console.error("Unable to load the student profile.", error);
    message.textContent = "تعذر تحميل ملف الطالب.";
    message.hidden = false;
  }

  function renderAdminTripRequests(requests) {
    const list = document.querySelector("#profile-trip-requests");
    const tripError = document.querySelector("#profile-trip-error");
    const statuses = {
      ...tripStatusLabels,
    };
    const types = {
      "round-trip": "ذهاب وعودة",
      "to-university": "ذهاب للجامعة",
      "from-university": "عودة من الجامعة",
      additional: "رحلة إضافية",
      ...tripDirectionLabels,
    };
    list.replaceChildren();
    for (const request of requests) {
      const item = document.createElement("article");
      item.className = "trip-request-item";
      const details = document.createElement("div");
      details.className = "trip-request-details";
      const title = document.createElement("strong");
      title.textContent = `${types[request.tripType] || "رحلة"} — ${request.pickup || request.destination}`;
      const time = document.createElement("span");
      time.textContent = `${formatLocalDate(request.tripDate)} — ${formatTripTime(request.tripTime)}`;
      details.append(title, time);
      if (request.notes) {
        const notes = document.createElement("span");
        notes.textContent = `ملاحظات: ${request.notes}`;
        details.append(notes);
      }
      const actions = document.createElement("div");
      actions.className = "profile-trip-actions";
      const status = document.createElement("span");
      status.className = `trip-status trip-status-${request.status}`;
      status.textContent = statuses[request.status] || "حالة غير معروفة";
      actions.append(status);
      if (request.status === "pending") {
        for (const [nextStatus, label] of [
          ["approved", "اعتماد"],
          ["rejected", "رفض"],
        ]) {
          const button = document.createElement("button");
          button.className = "student-action";
          button.type = "button";
          button.dataset.tripId = String(request.id);
          button.dataset.tripStatus = nextStatus;
          button.textContent = label;
          actions.append(button);
        }
      }
      item.append(details, actions);
      list.append(item);
    }
    document.querySelector("#profile-no-trips").hidden = requests.length > 0;
    tripError.hidden = true;
  }

  document.querySelector("#profile-trip-requests").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-trip-id]");
    if (!button) return;
    try {
      const requests = readTripRequests();
      const targetId = Number(button.dataset.tripId);
      const target = requests.find(
        (request) => request.id === targetId && request.studentId === studentId
      );
      const nextStatus = button.dataset.tripStatus;
      if (!target || target.status !== "pending" ||
          !["approved", "rejected"].includes(nextStatus)) return;
      const updatedRequests = requests.map((request) =>
        request.id === targetId
          ? { ...request, status: nextStatus }
          : request
      );
      window.localStorage.setItem(tripRequestsKey, JSON.stringify(updatedRequests));
      renderAdminTripRequests(updatedRequests.filter((request) => request.studentId === studentId));
    } catch (error) {
      console.error("Unable to update trip request status.", error);
      const tripError = document.querySelector("#profile-trip-error");
      tripError.textContent = "تعذر تحديث حالة طلب الرحلة.";
      tripError.hidden = false;
    }
  });
  document.querySelector("#print-student-file").addEventListener("click", () => window.print());
}

function initializeStudents() {
  const studentDialog = document.querySelector("#student-dialog");
  const studentForm = document.querySelector("#student-form");
  const studentRows = document.querySelector("#student-rows");
  const studentSearch = document.querySelector("#student-search");
  const studentStatusFilter = document.querySelector("#student-status-filter");
  const studentPaymentFilter = document.querySelector("#student-payment-filter");
  const studentTermFilter = document.querySelector("#student-term-filter");
  const studentSort = document.querySelector("#student-sort");
  const studentCount = document.querySelector("#student-count");
  const activeStudentCount = document.querySelector("#active-student-count");
  const archivedStudentCount = document.querySelector("#archived-student-count");
  const studentBalanceTotal = document.querySelector("#student-balance-total");
  const activeTabCount = document.querySelector("#active-tab-count");
  const archivedTabCount = document.querySelector("#archived-tab-count");
  const studentListCaption = document.querySelector("#student-list-caption");
  const emptyState = document.querySelector("#empty-state");
  const emptyTitle = document.querySelector("#empty-title");
  const emptyDescription = document.querySelector("#empty-description");
  const formError = document.querySelector("#form-error");
  const storageMessage = document.querySelector("#storage-message");
  const termSelect = document.querySelector("#student-term");
  const termPricePreview = document.querySelector("#student-term-price");
  const termNotice = document.querySelector("#student-term-notice");
  const credentialDialog = document.querySelector("#credential-dialog");
  const paymentDialog = document.querySelector("#student-payment-dialog");
  const paymentForm = document.querySelector("#student-payment-form");
  const renewalDialog = document.querySelector("#student-renewal-dialog");
  const renewalForm = document.querySelector("#student-renewal-form");
  const renewalTermSelect = document.querySelector("#renewal-term");

  if (
    !studentDialog ||
    !studentForm ||
    !studentRows ||
    !studentSearch ||
    !studentStatusFilter ||
    !studentPaymentFilter ||
    !studentTermFilter ||
    !studentSort ||
    !studentCount ||
    !activeStudentCount ||
    !archivedStudentCount ||
    !studentBalanceTotal ||
    !activeTabCount ||
    !archivedTabCount ||
    !studentListCaption ||
    !emptyState ||
    !emptyTitle ||
    !emptyDescription ||
    !formError ||
    !storageMessage ||
    !termSelect ||
    !termPricePreview ||
    !termNotice ||
    !credentialDialog ||
    !paymentDialog ||
    !paymentForm ||
    !renewalDialog ||
    !renewalForm ||
    !renewalTermSelect
  ) {
    return;
  }

  const storageKeys = {
    students: "vota-travel.students.v1",
    terms: "vota-travel.terms.v1",
    subscriptions: "vota-travel.subscriptions.v1",
  };
  const subscriptionLabels = {
    active: "نشط",
    pending: "بانتظار التفعيل",
    inactive: "غير نشط",
    paused: "متوقف مؤقتًا",
    withdrawn: "منسحب",
    expired: "منتهي الاشتراك",
  };
  const paymentMethods = ["cash", "transfer", "other"];
  const moneyFormatter = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let students = [];
  let terms = [];
  let subscriptions = [];
  let nextStudentId = 1;
  let nextSubscriptionId = 1;
  let storageReady = true;
  let editingStudentId = null;
  let activePaymentSubscriptionId = null;
  let renewingStudentId = null;
  let studentView = "active";

  function showStorageError(message, error) {
    console.error(message, error);
    storageMessage.textContent = message;
    storageMessage.hidden = false;
    storageReady = false;
    document.querySelector("#open-student-form").disabled = true;
    document.querySelector("#empty-add-button").disabled = true;
  }

  function toCents(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) return null;
    return Math.round((amount + Number.EPSILON) * 100);
  }

  function formatMoney(cents) {
    return `${moneyFormatter.format(cents / 100)} ج.م`;
  }

  function isStudentRecord(student) {
    return (
      student !== null &&
      typeof student === "object" &&
      Number.isSafeInteger(student.id) &&
      student.id > 0 &&
      typeof student.name === "string" &&
      typeof student.phone === "string" &&
      typeof student.pickup === "string" &&
      typeof student.university === "string" &&
      typeof student.faculty === "string" &&
      typeof student.studyYear === "string" &&
      typeof student.emergencyPhone === "string" &&
      typeof student.notes === "string" &&
      (student.createdAt === undefined || typeof student.createdAt === "string") &&
      (student.archivedAt === undefined || typeof student.archivedAt === "string") &&
      Object.hasOwn(subscriptionLabels, student.subscription) &&
      (student.mustChangePassword === undefined ||
        typeof student.mustChangePassword === "boolean")
    );
  }

  function isTermRecord(term) {
    return (
      term !== null &&
      typeof term === "object" &&
      Number.isSafeInteger(term.id) &&
      term.id > 0 &&
      typeof term.name === "string" &&
      typeof term.academicYear === "string" &&
      Number.isSafeInteger(term.priceCents) &&
      term.priceCents > 0 &&
      (term.startDate === undefined || isValidDateOnly(term.startDate)) &&
      (term.endDate === undefined || isValidDateOnly(term.endDate))
    );
  }

  function isSubscriptionRecord(subscription) {
    return (
      subscription !== null &&
      typeof subscription === "object" &&
      Number.isSafeInteger(subscription.id) &&
      subscription.id > 0 &&
      Number.isSafeInteger(subscription.studentId) &&
      subscription.studentId > 0 &&
      typeof subscription.studentName === "string" &&
      typeof subscription.studentPhone === "string" &&
      Number.isSafeInteger(subscription.termId) &&
      subscription.termId > 0 &&
      typeof subscription.termName === "string" &&
      typeof subscription.academicYear === "string" &&
      Number.isSafeInteger(subscription.priceCents) &&
      subscription.priceCents > 0 &&
      (subscription.startDate === undefined || isValidDateOnly(subscription.startDate)) &&
      (subscription.endDate === undefined || isValidDateOnly(subscription.endDate)) &&
      Array.isArray(subscription.payments) &&
      subscription.payments.every(
        (payment) =>
          payment !== null &&
          typeof payment === "object" &&
          Number.isSafeInteger(payment.amountCents) &&
          payment.amountCents > 0 &&
          paymentMethods.includes(payment.method) &&
          typeof payment.paidAt === "string" &&
          (payment.receiptNumber === undefined || typeof payment.receiptNumber === "string")
      ) &&
      subscription.payments.reduce((sum, payment) => sum + payment.amountCents, 0) <=
        subscription.priceCents
    );
  }

  function readStoredArray(key, validator, label) {
    const value = window.localStorage.getItem(key);
    if (value === null) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(validator)) {
      throw new TypeError(`Saved ${label} data has an invalid format.`);
    }
    const ids = parsed.map((record) => record.id);
    if (new Set(ids).size !== ids.length) {
      throw new TypeError(`Saved ${label} data contains duplicate IDs.`);
    }
    return parsed;
  }

  function loadStudents() {
    try {
      students = readStoredArray(storageKeys.students, isStudentRecord, "student");
      terms = readStoredArray(storageKeys.terms, isTermRecord, "term");
      subscriptions = readStoredArray(
        storageKeys.subscriptions,
        isSubscriptionRecord,
        "subscription"
      );
      nextStudentId = students.reduce(
        (largestId, student) => Math.max(largestId, student.id),
        0
      ) + 1;
      nextSubscriptionId = subscriptions.reduce(
        (largestId, subscription) => Math.max(largestId, subscription.id),
        0
      ) + 1;
    } catch (error) {
      showStorageError("تعذر استرجاع بيانات الطلاب أو الاشتراكات. لم يتم تعديلها.", error);
    }
  }

  function saveRegistration(updatedStudents, updatedSubscriptions) {
    let oldStudents;
    let oldSubscriptions;
    try {
      oldStudents = window.localStorage.getItem(storageKeys.students);
      oldSubscriptions = window.localStorage.getItem(storageKeys.subscriptions);
      window.localStorage.setItem(storageKeys.students, JSON.stringify(updatedStudents));
      window.localStorage.setItem(
        storageKeys.subscriptions,
        JSON.stringify(updatedSubscriptions)
      );
      storageMessage.textContent = "";
      storageMessage.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save student registration and subscription.", error);
      if (oldStudents === undefined || oldSubscriptions === undefined) {
        storageMessage.textContent = "تعذر حفظ بيانات الطالب والاشتراك. حاول مرة أخرى.";
        storageMessage.hidden = false;
        return false;
      }
      try {
        if (oldStudents === null) window.localStorage.removeItem(storageKeys.students);
        else window.localStorage.setItem(storageKeys.students, oldStudents);
        if (oldSubscriptions === null) {
          window.localStorage.removeItem(storageKeys.subscriptions);
        } else {
          window.localStorage.setItem(storageKeys.subscriptions, oldSubscriptions);
        }
      } catch (rollbackError) {
        console.error("Unable to roll back partial student registration.", rollbackError);
        showStorageError("تعذر حفظ التسجيل بالكامل. راجع بيانات الطلاب والاشتراكات.", rollbackError);
        return false;
      }
      storageMessage.textContent = "تعذر حفظ بيانات الطالب والاشتراك. حاول مرة أخرى.";
      storageMessage.hidden = false;
      return false;
    }
  }

  function saveStudents(updatedStudents) {
    try {
      window.localStorage.setItem(
        storageKeys.students,
        JSON.stringify(updatedStudents)
      );
      storageMessage.textContent = "";
      storageMessage.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save student records.", error);
      storageMessage.textContent = "تعذر حفظ بيانات الطلاب. حاول مرة أخرى.";
      storageMessage.hidden = false;
      return false;
    }
  }

  function updateTermOptions() {
    const selectedTermId = termSelect.value;
    termSelect.replaceChildren(new Option("اختر الترم", ""));
    for (const term of terms.filter((item) => item.startDate && item.endDate)) {
      termSelect.add(
        new Option(
          `${term.name} — ${term.academicYear} (${formatLocalDate(term.startDate)} - ${formatLocalDate(term.endDate)})`,
          String(term.id)
        )
      );
    }
    termSelect.value = selectedTermId;
    const term = terms.find((item) => item.id === Number(termSelect.value));
    const paymentInput = studentForm.elements.initialPayment;
    if (term) {
      termPricePreview.replaceChildren();
      const label = document.createTextNode("سعر الاشتراك: ");
      const price = document.createElement("strong");
      price.textContent = formatMoney(term.priceCents);
      const dates = document.createTextNode(
        ` | ${formatLocalDate(term.startDate)} - ${formatLocalDate(term.endDate)}`
      );
      termPricePreview.append(label, price, dates);
      paymentInput.max = String(term.priceCents / 100);
    } else {
      termPricePreview.textContent = terms.some((item) => item.startDate && item.endDate)
        ? "اختر الترم لعرض سعر الاشتراك."
        : "أضف ترمًا أو أكمل تواريخه من صفحة الإعدادات أولًا.";
      paymentInput.removeAttribute("max");
    }
  }

  function createCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text || "—";
    return cell;
  }

  function subscriptionFor(student) {
    return subscriptions.find(
      (item) => item.studentId === student.id && item.termId === student.termId
    );
  }

  function effectiveStatus(student) {
    const subscription = subscriptionFor(student);
    if (
      ["active", "pending"].includes(student.subscription) &&
      subscription?.endDate &&
      subscription.endDate < localDateString()
    ) {
      return "expired";
    }
    return student.subscription;
  }

  function daysUntilEnd(student) {
    const endDate = subscriptionFor(student)?.endDate;
    if (!endDate) return null;
    const [year, month, day] = endDate.split("-").map(Number);
    const [todayYear, todayMonth, todayDay] = localDateString().split("-").map(Number);
    return Math.floor(
      (Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) /
      86400000
    );
  }

  function paymentFor(student) {
    const subscription = subscriptionFor(student);
    const paidCents = subscription
      ? subscription.payments.reduce((total, payment) => total + payment.amountCents, 0)
      : 0;
    const balanceCents = subscription
      ? Math.max(0, subscription.priceCents - paidCents)
      : 0;
    const status = !subscription || paidCents === 0
      ? "unpaid"
      : balanceCents === 0
        ? "paid"
        : "partial";
    return { subscription, paidCents, balanceCents, status };
  }

  function visibleStudentsForExport() {
    const query = studentSearch.value.trim().toLocaleLowerCase("ar");
    const statusFilter = studentStatusFilter.value;
    const paymentFilter = studentPaymentFilter.value;
    const termFilter = studentTermFilter.value;
    return students
      .filter((student) => Boolean(student.archivedAt) === (studentView === "archived"))
      .filter((student) => {
        const subscription = subscriptionFor(student);
        const term = terms.find((item) => item.id === student.termId);
        const matchesQuery = [
          student.name,
          student.phone,
          student.emergencyPhone,
          student.pickup,
          student.university,
          student.faculty,
          student.studyYear,
          studentUsername(student.id),
          term?.name,
          term?.academicYear,
          subscription?.termName,
        ].filter(Boolean).join(" ").toLocaleLowerCase("ar").includes(query);
        const matchesStatus = !statusFilter || effectiveStatus(student) === statusFilter;
        const matchesPayment = !paymentFilter || paymentFor(student).status === paymentFilter;
        const matchesTerm = !termFilter || String(student.termId) === termFilter;
        return matchesQuery && matchesStatus && matchesPayment && matchesTerm;
      })
      .sort((left, right) => {
        if (studentSort.value === "name") {
          return left.name.localeCompare(right.name, "ar");
        }
        const leftTime = Date.parse(left.createdAt || "") || left.id;
        const rightTime = Date.parse(right.createdAt || "") || right.id;
        return studentSort.value === "oldest"
          ? leftTime - rightTime
          : rightTime - leftTime;
      });
  }

  function renderStudents() {
    const archivedStudents = students.filter((student) => student.archivedAt);
    const currentStudents = students.filter((student) => !student.archivedAt);
    const activeCount = currentStudents.filter(
      (student) => effectiveStatus(student) === "active"
    ).length;
    const openBalance = currentStudents.reduce(
      (total, student) => total + paymentFor(student).balanceCents,
      0
    );
    const formatCount = (value) => new Intl.NumberFormat("ar-EG").format(value);
    studentCount.textContent = formatCount(students.length);
    activeStudentCount.textContent = formatCount(activeCount);
    archivedStudentCount.textContent = formatCount(archivedStudents.length);
    studentBalanceTotal.textContent = formatMoney(openBalance);
    activeTabCount.textContent = formatCount(currentStudents.length);
    archivedTabCount.textContent = formatCount(archivedStudents.length);
    studentListCaption.textContent = studentView === "archived"
      ? "الملفات المؤرشفة محفوظة، ويمكن استعادتها في أي وقت."
      : "تابع البيانات والسداد وإدارة ملفات الطلاب.";

    const selectedTermId = studentTermFilter.value;
    studentTermFilter.replaceChildren(new Option("كل الترمات", ""));
    for (const term of terms) {
      studentTermFilter.add(
        new Option(`${term.name} — ${term.academicYear}`, String(term.id))
      );
    }
    studentTermFilter.value = selectedTermId;

    const visibleStudents = visibleStudentsForExport();
    studentRows.replaceChildren();
    for (const student of visibleStudents) {
      const row = document.createElement("tr");
      if (student.archivedAt) row.classList.add("archived-student-row");
      const nameCell = document.createElement("td");
      const studentIdentity = document.createElement("div");
      const studentName = document.createElement("strong");
      const studentId = document.createElement("span");
      studentIdentity.className = "student-identity";
      studentName.textContent = student.name;
      studentId.className = "student-id";
      studentId.textContent = studentUsername(student.id);
      studentIdentity.append(studentName, studentId);
      nameCell.append(studentIdentity);

      const contactCell = document.createElement("td");
      contactCell.className = "student-contact-cell";
      const phoneLink = document.createElement("a");
      phoneLink.href = `tel:${encodeURIComponent(student.phone)}`;
      phoneLink.textContent = student.phone;
      phoneLink.dir = "ltr";
      contactCell.append(phoneLink);
      if (student.emergencyPhone) {
        const emergencyLabel = document.createElement("small");
        emergencyLabel.textContent = `طوارئ: ${student.emergencyPhone}`;
        contactCell.append(emergencyLabel);
      }

      const education = [student.university, student.faculty, student.studyYear]
        .filter(Boolean)
        .join("، ");
      const term = terms.find((item) => item.id === student.termId);
      const payment = paymentFor(student);
      const termLabel = term
        ? `${term.name} — ${term.academicYear}`
        : payment.subscription
          ? `${payment.subscription.termName} — ${payment.subscription.academicYear}`
          : "—";
      const paymentStatus = document.createElement("span");
      paymentStatus.className = `status-badge ${
        payment.status === "paid"
          ? "status-active"
          : payment.status === "partial"
            ? "status-pending"
            : "status-inactive"
      }`;
      paymentStatus.textContent = payment.status === "paid"
        ? "مدفوع"
        : payment.status === "partial"
          ? "مدفوع جزئيًا"
          : "غير مدفوع";
      const studentStatus = document.createElement("span");
      const currentStatus = effectiveStatus(student);
      studentStatus.className = `status-badge status-${currentStatus}`;
      studentStatus.textContent = subscriptionLabels[currentStatus];
      const statusStack = document.createElement("div");
      statusStack.className = "student-subscription-status";
      statusStack.append(studentStatus, paymentStatus);
      const remainingDays = daysUntilEnd(student);
      if (
        remainingDays !== null &&
        remainingDays >= 0 &&
        remainingDays <= subscriptionExpiryAlertDays &&
        ["active", "pending"].includes(currentStatus)
      ) {
        const expiryNotice = document.createElement("small");
        expiryNotice.className = "student-expiry-notice";
        expiryNotice.textContent = remainingDays === 0
          ? "ينتهي اليوم"
          : `ينتهي خلال ${new Intl.NumberFormat("ar-EG").format(remainingDays)} يوم`;
        statusStack.append(expiryNotice);
      }
      const statusCell = document.createElement("td");
      statusCell.append(statusStack);

      const actionsCell = document.createElement("td");
      actionsCell.className = "student-actions";
      const profileLink = document.createElement("a");
      profileLink.className = "student-action";
      profileLink.href = `student.html?id=${encodeURIComponent(student.id)}`;
      profileLink.textContent = "عرض";
      profileLink.title = "عرض ملف الطالب";
      const tripsLink = document.createElement("a");
      tripsLink.className = "student-action";
      tripsLink.href = `${profileLink.href}#profile-trips`;
      tripsLink.textContent = "الرحلات";
      tripsLink.title = "إدارة الرحلات والحجوزات";
      actionsCell.append(profileLink);
      if (student.archivedAt) {
        const restoreButton = document.createElement("button");
        restoreButton.className = "student-action";
        restoreButton.type = "button";
        restoreButton.dataset.action = "restore";
        restoreButton.dataset.studentId = String(student.id);
        restoreButton.textContent = "استعادة";
        actionsCell.append(restoreButton);
      } else {
        const editButton = document.createElement("button");
        editButton.className = "student-action";
        editButton.type = "button";
        editButton.dataset.action = "edit";
        editButton.dataset.studentId = String(student.id);
        editButton.textContent = "تعديل";
        const statusButton = document.createElement("button");
        statusButton.className = "student-action";
        statusButton.type = "button";
        statusButton.dataset.action = "toggle-status";
        statusButton.dataset.studentId = String(student.id);
        statusButton.textContent = ["inactive", "paused"].includes(currentStatus)
          ? "استئناف"
          : currentStatus === "expired"
            ? "منتهي"
            : currentStatus === "withdrawn"
              ? "منسحب"
              : "إيقاف مؤقت";
        statusButton.disabled = ["expired", "withdrawn"].includes(currentStatus);
        const resetPasswordButton = document.createElement("button");
        resetPasswordButton.className = "student-action";
        resetPasswordButton.type = "button";
        resetPasswordButton.dataset.action = "reset-password";
        resetPasswordButton.dataset.studentId = String(student.id);
        resetPasswordButton.textContent = "كلمة المرور";
        const archiveButton = document.createElement("button");
        archiveButton.className = "student-action student-archive-action";
        archiveButton.type = "button";
        archiveButton.dataset.action = "archive";
        archiveButton.dataset.studentId = String(student.id);
        archiveButton.textContent = "أرشفة";
        const paymentButton = document.createElement("button");
        paymentButton.className = "student-action";
        paymentButton.type = "button";
        paymentButton.dataset.action = "payment";
        paymentButton.dataset.studentId = String(student.id);
        paymentButton.textContent = "دفعة";
        paymentButton.title = "تسجيل دفعة";
        paymentButton.disabled = !payment.subscription || payment.balanceCents <= 0;
        const phoneLink = document.createElement("a");
        phoneLink.className = "student-action";
        phoneLink.href = `tel:${encodeURIComponent(student.phone)}`;
        phoneLink.textContent = "اتصال";
        const latestPayment = payment.subscription?.payments.at(-1);
        const receiptButton = document.createElement("button");
        receiptButton.className = "student-action";
        receiptButton.type = "button";
        receiptButton.dataset.action = "receipt";
        receiptButton.dataset.studentId = String(student.id);
        receiptButton.textContent = "إيصال";
        receiptButton.title = "طباعة آخر إيصال";
        receiptButton.disabled = !latestPayment;
        const printFileLink = document.createElement("a");
        printFileLink.className = "student-action";
        printFileLink.href = `student.html?id=${encodeURIComponent(student.id)}&print=1`;
        printFileLink.textContent = "طباعة الملف";
        const renewButton = document.createElement("button");
        renewButton.className = "student-action";
        renewButton.type = "button";
        renewButton.dataset.action = "renew";
        renewButton.dataset.studentId = String(student.id);
        renewButton.textContent = "تجديد";
        const withdrawButton = document.createElement("button");
        withdrawButton.className = "student-action student-archive-action";
        withdrawButton.type = "button";
        withdrawButton.dataset.action = "withdraw";
        withdrawButton.dataset.studentId = String(student.id);
        withdrawButton.textContent = "إلغاء";
        withdrawButton.disabled = currentStatus === "withdrawn";
        actionsCell.append(
          tripsLink, editButton, paymentButton, statusButton, renewButton,
          phoneLink, receiptButton, printFileLink, resetPasswordButton, withdrawButton, archiveButton
        );
      }

      const balanceCell = createCell(
        payment.subscription ? formatMoney(payment.balanceCents) : "—",
        payment.balanceCents > 0 ? "student-balance-due" : "student-balance-paid"
      );
      const lastPayment = payment.subscription?.payments.at(-1);
      const paymentMethodLabels = { cash: "نقدي", transfer: "تحويل", other: "أخرى" };
      const lastPaymentCell = createCell(
        lastPayment
          ? `${formatLocalDate(lastPayment.paidAt)} — ${paymentMethodLabels[lastPayment.method] || "أخرى"}`
          : "لا توجد دفعات"
      );
      lastPaymentCell.classList.add("student-last-payment");
      row.append(
        nameCell,
        contactCell,
        createCell(education),
        createCell(student.pickup),
        createCell(termLabel),
        createCell(payment.subscription ? formatMoney(payment.subscription.priceCents) : "—"),
        createCell(payment.subscription ? formatMoney(payment.paidCents) : "—"),
        balanceCell,
        lastPaymentCell,
        statusCell,
        actionsCell
      );
      studentRows.append(row);
    }

    const noMatches = visibleStudents.length === 0;
    emptyState.hidden = !noMatches;
    studentRows.closest("table").hidden = noMatches;
    if (noMatches && students.some((student) =>
      Boolean(student.archivedAt) === (studentView === "archived")
    )) {
      emptyTitle.textContent = "مفيش نتائج مطابقة";
      emptyDescription.textContent = "غيّر كلمات البحث أو أزل بعض الفلاتر لعرض الملفات.";
      document.querySelector("#empty-add-button").hidden = true;
    } else if (studentView === "archived") {
      emptyTitle.textContent = "الأرشيف فارغ";
      emptyDescription.textContent = "أي طالب يتم أرشفته سيظهر هنا ويمكن استعادته لاحقًا.";
      document.querySelector("#empty-add-button").hidden = true;
    } else {
      emptyTitle.textContent = "لسه مفيش طلاب";
      emptyDescription.textContent = "ابدأ بإضافة أول طالب، وسجّل بياناته ومكان الركوب.";
      document.querySelector("#empty-add-button").hidden = false;
    }

    const hasDatedTerms = terms.some((term) => term.startDate && term.endDate);
    termNotice.hidden = hasDatedTerms;
    if (!hasDatedTerms) {
      termNotice.replaceChildren(
        document.createTextNode("أكمل تواريخ بداية ونهاية الترم من صفحة الإعدادات لتفعيل التسجيل. ")
      );
      const settingsLink = document.createElement("a");
      settingsLink.href = "settings.html";
      settingsLink.textContent = "فتح الإعدادات";
      termNotice.append(settingsLink);
    }
    document.querySelector("#open-student-form").disabled = !storageReady || !hasDatedTerms;
    document.querySelector("#empty-add-button").disabled = !storageReady || !hasDatedTerms;
  }

  function openStudentDialog() {
    if (!storageReady || !terms.some((term) => term.startDate && term.endDate)) return;
    formError.textContent = "";
    editingStudentId = null;
    studentForm.reset();
    studentForm.elements.subscription.querySelector('option[value="expired"]')?.remove();
    studentForm.elements.termId.disabled = false;
    document.querySelector("#student-term-price").hidden = false;
    document.querySelector("#initial-payment-field").hidden = false;
    document.querySelector("#payment-method-field").hidden = false;
    document.querySelector("#dialog-title").textContent = "إضافة طالب جديد";
    studentForm.querySelector('button[type="submit"]').textContent = "حفظ بيانات الطالب";
    termSelect.replaceChildren(new Option("اختر الترم", ""));
    updateTermOptions();
    studentDialog.showModal();
    studentForm.elements.name.focus();
  }

  function closeStudentDialog() {
    studentDialog.close();
    studentForm.reset();
    editingStudentId = null;
    studentForm.elements.termId.disabled = false;
    document.querySelector("#student-term-price").hidden = false;
    document.querySelector("#initial-payment-field").hidden = false;
    document.querySelector("#payment-method-field").hidden = false;
    formError.textContent = "";
  }

  function closePaymentDialog() {
    paymentDialog.close();
    paymentForm.reset();
    document.querySelector("#student-payment-error").textContent = "";
    activePaymentSubscriptionId = null;
  }

  function openPaymentDialog(student) {
    const subscription = subscriptionFor(student);
    if (!subscription) {
      storageMessage.textContent = "لا يوجد اشتراك حالي لهذا الطالب لتسجيل دفعة.";
      storageMessage.hidden = false;
      return;
    }
    activePaymentSubscriptionId = subscription.id;
    paymentForm.reset();
    document.querySelector("#student-payment-error").textContent = "";
    const paid = subscription.payments.reduce(
      (total, payment) => total + payment.amountCents,
      0
    );
    const remaining = Math.max(0, subscription.priceCents - paid);
    if (remaining <= 0) {
      storageMessage.textContent = "تم سداد قيمة هذا الاشتراك بالكامل.";
      storageMessage.hidden = false;
      return;
    }
    document.querySelector("#student-payment-context").textContent =
      `${student.name} — ${subscription.termName} | الإجمالي ${formatMoney(subscription.priceCents)} | المدفوع ${formatMoney(paid)} | المتبقي ${formatMoney(remaining)}`;
    paymentForm.elements.amount.max = String(remaining / 100);
    paymentDialog.showModal();
    paymentForm.elements.amount.focus();
  }

  function closeRenewalDialog() {
    renewalDialog.close();
    renewalForm.reset();
    renewingStudentId = null;
    document.querySelector("#student-renewal-error").textContent = "";
  }

  function updateRenewalPreview() {
    const term = terms.find((item) => item.id === Number(renewalTermSelect.value));
    const preview = document.querySelector("#renewal-term-price");
    const paymentInput = renewalForm.elements.initialPayment;
    if (!term) {
      preview.textContent = "اختر الترم لعرض السعر وفترة الاشتراك.";
      paymentInput.removeAttribute("max");
      return;
    }
    preview.textContent =
      `السعر: ${formatMoney(term.priceCents)} | من ${formatLocalDate(term.startDate)} إلى ${formatLocalDate(term.endDate)}`;
    paymentInput.max = String(term.priceCents / 100);
  }

  function openRenewalDialog(student) {
    renewingStudentId = student.id;
    renewalForm.reset();
    document.querySelector("#student-renewal-error").textContent = "";
    renewalTermSelect.replaceChildren(new Option("اختر الترم", ""));
    const availableTerms = terms.filter((term) =>
      term.startDate && term.endDate && !subscriptions.some((subscription) =>
        subscription.studentId === student.id && subscription.termId === term.id
      )
    );
    for (const term of availableTerms) {
      renewalTermSelect.add(
        new Option(`${term.name} — ${term.academicYear}`, String(term.id))
      );
    }
    renewalForm.querySelector('button[type="submit"]').disabled = availableTerms.length === 0;
    if (!availableTerms.length) {
      document.querySelector("#student-renewal-error").textContent =
        "لا توجد ترمات جديدة متاحة لهذا الطالب. أضف ترمًا من الإعدادات أولًا.";
    }
    updateRenewalPreview();
    renewalDialog.showModal();
    renewalTermSelect.focus();
  }

  function showCredentials(studentId, password) {
    document.querySelector("#credential-username").value = studentUsername(studentId);
    document.querySelector("#credential-password").value = password;
    credentialDialog.showModal();
  }

  async function resetStudentPassword(student) {
    const temporaryPassword = generateTemporaryPassword();
    const updatedStudent = {
      ...student,
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    };
    const account = await window.votaData.manageStudentAuth(
      student.authUserId ? "reset" : "create",
      student.id,
      temporaryPassword
    );
    updatedStudent.authUserId = account.userId;
    const updatedStudents = students.map((record) =>
      record.id === student.id ? updatedStudent : record
    );
    if (!saveStudents(updatedStudents)) {
      throw new Error("Unable to save the new student portal password.");
    }
    students = updatedStudents;
    await window.votaData.flush();
    renderStudents();
    showCredentials(student.id, temporaryPassword);
  }

  function openEditDialog(student) {
    editingStudentId = student.id;
    formError.textContent = "";
    studentForm.reset();
    studentForm.elements.subscription.querySelector('option[value="expired"]')?.remove();
    if (student.subscription === "expired") {
      studentForm.elements.subscription.add(new Option("منتهي الاشتراك", "expired"));
    }
    const fields = [
      "name", "phone", "pickup", "university", "faculty", "studyYear",
      "emergencyPhone", "subscription", "notes",
    ];
    for (const field of fields) studentForm.elements[field].value = student[field] || "";
    const savedTerm = terms.find((term) => term.id === student.termId);
    termSelect.replaceChildren(
      new Option(
        savedTerm ? `${savedTerm.name} — ${savedTerm.academicYear}` : "الترم المسجل",
        String(student.termId)
      )
    );
    termSelect.value = String(student.termId);
    termSelect.disabled = true;
    document.querySelector("#student-term-price").hidden = true;
    document.querySelector("#initial-payment-field").hidden = true;
    document.querySelector("#payment-method-field").hidden = true;
    document.querySelector("#dialog-title").textContent = "تعديل بيانات الطالب";
    studentForm.querySelector('button[type="submit"]').textContent = "حفظ التعديلات";
    studentDialog.showModal();
    studentForm.elements.name.focus();
  }

  document.querySelector("#open-student-form").addEventListener("click", openStudentDialog);
  document.querySelector("#empty-add-button").addEventListener("click", openStudentDialog);
  document.querySelector("#close-dialog").addEventListener("click", closeStudentDialog);
  document.querySelector("#cancel-dialog").addEventListener("click", closeStudentDialog);
  document.querySelector("#close-student-payment").addEventListener("click", closePaymentDialog);
  document.querySelector("#cancel-student-payment").addEventListener("click", closePaymentDialog);
  paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) closePaymentDialog();
  });
  paymentDialog.addEventListener("cancel", () => {
    activePaymentSubscriptionId = null;
    paymentForm.reset();
  });
  document.querySelector("#close-student-renewal").addEventListener("click", closeRenewalDialog);
  document.querySelector("#cancel-student-renewal").addEventListener("click", closeRenewalDialog);
  renewalDialog.addEventListener("click", (event) => {
    if (event.target === renewalDialog) closeRenewalDialog();
  });
  renewalDialog.addEventListener("cancel", () => {
    renewingStudentId = null;
    renewalForm.reset();
  });
  renewalTermSelect.addEventListener("change", updateRenewalPreview);
  paymentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = document.querySelector("#student-payment-error");
    error.textContent = "";
    if (!storageReady || !paymentForm.reportValidity()) return;
    const subscription = subscriptions.find(
      (item) => item.id === activePaymentSubscriptionId
    );
    const student = subscription &&
      students.find((record) => record.id === subscription.studentId);
    if (!subscription || !student) {
      error.textContent = "اشتراك الطالب غير موجود. حدّث الصفحة وحاول مرة أخرى.";
      return;
    }
    const amount = Number(paymentForm.elements.amount.value);
    const amountCents = Number.isFinite(amount)
      ? Math.round((amount + Number.EPSILON) * 100)
      : 0;
    const paid = subscription.payments.reduce(
      (total, payment) => total + payment.amountCents,
      0
    );
    const remaining = subscription.priceCents - paid;
    const method = String(paymentForm.elements.method.value);
    if (amountCents < 1 || amountCents > remaining || !paymentMethods.includes(method)) {
      error.textContent = `أدخل مبلغًا صحيحًا لا يتجاوز ${formatMoney(remaining)}.`;
      return;
    }
    const payment = {
      amountCents,
      method,
      paidAt: new Date().toISOString(),
      receiptNumber: `VOTA-${student.id}-${subscription.id}-${subscription.payments.length + 1}`,
    };
    const updatedSubscriptions = subscriptions.map((item) =>
      item.id === subscription.id ? { ...item, payments: [...item.payments, payment] } : item
    );
    const updatedStudents = students.map((record) =>
      record.id === student.id ? { ...record, updatedAt: new Date().toISOString() } : record
    );
    if (!saveRegistration(updatedStudents, updatedSubscriptions)) {
      error.textContent = "لم يتم حفظ الدفعة. حاول مرة أخرى.";
      return;
    }
    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    closePaymentDialog();
    renderStudents();
    printReceipt(student, subscription, payment);
  });
  renewalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = document.querySelector("#student-renewal-error");
    error.textContent = "";
    if (!storageReady || !renewalForm.reportValidity()) return;
    const student = students.find((record) => record.id === renewingStudentId);
    const term = terms.find((record) => record.id === Number(renewalTermSelect.value));
    if (!student || !term || !term.startDate || !term.endDate) {
      error.textContent = "اختر طالبًا وترمًا له تاريخ بداية ونهاية.";
      return;
    }
    if (subscriptions.some((item) => item.studentId === student.id && item.termId === term.id)) {
      error.textContent = "يوجد اشتراك مسجل لهذا الطالب في الترم المحدد.";
      return;
    }
    const initialPayment = toCents(renewalForm.elements.initialPayment.value || "0");
    if (initialPayment === null || initialPayment > term.priceCents) {
      error.textContent = "المبلغ المدفوع لا يمكن أن يتجاوز سعر الترم.";
      return;
    }
    const subscription = {
      id: nextSubscriptionId,
      studentId: student.id,
      studentName: student.name,
      studentPhone: student.phone,
      termId: term.id,
      termName: term.name,
      academicYear: term.academicYear,
      priceCents: term.priceCents,
      startDate: term.startDate,
      endDate: term.endDate,
      payments: initialPayment
        ? [{
            amountCents: initialPayment,
            method: String(renewalForm.elements.paymentMethod.value),
            paidAt: new Date().toISOString(),
            receiptNumber: `VOTA-${student.id}-${nextSubscriptionId}-${subscriptions.length + 1}`,
          }]
        : [],
    };
    const updatedStudents = students.map((record) =>
      record.id === student.id
        ? { ...record, termId: term.id, subscription: "active", updatedAt: new Date().toISOString() }
        : record
    );
    const updatedSubscriptions = [...subscriptions, subscription];
    if (!saveRegistration(updatedStudents, updatedSubscriptions)) {
      error.textContent = "تعذر حفظ تجديد الاشتراك. حاول مرة أخرى.";
      return;
    }
    nextSubscriptionId++;
    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    closeRenewalDialog();
    renderStudents();
  });
  studentSearch.addEventListener("input", renderStudents);
  studentStatusFilter.addEventListener("change", renderStudents);
  studentPaymentFilter.addEventListener("change", renderStudents);
  studentTermFilter.addEventListener("change", renderStudents);
  studentSort.addEventListener("change", renderStudents);
  document.querySelectorAll("[data-student-view]").forEach((tab) => {
    tab.addEventListener("click", () => {
      studentView = tab.dataset.studentView;
      document.querySelectorAll("[data-student-view]").forEach((viewTab) => {
        const selected = viewTab === tab;
        viewTab.classList.toggle("is-active", selected);
        viewTab.setAttribute("aria-selected", String(selected));
      });
      renderStudents();
    });
  });
  document.querySelector("#export-students").addEventListener("click", () => {
    const records = visibleStudentsForExport();
    if (!records.length) {
      storageMessage.textContent = "لا توجد ملفات مطابقة للتصدير.";
      storageMessage.hidden = false;
      return;
    }

    const csvCell = (value) => {
      let text = String(value ?? "");
      if (/^\s*[=+\-@]/.test(text)) text = `'${text.trimStart()}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const headers = [
      "كود الطالب", "اسم الطالب", "رقم الهاتف", "رقم الطوارئ", "منطقة الركوب",
      "الجامعة", "الكلية أو التخصص", "السنة الدراسية", "الترم", "حالة الطالب",
      "بداية الاشتراك", "نهاية الاشتراك", "حالة السداد", "قيمة الاشتراك",
      "المدفوع", "المتبقي", "آخر دفعة", "طريقة آخر دفعة",
    ];
    const rows = records.map((student) => {
      const { subscription, paidCents, balanceCents, status } = paymentFor(student);
      const term = terms.find((item) => item.id === student.termId);
      return [
        studentUsername(student.id),
        student.name,
        student.phone,
        student.emergencyPhone,
        student.pickup,
        student.university,
        student.faculty,
        student.studyYear,
        term ? `${term.name} — ${term.academicYear}` : subscription?.termName || "",
        subscriptionLabels[effectiveStatus(student)],
        formatLocalDate(subscription?.startDate || term?.startDate),
        formatLocalDate(subscription?.endDate || term?.endDate),
        status === "paid" ? "مدفوع" : status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع",
        subscription ? formatMoney(subscription.priceCents) : "",
        subscription ? formatMoney(paidCents) : "",
        subscription ? formatMoney(balanceCents) : "",
        subscription?.payments.length
          ? formatLocalDate(subscription.payments.at(-1).paidAt)
          : "",
        subscription?.payments.length
          ? ({ cash: "نقدي", transfer: "تحويل", other: "أخرى" })[subscription.payments.at(-1).method] || "أخرى"
          : "",
      ];
    });
    const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    try {
      const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const downloadLink = document.createElement("a");
      downloadLink.href = fileUrl;
      downloadLink.download = `vota-students-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      storageMessage.textContent = "";
      storageMessage.hidden = true;
    } catch (error) {
      console.error("Unable to export student records.", error);
      storageMessage.textContent = "تعذر تصدير الملفات. حاول مرة أخرى.";
      storageMessage.hidden = false;
    }
  });
  document.querySelector("#close-credentials").addEventListener("click", () => {
    credentialDialog.close();
  });
  document.querySelector("#copy-credentials").addEventListener("click", async () => {
    const username = document.querySelector("#credential-username").value;
    const password = document.querySelector("#credential-password").value;
    try {
      await window.navigator.clipboard.writeText(`اسم المستخدم: ${username}\nكلمة المرور: ${password}`);
      document.querySelector(".credential-note").textContent = "تم نسخ بيانات الدخول.";
    } catch (error) {
      console.error("Unable to copy the student credentials.", error);
      document.querySelector(".credential-note").textContent =
        "تعذر النسخ تلقائيًا؛ يمكنك تحديد البيانات ونسخها يدويًا.";
    }
  });
  credentialDialog.addEventListener("close", () => {
    document.querySelector("#credential-username").value = "";
    document.querySelector("#credential-password").value = "";
    document.querySelector(".credential-note").textContent =
      "سيُطلب من الطالب تغيير كلمة المرور عند أول تسجيل دخول.";
  });
  termSelect.addEventListener("change", updateTermOptions);

  studentDialog.addEventListener("click", (event) => {
    if (event.target === studentDialog) closeStudentDialog();
  });

  studentDialog.addEventListener("cancel", () => {
    studentForm.reset();
    formError.textContent = "";
  });

  studentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!storageReady) {
      formError.textContent = "تعذر حفظ بيانات الطالب. حاول تحديث الصفحة.";
      return;
    }
    if (!studentForm.reportValidity()) return;

    const formData = new FormData(studentForm);
    const phone = String(formData.get("phone")).trim();
    const emergencyPhone = String(formData.get("emergencyPhone")).trim();
    const phonePattern = /^\+?[\d\s()-]{7,20}$/;

    if (!phonePattern.test(phone) || (emergencyPhone && !phonePattern.test(emergencyPhone))) {
      formError.textContent = "تأكد من كتابة رقم هاتف صحيح.";
      return;
    }

    const duplicatePhone = students.some(
      (student) => student.id !== editingStudentId && student.phone === phone
    );
    if (duplicatePhone) {
      formError.textContent = "رقم الهاتف مسجل لطالب آخر بالفعل.";
      return;
    }

    if (editingStudentId !== null) {
      const currentStudent = students.find((student) => student.id === editingStudentId);
      if (!currentStudent) {
        formError.textContent = "الطالب المطلوب تعديله غير موجود.";
        return;
      }
      const updatedStudent = {
        ...currentStudent,
        name: String(formData.get("name")).trim(),
        phone,
        pickup: String(formData.get("pickup")).trim(),
        university: String(formData.get("university")).trim(),
        faculty: String(formData.get("faculty")).trim(),
        studyYear: String(formData.get("studyYear")).trim(),
        emergencyPhone,
        subscription: String(formData.get("subscription")),
        notes: String(formData.get("notes")).trim(),
        updatedAt: new Date().toISOString(),
      };
      const updatedStudents = students.map((student) =>
        student.id === updatedStudent.id ? updatedStudent : student
      );
      const updatedSubscriptions = subscriptions.map((subscription) =>
        subscription.studentId === updatedStudent.id
          ? {
              ...subscription,
              studentName: updatedStudent.name,
              studentPhone: updatedStudent.phone,
            }
          : subscription
      );
      if (!saveRegistration(updatedStudents, updatedSubscriptions)) {
        formError.textContent = "لم يتم حفظ التعديلات. حاول مرة أخرى.";
        return;
      }
      students = updatedStudents;
      subscriptions = updatedSubscriptions;
      closeStudentDialog();
      renderStudents();
      return;
    }

    const term = terms.find(
      (item) => item.id === Number(formData.get("termId")) && item.startDate && item.endDate
    );
    if (!term) {
      formError.textContent = "اختر ترمًا له تاريخ بداية ونهاية من إعدادات الترم.";
      return;
    }

    const initialPayment = toCents(formData.get("initialPayment") || "0");
    if (initialPayment === null || initialPayment > term.priceCents) {
      formError.textContent = "المبلغ المدفوع لا يمكن أن يتجاوز سعر الترم.";
      return;
    }

    const newId = nextStudentId++;
    let temporaryPassword;
    try {
      temporaryPassword = generateTemporaryPassword();
    } catch (error) {
      nextStudentId--;
      console.error("Unable to create student portal credentials.", error);
      formError.textContent = "تعذر إنشاء بيانات الدخول. تحقق من المتصفح وحاول مرة أخرى.";
      return;
    }

    const newStudent = {
      id: newId,
      name: String(formData.get("name")).trim(),
      phone,
      pickup: String(formData.get("pickup")).trim(),
      university: String(formData.get("university")).trim(),
      faculty: String(formData.get("faculty")).trim(),
      studyYear: String(formData.get("studyYear")).trim(),
      emergencyPhone,
      subscription: String(formData.get("subscription")),
      notes: String(formData.get("notes")).trim(),
      termId: term.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mustChangePassword: true,
    };

    const newSubscription = {
      id: nextSubscriptionId++,
      studentId: newStudent.id,
      studentName: newStudent.name,
      studentPhone: newStudent.phone,
      termId: term.id,
      termName: term.name,
      academicYear: term.academicYear,
      priceCents: term.priceCents,
      startDate: term.startDate,
      endDate: term.endDate,
      payments: initialPayment
        ? [
            {
              amountCents: initialPayment,
              method: String(formData.get("paymentMethod")),
              paidAt: new Date().toISOString(),
              receiptNumber: `VOTA-${newStudent.id}-${nextSubscriptionId - 1}-1`,
            },
          ]
        : [],
    };
    const updatedStudents = [...students, newStudent];
    const updatedSubscriptions = [...subscriptions, newSubscription];
    if (!saveRegistration(updatedStudents, updatedSubscriptions)) {
      nextStudentId--;
      nextSubscriptionId--;
      formError.textContent = "لم يتم حفظ بيانات الطالب. حاول مرة أخرى.";
      return;
    }

    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    try {
      await window.votaData.flush();
      const account = await window.votaData.manageStudentAuth(
        "create",
        newStudent.id,
        temporaryPassword
      );
      const linkedStudent = { ...newStudent, authUserId: account.userId };
      students = students.map((student) =>
        student.id === linkedStudent.id ? linkedStudent : student
      );
      if (!saveStudents(students)) {
        throw new Error("Student Auth account was created but the profile link could not be saved.");
      }
      await window.votaData.flush();
      closeStudentDialog();
      showCredentials(newStudent.id, temporaryPassword);
      renderStudents();
    } catch (error) {
      console.error("Unable to create the student Supabase account.", error);
      formError.textContent =
        "تم حفظ بيانات الطالب، لكن تعذر إنشاء حسابه. استخدم زر كلمة المرور لإعادة المحاولة.";
      renderStudents();
    }
  });

  studentRows.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton || !storageReady) return;

    const studentId = Number(actionButton.dataset.studentId);
    const student = students.find((record) => record.id === studentId);
    if (!student) return;

    if (actionButton.dataset.action === "edit") {
      openEditDialog(student);
      return;
    }

    if (actionButton.dataset.action === "toggle-status") {
      const updatedStudents = students.map((record) =>
        record.id === student.id
          ? {
              ...record,
              subscription: effectiveStatus(record) === "active" ? "paused" : "active",
              updatedAt: new Date().toISOString(),
            }
          : record
      );
      if (!saveStudents(updatedStudents)) return;
      students = updatedStudents;
      renderStudents();
      return;
    }

    if (actionButton.dataset.action === "payment") {
      openPaymentDialog(student);
      return;
    }

    if (actionButton.dataset.action === "renew") {
      openRenewalDialog(student);
      return;
    }

    if (actionButton.dataset.action === "receipt") {
      const subscription = subscriptionFor(student);
      const payment = subscription?.payments.at(-1);
      if (subscription && payment) printReceipt(student, subscription, payment);
      return;
    }

    if (actionButton.dataset.action === "withdraw") {
      if (!window.confirm(`هل تريد إلغاء اشتراك ${student.name} وتحديد حالته كمنسحب؟`)) return;
      const updatedStudents = students.map((record) =>
        record.id === student.id
          ? { ...record, subscription: "withdrawn", updatedAt: new Date().toISOString() }
          : record
      );
      if (!saveStudents(updatedStudents)) return;
      students = updatedStudents;
      renderStudents();
      return;
    }

    if (actionButton.dataset.action === "archive" || actionButton.dataset.action === "restore") {
      const isArchiving = actionButton.dataset.action === "archive";
      const prompt = isArchiving
        ? `هل تريد أرشفة ملف ${student.name}؟ ستظل بياناته واشتراكاته محفوظة، وسيتوقف دخوله للبوابة.`
        : `هل تريد استعادة ملف ${student.name} وإعادة إتاحة حسابه؟`;
      if (!window.confirm(prompt)) return;
      const updatedStudents = students.map((record) => {
        if (record.id !== student.id) return record;
        if (isArchiving) {
          return {
            ...record,
            archivedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        const { archivedAt, ...restoredRecord } = record;
        return { ...restoredRecord, updatedAt: new Date().toISOString() };
      });
      if (!saveStudents(updatedStudents)) return;
      students = updatedStudents;
      renderStudents();
      return;
    }

    if (actionButton.dataset.action === "reset-password") {
      resetStudentPassword(student).catch((error) => {
        console.error("Unable to reset the student portal password.", error);
        storageMessage.textContent = "تعذر إنشاء كلمة مرور جديدة. حاول مرة أخرى.";
        storageMessage.hidden = false;
      });
    }
  });

  loadStudents();
  renderStudents();
  const requestedEditId = Number(new URLSearchParams(window.location.search).get("edit"));
  const requestedEditStudent = students.find((student) => student.id === requestedEditId);
  if (requestedEditStudent) openEditDialog(requestedEditStudent);
}

function initializeSettings() {
  const termForm = document.querySelector("#term-form");
  if (!termForm) return;

  const termList = document.querySelector("#term-list");
  const termError = document.querySelector("#term-error");
  const storageError = document.querySelector("#settings-storage-error");
  const termPriceDialog = document.querySelector("#term-price-dialog");
  const termPriceForm = document.querySelector("#term-price-form");
  const priceError = document.querySelector("#term-price-error");
  const termsKey = "vota-travel.terms.v1";
  const subscriptionsKey = "vota-travel.subscriptions.v1";
  const money = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let terms = [];
  let subscriptions = [];
  let nextTermId = 1;
  let editingTermId = null;
  let storageReady = true;

  function formatMoney(cents) {
    return `${money.format(cents / 100)} ج.م`;
  }

  function setStorageError(message, error) {
    console.error(message, error);
    storageError.textContent = message;
    storageError.hidden = false;
    storageReady = false;
    termForm.querySelector('button[type="submit"]').disabled = true;
  }

  function readRecords(key, validator, label) {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return [];
    const records = JSON.parse(stored);
    if (!Array.isArray(records) || !records.every(validator)) {
      throw new TypeError(`Saved ${label} data has an invalid format.`);
    }
    const ids = records.map((record) => record.id);
    if (new Set(ids).size !== ids.length) {
      throw new TypeError(`Saved ${label} data contains duplicate IDs.`);
    }
    return records;
  }

  function saveTerms(updatedTerms) {
    try {
      window.localStorage.setItem(termsKey, JSON.stringify(updatedTerms));
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save terms.", error);
      storageError.textContent = "تعذر حفظ إعدادات الترم. تحقق من إعدادات المتصفح ومساحة التخزين.";
      storageError.hidden = false;
      return false;
    }
  }

  function saveTermSchedule(updatedTerms, updatedSubscriptions) {
    let previousTerms;
    let previousSubscriptions;
    try {
      previousTerms = window.localStorage.getItem(termsKey);
      previousSubscriptions = window.localStorage.getItem(subscriptionsKey);
      window.localStorage.setItem(termsKey, JSON.stringify(updatedTerms));
      window.localStorage.setItem(subscriptionsKey, JSON.stringify(updatedSubscriptions));
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save term schedule.", error);
      if (previousTerms !== undefined && previousSubscriptions !== undefined) {
        try {
          if (previousTerms === null) window.localStorage.removeItem(termsKey);
          else window.localStorage.setItem(termsKey, previousTerms);
          if (previousSubscriptions === null) window.localStorage.removeItem(subscriptionsKey);
          else window.localStorage.setItem(subscriptionsKey, previousSubscriptions);
        } catch (rollbackError) {
          console.error("Unable to roll back term schedule changes.", rollbackError);
        }
      }
      storageError.textContent = "تعذر حفظ مواعيد الترم والاشتراكات المرتبطة به.";
      storageError.hidden = false;
      return false;
    }
  }

  function renderTerms() {
    termList.replaceChildren();
    for (const term of terms) {
      const item = document.createElement("div");
      item.className = "term-item";
      const name = document.createElement("div");
      name.className = "term-item-name";
      const title = document.createElement("strong");
      title.textContent = term.name;
      const year = document.createElement("span");
      year.textContent = `${term.academicYear} | ${formatLocalDate(term.startDate)} - ${formatLocalDate(term.endDate)}`;
      name.append(title, year);

      const price = document.createElement("span");
      price.className = "term-item-price";
      price.textContent = formatMoney(term.priceCents);

      const actions = document.createElement("div");
      actions.className = "term-item-actions";
      const editButton = document.createElement("button");
      editButton.className = "term-action";
      editButton.type = "button";
      editButton.dataset.action = "edit-term";
      editButton.dataset.termId = String(term.id);
      editButton.textContent = "تعديل";
      const deleteButton = document.createElement("button");
      deleteButton.className = "term-action delete";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-term";
      deleteButton.dataset.termId = String(term.id);
      deleteButton.textContent = "حذف";
      actions.append(editButton, deleteButton);
      item.append(name, price, actions);
      termList.append(item);
    }

    document.querySelector("#term-count").textContent =
      `${new Intl.NumberFormat("ar-EG").format(terms.length)} ترم`;
    document.querySelector("#terms-empty").hidden = terms.length > 0;
  }

  function closePriceDialog() {
    termPriceDialog.close();
    termPriceForm.reset();
    priceError.textContent = "";
    editingTermId = null;
  }

  termForm.addEventListener("submit", (event) => {
    event.preventDefault();
    termError.textContent = "";
    if (!storageReady || !termForm.reportValidity()) return;

    const data = new FormData(termForm);
    const name = String(data.get("name")).trim();
    const academicYear = String(data.get("academicYear")).trim();
    const price = Number(data.get("price"));
    const startDate = String(data.get("startDate"));
    const endDate = String(data.get("endDate"));
    const priceCents = Number.isFinite(price) ? Math.round((price + Number.EPSILON) * 100) : 0;
    if (!name || !academicYear || priceCents < 1 || !startDate || !endDate || startDate > endDate) {
      termError.textContent = "أدخل اسم الترم والعام والسعر وفترة زمنية صحيحة.";
      return;
    }
    const duplicate = terms.some((term) =>
      term.name.toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar") &&
      term.academicYear.toLocaleLowerCase("ar") === academicYear.toLocaleLowerCase("ar")
    );
    if (duplicate) {
      termError.textContent = "الترم مسجل بالفعل لهذا العام الدراسي.";
      return;
    }

    const updatedTerms = [...terms, { id: nextTermId, name, academicYear, priceCents, startDate, endDate }];
    if (!saveTerms(updatedTerms)) return;
    nextTermId++;
    terms = updatedTerms;
    termForm.reset();
    renderTerms();
  });

  termList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !storageReady) return;
    const termId = Number(button.dataset.termId);
    const term = terms.find((item) => item.id === termId);
    if (!term) return;

    if (button.dataset.action === "edit-term") {
      editingTermId = term.id;
      priceError.textContent = "";
      termPriceForm.reset();
      document.querySelector("#term-price-context").textContent =
        `${term.name} — ${term.academicYear} | السعر الحالي ${formatMoney(term.priceCents)}`;
      termPriceForm.elements.price.value = (term.priceCents / 100).toFixed(2);
      termPriceForm.elements.startDate.value = term.startDate || "";
      termPriceForm.elements.endDate.value = term.endDate || "";
      termPriceDialog.showModal();
      termPriceForm.elements.price.focus();
      return;
    }

    if (subscriptions.some((subscription) => subscription.termId === termId)) {
      termError.textContent = "لا يمكن حذف ترم له اشتراكات مسجلة.";
      return;
    }
    const updatedTerms = terms.filter((item) => item.id !== termId);
    if (!saveTerms(updatedTerms)) return;
    terms = updatedTerms;
    termError.textContent = "";
    renderTerms();
  });

  termPriceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    priceError.textContent = "";
    if (!storageReady || !termPriceForm.reportValidity()) return;
    const value = Number(termPriceForm.elements.price.value);
    const startDate = String(termPriceForm.elements.startDate.value);
    const endDate = String(termPriceForm.elements.endDate.value);
    const priceCents = Number.isFinite(value)
      ? Math.round((value + Number.EPSILON) * 100)
      : 0;
    if (priceCents < 1 || !startDate || !endDate || startDate > endDate) {
      priceError.textContent = "أدخل سعرًا وفترة زمنية صحيحة للترم.";
      return;
    }
    const updatedTerms = terms.map((term) =>
      term.id === editingTermId ? { ...term, priceCents, startDate, endDate } : term
    );
    if (!updatedTerms.some((term) => term.id === editingTermId)) {
      priceError.textContent = "الترم غير موجود.";
      return;
    }
    const updatedSubscriptions = subscriptions.map((subscription) =>
      subscription.termId === editingTermId
        ? { ...subscription, startDate, endDate }
        : subscription
    );
    if (!saveTermSchedule(updatedTerms, updatedSubscriptions)) return;
    terms = updatedTerms;
    subscriptions = updatedSubscriptions;
    closePriceDialog();
    renderTerms();
  });

  document.querySelector("#close-term-price-dialog").addEventListener("click", closePriceDialog);
  document.querySelector("#cancel-term-price").addEventListener("click", closePriceDialog);
  termPriceDialog.addEventListener("click", (event) => {
    if (event.target === termPriceDialog) closePriceDialog();
  });
  termPriceDialog.addEventListener("cancel", () => {
    editingTermId = null;
    termPriceForm.reset();
    priceError.textContent = "";
  });

  try {
    terms = readRecords(
      termsKey,
      (term) => term && Number.isSafeInteger(term.id) && term.id > 0 &&
        typeof term.name === "string" && typeof term.academicYear === "string" &&
        Number.isSafeInteger(term.priceCents) && term.priceCents > 0 &&
        (term.startDate === undefined || isValidDateOnly(term.startDate)) &&
        (term.endDate === undefined || isValidDateOnly(term.endDate)),
      "term"
    );
    subscriptions = readRecords(
      subscriptionsKey,
      (subscription) => subscription && Number.isSafeInteger(subscription.id) &&
        Number.isSafeInteger(subscription.termId),
      "subscription"
    );
    nextTermId = terms.reduce((max, term) => Math.max(max, term.id), 0) + 1;
  } catch (error) {
    setStorageError("تعذر تحميل إعدادات الترم. لم يتم تعديلها.", error);
  }
  renderTerms();
}

function initializeSubscriptions() {
  const subscriptionsTable = document.querySelector("#subscriptions-table");
  if (!subscriptionsTable) return;

  const subscriptionRows = document.querySelector("#subscription-rows");
  const paymentDialog = document.querySelector("#payment-dialog");
  const paymentForm = document.querySelector("#payment-form");
  const paymentError = document.querySelector("#payment-error");
  const storageError = document.querySelector("#subscriptions-storage-error");
  const storageKey = "vota-travel.subscriptions.v1";
  const studentKey = "vota-travel.students.v1";
  const methodLabels = { cash: "نقدي", transfer: "تحويل", other: "أخرى" };
  const currency = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let subscriptions = [];
  let activeSubscriptionId = null;
  let storageReady = true;

  function formatMoney(cents) {
    return `${currency.format(cents / 100)} ج.م`;
  }

  function paidAmount(subscription) {
    return subscription.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  }

  function paymentState(subscription) {
    const paid = paidAmount(subscription);
    if (paid >= subscription.priceCents) {
      return { label: "مدفوع بالكامل", className: "payment-paid" };
    }
    if (paid > 0) return { label: "مدفوع جزئيًا", className: "payment-partial" };
    return { label: "غير مدفوع", className: "payment-unpaid" };
  }

  function showStorageError(message, error) {
    console.error(message, error);
    storageError.textContent = message;
    storageError.hidden = false;
    storageReady = false;
  }

  function persistPayment(updatedSubscriptions, studentId) {
    let previousSubscriptions;
    let previousStudents;
    try {
      previousSubscriptions = window.localStorage.getItem(storageKey);
      previousStudents = window.localStorage.getItem(studentKey);
      const currentStudents = readStudentRecords();
      if (!currentStudents.some((student) => student.id === studentId)) {
        throw new TypeError("Payment student record was not found.");
      }
      const updatedStudents = currentStudents.map((student) =>
        student.id === studentId ? { ...student, updatedAt: new Date().toISOString() } : student
      );
      window.localStorage.setItem(storageKey, JSON.stringify(updatedSubscriptions));
      window.localStorage.setItem(studentKey, JSON.stringify(updatedStudents));
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save payment and student update.", error);
      try {
        if (previousSubscriptions !== undefined) {
          if (previousSubscriptions === null) window.localStorage.removeItem(storageKey);
          else window.localStorage.setItem(storageKey, previousSubscriptions);
        }
        if (previousStudents !== undefined) {
          if (previousStudents === null) window.localStorage.removeItem(studentKey);
          else window.localStorage.setItem(studentKey, previousStudents);
        }
      } catch (rollbackError) {
        console.error("Unable to roll back payment changes.", rollbackError);
      }
      storageError.textContent = "تعذر حفظ الدفعة وتحديث ملف الطالب.";
      storageError.hidden = false;
      return false;
    }
  }

  function makeCell(text, className) {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function render() {
    const query = document.querySelector("#subscription-search").value.trim().toLocaleLowerCase("ar");
    const visible = subscriptions.filter((item) =>
      `${item.studentName} ${item.studentPhone} ${item.termName} ${item.academicYear}`
        .toLocaleLowerCase("ar").includes(query)
    );
    subscriptionRows.replaceChildren();

    for (const subscription of visible) {
      const row = document.createElement("tr");
      const studentCell = document.createElement("td");
      const student = document.createElement("div");
      student.className = "subscription-student";
      const name = document.createElement("strong");
      name.textContent = subscription.studentName;
      const phone = document.createElement("span");
      phone.textContent = subscription.studentPhone;
      phone.dir = "ltr";
      student.append(name, phone);
      studentCell.append(student);

      const paid = paidAmount(subscription);
      const remaining = subscription.priceCents - paid;
      const state = paymentState(subscription);
      const status = document.createElement("span");
      status.className = `payment-status ${state.className}`;
      status.textContent = state.label;
      const statusCell = document.createElement("td");
      statusCell.append(status);

      const action = document.createElement("button");
      action.className = "record-payment-button";
      action.type = "button";
      action.dataset.subscriptionId = String(subscription.id);
      action.disabled = remaining <= 0 || !storageReady;
      action.textContent = remaining > 0 ? "تسجيل دفعة" : "مكتمل";
      const actionCell = document.createElement("td");
      actionCell.append(action);

      const termCell = makeCell(`${subscription.termName} — ${subscription.academicYear}`);
      row.append(
        studentCell,
        termCell,
        makeCell(formatLocalDate(subscription.startDate)),
        makeCell(formatLocalDate(subscription.endDate)),
        makeCell(formatMoney(subscription.priceCents), "subscription-money"),
        makeCell(formatMoney(paid), "subscription-money"),
        makeCell(formatMoney(remaining), "subscription-money subscription-remaining"),
        statusCell,
        actionCell
      );
      subscriptionRows.append(row);
    }

    const noSubscriptions = subscriptions.length === 0;
    const noResults = !noSubscriptions && visible.length === 0;
    subscriptionsTable.hidden = noSubscriptions || noResults;
    document.querySelector("#subscriptions-empty").hidden = !noSubscriptions && !noResults;
    document.querySelector("#subscriptions-empty-title").textContent = noResults
      ? "مفيش نتائج مطابقة"
      : "لا توجد اشتراكات مسجلة";
    document.querySelector("#subscriptions-empty-description").textContent = noResults
      ? "جرّب البحث باسم طالب أو ترم مختلف."
      : "ستظهر اشتراكات الطلاب هنا لمتابعة السداد والدفعات.";

    const totalDue = subscriptions.reduce((sum, item) => sum + item.priceCents, 0);
    const totalCollected = subscriptions.reduce((sum, item) => sum + paidAmount(item), 0);
    document.querySelector("#total-subscriptions").textContent =
      new Intl.NumberFormat("ar-EG").format(subscriptions.length);
    document.querySelector("#total-due").textContent = formatMoney(totalDue);
    document.querySelector("#total-collected").textContent = formatMoney(totalCollected);
    document.querySelector("#total-remaining").textContent =
      formatMoney(totalDue - totalCollected);
  }

  function closePaymentDialog() {
    paymentDialog.close();
    paymentForm.reset();
    paymentError.textContent = "";
    activeSubscriptionId = null;
  }

  function openPaymentDialog(subscription) {
    activeSubscriptionId = subscription.id;
    paymentError.textContent = "";
    paymentForm.reset();
    const paid = paidAmount(subscription);
    document.querySelector("#payment-context").textContent =
      `${subscription.studentName} — ${subscription.termName} (${subscription.academicYear}) | المتبقي ${formatMoney(subscription.priceCents - paid)}`;
    const history = document.querySelector("#payment-history");
    history.replaceChildren();
    if (subscription.payments.length) {
      const title = document.createElement("strong");
      title.textContent = "الدفعات المسجلة";
      history.append(title);
      for (const payment of subscription.payments) {
        const entry = document.createElement("span");
        const date = new Date(payment.paidAt);
        const readableDate = Number.isNaN(date.getTime()) ? "" :
          new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
        entry.textContent = `${formatMoney(payment.amountCents)} — ${methodLabels[payment.method]}${readableDate ? ` — ${readableDate}` : ""}`;
        history.append(entry);
      }
    } else {
      history.textContent = "لا توجد دفعات سابقة.";
    }
    const amountInput = paymentForm.elements.amount;
    amountInput.max = String((subscription.priceCents - paid) / 100);
    paymentDialog.showModal();
    amountInput.focus();
  }

  subscriptionRows.addEventListener("click", (event) => {
    const button = event.target.closest(".record-payment-button");
    if (!button || button.disabled || !storageReady) return;
    const subscription = subscriptions.find(
      (item) => item.id === Number(button.dataset.subscriptionId)
    );
    if (subscription) openPaymentDialog(subscription);
  });

  document.querySelector("#subscription-search").addEventListener("input", render);
  document.querySelector("#close-payment-dialog").addEventListener("click", closePaymentDialog);
  document.querySelector("#cancel-payment").addEventListener("click", closePaymentDialog);
  paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) closePaymentDialog();
  });
  paymentDialog.addEventListener("cancel", () => {
    activeSubscriptionId = null;
    paymentForm.reset();
    paymentError.textContent = "";
  });

  paymentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    paymentError.textContent = "";
    if (!storageReady || !paymentForm.reportValidity()) return;
    const subscription = subscriptions.find((item) => item.id === activeSubscriptionId);
    if (!subscription) {
      paymentError.textContent = "الاشتراك غير موجود. حدّث الصفحة وحاول مرة أخرى.";
      return;
    }
    const amount = Number(paymentForm.elements.amount.value);
    const amountCents = Number.isFinite(amount)
      ? Math.round((amount + Number.EPSILON) * 100)
      : 0;
    const remaining = subscription.priceCents - paidAmount(subscription);
    const method = String(paymentForm.elements.method.value);
    if (amountCents < 1 || amountCents > remaining || !Object.hasOwn(methodLabels, method)) {
      paymentError.textContent = `أدخل مبلغًا أكبر من صفر ولا يتجاوز ${formatMoney(remaining)}.`;
      return;
    }
    const payment = {
      amountCents,
      method,
      paidAt: new Date().toISOString(),
      receiptNumber: `VOTA-${subscription.studentId}-${subscription.id}-${subscription.payments.length + 1}`,
    };
    const updatedSubscriptions = subscriptions.map((item) =>
      item.id === subscription.id
        ? {
            ...item,
            payments: [...item.payments, payment],
          }
        : item
    );
    if (!persistPayment(updatedSubscriptions, subscription.studentId)) {
      paymentError.textContent = "لم يتم حفظ الدفعة. حاول مرة أخرى.";
      return;
    }
    subscriptions = updatedSubscriptions;
    closePaymentDialog();
    render();
    printReceipt({
      id: subscription.studentId,
      name: subscription.studentName,
      phone: subscription.studentPhone,
    }, subscription, payment);
  });

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      const valid = Array.isArray(parsed) && parsed.every((item) =>
        item && Number.isSafeInteger(item.id) && item.id > 0 &&
        typeof item.studentName === "string" && typeof item.studentPhone === "string" &&
        typeof item.termName === "string" && typeof item.academicYear === "string" &&
        Number.isSafeInteger(item.priceCents) && item.priceCents > 0 &&
        Array.isArray(item.payments) && item.payments.every((payment) =>
          payment && Number.isSafeInteger(payment.amountCents) && payment.amountCents > 0 &&
          Object.hasOwn(methodLabels, payment.method) &&
          typeof payment.paidAt === "string" &&
          (payment.receiptNumber === undefined || typeof payment.receiptNumber === "string")
        ) && item.payments.reduce((sum, payment) => sum + payment.amountCents, 0) <= item.priceCents
      );
      if (!valid || new Set(parsed.map((item) => item.id)).size !== parsed.length) {
        throw new TypeError("Saved subscription data has an invalid format.");
      }
      subscriptions = parsed;
    }
  } catch (error) {
    showStorageError("تعذر تحميل الاشتراكات. لم يتم تعديلها.", error);
  }

  render();
}

async function initializeApplication() {
  try {
    const shouldInitialize = await window.votaData.initialize();
    initializeDateTime();
    initializeSessionLogout();
    initializeLogin();
    if (!shouldInitialize) return;
    initializeStudents();
    initializeSettings();
    initializeSubscriptions();
    initializeStudentPortal();
    initializeStudentFile();
    initializeTripScheduleManager();
    initializeTripAdmin();
  } catch (error) {
    console.error("Unable to initialize the Supabase application.", error);
    const message = document.querySelector("#form-message") ||
      document.querySelector("#portal-message") ||
      document.querySelector("#admin-trips-error") ||
      document.querySelector("#storage-message") ||
      document.querySelector("#settings-storage-error") ||
      document.querySelector("#subscriptions-storage-error");
    const text = "تعذر الاتصال بـSupabase أو التحقق من صلاحيات الحساب. راجع إعداد المشروع ثم حاول مرة أخرى.";
    if (message) {
      message.textContent = text;
      message.hidden = false;
    } else {
      window.votaData?.showError(text);
    }
  }
}

initializeApplication();
