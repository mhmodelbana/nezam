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

function registerGuardedSubmit(form, handler) {
  let isSubmitting = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    const submitButtons = [...form.querySelectorAll(
      'button[type="submit"], button:not([type]), input[type="submit"]'
    )];
    const disabledStates = submitButtons.map((button) => button.disabled);
    submitButtons.forEach((button) => {
      button.disabled = true;
    });

    try {
      await handler(event);
    } finally {
      submitButtons.forEach((button, index) => {
        button.disabled = disabledStates[index];
      });
      isSubmitting = false;
    }
  });
}

function initializeSessionLogout() {
  for (const link of document.querySelectorAll(".logout-link")) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      const destination = link.href;
      try {
        await window.votaData.signOut();
        window.location.assign(destination);
      } catch (error) {
        console.error("Unable to sign out from Supabase.", error);
        window.votaData.showError("تعذر تسجيل الخروج. حاول مرة أخرى.");
      }
    });
  }
}

async function initializeLogin() {
  const loginForm = document.querySelector("#login-form");
  if (!loginForm) return;

  const setupMessage = document.querySelector("#admin-setup-message");
  const passwordInput = document.querySelector("#password");
  const passwordToggle = document.querySelector("#password-toggle");
  const usernameInput = document.querySelector("#username");
  const formMessage = document.querySelector("#form-message");
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const submitLabel = submitButton.querySelector("span") || submitButton;
  const defaultSubmitLabel = submitLabel.textContent;

  try {
    const hasAdministrator = await window.votaData.hasAdministrator();
    loginForm.hidden = !hasAdministrator;
    if (setupMessage) setupMessage.hidden = hasAdministrator;
  } catch (error) {
    console.error("Unable to check Supabase administrator setup.", error);
    formMessage.textContent = "تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات Supabase.";
    formMessage.hidden = false;
    loginForm.hidden = true;
    return;
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
    formMessage.hidden = true;
    submitButton.disabled = true;
    submitLabel.textContent = "جاري تسجيل الدخول...";

    try {
      const loginName = usernameInput.value.trim();
      const profile = await window.votaData.signIn(loginName, passwordInput.value);
      if (!profile) {
        formMessage.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
        formMessage.hidden = false;
        submitButton.disabled = false;
        submitLabel.textContent = defaultSubmitLabel;
        return;
      }

      if (profile.role === "admin" && profile.student_id === null) {
        window.location.assign("dashboard.html");
      } else if (profile.role === "student" && Number.isSafeInteger(profile.student_id)) {
        window.location.assign("portal.html");
      } else {
        await window.votaData.signOut();
        formMessage.textContent = "صلاحية الحساب غير صحيحة. تواصل مع الإدارة.";
        formMessage.hidden = false;
        submitButton.disabled = false;
        submitLabel.textContent = defaultSubmitLabel;
      }
    } catch (error) {
      console.error("Unable to authenticate with Supabase.", error);
      formMessage.textContent = "حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.";
      formMessage.hidden = false;
      submitButton.disabled = false;
      submitLabel.textContent = defaultSubmitLabel;
    }
  });

}

const subscriptionExpiryAlertDays = 15;
let tripDirectionLabels = { outbound: "ذهاب للجامعة", return: "عودة" };
let currentSystemSettings = {
  companyName: "",
  companyPhone: "",
  companyAddress: "",
  logoDataUrl: "",
  primaryColor: "#174b55",
  tripLabels: { ...tripDirectionLabels },
  pickupAreas: [],
};
const tripStatusLabels = {
  pending: "مسجل",
  approved: "مسجل",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function studentUsername(studentId) {
  return `VT-${String(studentId).padStart(4, "0")}`;
}

function normalizePhoneNumber(phone) {
  return String(phone ?? "").replace(/\D/g, "");
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

async function readTripSchedules() {
  return await window.votaAPI.getTripSchedules();
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

async function isStudentEligibleForTrips(student, tripDate = localDateString()) {
  if (student.subscription !== "active" || student.archivedAt) return false;

  const subscriptions = await window.votaAPI.getSubscriptions();
  const terms = await window.votaAPI.getTerms();

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

function darkenHexColor(color, factor = .76) {
  const channels = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!channels) return "#103840";
  return `#${channels.slice(1).map((channel) =>
    Math.round(Number.parseInt(channel, 16) * factor).toString(16).padStart(2, "0")
  ).join("")}`;
}

async function applySystemSettings(settings = null) {
  currentSystemSettings = settings || await window.votaAPI.getSystemSettings();
  currentSystemSettings.companyName = typeof currentSystemSettings.companyName === "string"
    ? currentSystemSettings.companyName.trim()
    : "";
  const companyName = currentSystemSettings.companyName;
  tripDirectionLabels = { ...currentSystemSettings.tripLabels };
  const primaryColor = currentSystemSettings.primaryColor;
  document.documentElement.style.setProperty("--green", primaryColor);
  document.documentElement.style.setProperty("--green-dark", darkenHexColor(primaryColor));
  document.documentElement.style.setProperty("--teal", primaryColor);

  document.title = document.title
    .replace(/\s*[|·]\s*\{\{companyName\}\}/g, companyName ? ` | ${companyName}` : "")
    .replace(/\{\{companyName\}\}/g, companyName);
  document.querySelectorAll('meta[name="description"]').forEach((meta) => {
    meta.content = meta.content
      .replace(/\s*\{\{companyName\}\}/g, companyName ? ` ${companyName}` : "")
      .replace(/\s+([.,،])/g, "$1")
      .trim();
  });
  document.querySelectorAll("[data-company-name]").forEach((element) => {
    element.textContent = companyName;
  });
  document.documentElement.classList.add("company-name-loaded");

  document.querySelectorAll(".brand, .login-brand, .login-mobile-label").forEach((brand) => {
    const mark = brand.querySelector(".brand-mark");
    const name = [...brand.children].find((child) => child !== mark && child.tagName === "SPAN");
    if (name) name.textContent = currentSystemSettings.companyName;
    if (!mark) return;
    if (currentSystemSettings.logoDataUrl) {
      const image = document.createElement("img");
      image.className = "brand-logo-image";
      image.alt = "";
      image.src = currentSystemSettings.logoDataUrl;
      image.onerror = () => {
        mark.hidden = true;
      };
      mark.hidden = false;
      mark.replaceChildren(image);
    } else if (mark.hasAttribute("data-company-logo")) {
      mark.replaceChildren();
      mark.hidden = true;
    } else {
      mark.textContent = "v.";
    }
  });

  const pickupOptions = document.querySelector("#student-pickup-options");
  if (pickupOptions) {
    pickupOptions.replaceChildren(...currentSystemSettings.pickupAreas.map((area) => {
      const option = document.createElement("option");
      option.value = area;
      return option;
    }));
  }
  document.querySelectorAll('select[name="direction"] option').forEach((option) => {
    if (Object.hasOwn(tripDirectionLabels, option.value)) {
      option.textContent = tripDirectionLabels[option.value];
    }
  });
  document.querySelectorAll("[data-trip-direction-label]").forEach((element) => {
    const label = tripDirectionLabels[element.dataset.tripDirectionLabel];
    if (label) element.textContent = label;
  });
  document.querySelectorAll("[data-trip-direction-schedule]").forEach((element) => {
    const label = tripDirectionLabels[element.dataset.tripDirectionSchedule];
    if (label) element.textContent = `مواعيد ${label}`;
  });
  document.querySelectorAll("[data-trip-direction]").forEach((element) => {
    const label = tripDirectionLabels[element.dataset.tripDirection];
    if (label) element.textContent = label;
  });
  document.querySelectorAll("[data-admin-direction]").forEach((button) => {
    const label = tripDirectionLabels[button.dataset.adminDirection];
    if (!label) return;
    const textNode = [...button.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${label}`;
  });
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
  const companyContact = [
    currentSystemSettings.companyPhone && `هاتف: ${currentSystemSettings.companyPhone}`,
    currentSystemSettings.companyAddress && `العنوان: ${currentSystemSettings.companyAddress}`,
  ]
    .filter(Boolean)
    .map((value) => `<small>${escapeHtml(value)}</small>`)
    .join("");
  const logo = currentSystemSettings.logoDataUrl
    ? `<img src="${escapeHtml(currentSystemSettings.logoDataUrl)}" alt="" style="width:100%;height:100%;object-fit:contain">`
    : "v.";
  const markup = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>إيصال ${escapeHtml(receiptNumber)}</title><style>
    @page{size:A4 portrait;margin:14mm}
    *{box-sizing:border-box}
    body{font-family:Tahoma,Arial,sans-serif;color:#263d35;margin:0;padding:0;background:#fff}
    main{max-width:760px;margin:0 auto}
    header{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:2px solid #24483f;padding-bottom:16px}
    .brand{display:flex;align-items:center;gap:10px;direction:ltr;text-align:left}
    .logo{display:grid;width:40px;height:40px;place-items:center;border:1.5px solid #315c4f;border-radius:10px;color:#24483f;font-size:20px;font-weight:800}
    h1{font-size:18px;margin:0;color:#24483f}.brand small{display:block;margin-top:4px;color:#65756e;font-size:11px;direction:rtl}
    .receipt-title{text-align:left}.receipt-title strong{display:block;color:#193b32;font-size:16px}.receipt-title span{display:block;margin-top:5px;color:#687970;font-size:11px}.receipt-no{direction:ltr}
    dl{display:grid;grid-template-columns:1fr 1fr;gap:0;margin:20px 0;border:1px solid #d5dfd9;border-radius:8px;overflow:hidden}
    dl>div{min-height:62px;padding:10px 12px;border-bottom:1px solid #d5dfd9}
    dl>div:nth-child(odd){border-left:1px solid #d5dfd9}
    dl>div:nth-last-child(-n+2){border-bottom:0}
    dt{font-size:10px;color:#687970}dd{margin:6px 0 0;color:#24483f;font-size:12px;font-weight:700}
    .amount{padding:16px;border:1px solid #d5dfd9;border-radius:8px;background:#f4f8f5;text-align:center;color:#52675e;font-size:12px}
    .amount strong{display:block;color:#24483f;font-size:23px;margin-top:7px}
    footer{margin-top:22px;padding-top:10px;border-top:1px solid #d5dfd9;text-align:center;color:#687970;font-size:10px}
    @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><main><header><div class="brand"><span class="logo" aria-hidden="true">${logo}</span><span><h1>${escapeHtml(currentSystemSettings.companyName)}</h1><small>إيصال إلكتروني</small>${companyContact}</span></div><div class="receipt-title"><strong>إيصال استلام دفعة اشتراك</strong><span>رقم الإيصال: <b class="receipt-no">${escapeHtml(receiptNumber)}</b></span></div></header>
  <dl><div><dt>اسم الطالب</dt><dd>${escapeHtml(student.name)}</dd></div><div><dt>كود الطالب</dt><dd dir="ltr">${escapeHtml(studentUsername(student.id))}</dd></div>
  <div><dt>الترم</dt><dd>${escapeHtml(`${subscription.termName} — ${subscription.academicYear}`)}</dd></div><div><dt>تاريخ الدفع</dt><dd>${escapeHtml(paidDate)}</dd></div>
  <div><dt>طريقة الدفع</dt><dd>${escapeHtml(methodLabels[payment.method] || "أخرى")}</dd></div><div><dt>رقم الهاتف</dt><dd dir="ltr">${escapeHtml(student.phone)}</dd></div></dl>
  <section class="amount">المبلغ المستلم<strong>${escapeHtml(new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(payment.amountCents / 100))} ج.م</strong></section>
  <footer>شكرًا لاختياركم ${escapeHtml(currentSystemSettings.companyName)}</footer></main></body></html>`;
  printWindow.document.open();
  printWindow.document.write(markup);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
}

function generateTemporaryPassword() {
  const password = [];
  while (password.length < 8) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) {
      if (byte < 250) password.push(String(byte % 10));
      if (password.length === 8) break;
    }
  }
  return password.join("");
}

async function readStudentRecords() {
  return await window.votaAPI.getStudents();
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

async function readTripRequests() {
  return await window.votaAPI.getTripRequests();
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

  if (window.votaData.role !== "admin") {
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
      directionCell.dataset.tripDirectionLabel = schedule.direction;
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

  async function render() {
    try {
      renderSchedules(await readTripSchedules());
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

  registerGuardedSubmit(form, async () => {
    error.textContent = "";
    error.hidden = true;
    if (!form.reportValidity()) return;

    try {
      const schedules = await readTripSchedules();
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

      if (current) {
        await window.votaAPI.updateTripSchedule(editingId, {
          direction,
          time,
          active: current.active,
        });
      } else {
        await window.votaAPI.createTripSchedule({
          direction,
          time,
          active: true,
        });
      }

      resetForm();
      render();
    } catch (saveError) {
      console.error("Unable to save trip schedule.", saveError);
      error.textContent = "تعذر حفظ الموعد. تحقق من بيانات المواعيد وحاول مرة أخرى.";
      error.hidden = false;
    }
  });

  cancelEditButton.addEventListener("click", resetForm);
  rows.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-schedule-id]");
    if (!button) return;
    const scheduleId = Number(button.dataset.scheduleId);
    const action = button.dataset.scheduleAction;
    try {
      const schedules = await readTripSchedules();
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

      if (action === "toggle") {
        await window.votaAPI.toggleTripSchedule(scheduleId);
      } else if (action === "delete") {
        await window.votaAPI.deleteTripSchedule(scheduleId);
      }

      if (Number(form.elements.scheduleId.value) === scheduleId) resetForm();
      render();
    } catch (updateError) {
      console.error("Unable to update trip schedule.", updateError);
      error.textContent = "تعذر تحديث الموعد.";
      error.hidden = false;
    }
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
  let visibleManifestEntries = [];

  if (window.votaData.role !== "admin") {
    error.textContent = "سجّل دخولك للإدارة لعرض مواعيد الرحلات.";
    error.hidden = false;
    scheduleList.hidden = true;
    return;
  }

  const today = localDateString();
  dateInput.value = today;

  function pickupFor(request, student) {
    return request.pickup || student?.pickup || "منطقة غير محددة";
  }

  function formatRegistrationTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "غير محدد"
      : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function downloadTripCsv(filename, headers, rows) {
    const csvCell = (value) => {
      const text = String(value ?? "");
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csv = `\uFEFF${[headers, ...rows].map((row) =>
      row.map(csvCell).join(",")
    ).join("\r\n")}`;
    const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const downloadLink = document.createElement("a");
    downloadLink.href = fileUrl;
    downloadLink.download = filename;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }

  async function render() {
    try {
      const students = await readStudentRecords();
      const requests = await readTripRequests();
      const schedules = await readTripSchedules();
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
        visibleManifestEntries = [];
        manifest.hidden = true;
        error.hidden = true;
        return;
      }

      manifest.hidden = false;
      const directionLabel = tripDirectionLabels[selectedGroup.direction];
      const tripTimeLabel = formatTripTime(selectedGroup.time);
      const tripDateLabel = formatLocalDate(selectedDate);
      manifestTitle.textContent = `${directionLabel} — ${tripTimeLabel}`;
      manifestDate.textContent = tripDateLabel;
      document.querySelector("#trip-print-trip-title").textContent =
        `${directionLabel} — ${tripTimeLabel}`;
      document.querySelector("#trip-print-date").textContent = tripDateLabel;
      document.querySelector("#trip-print-direction").textContent = directionLabel;
      document.querySelector("#trip-print-time").textContent = tripTimeLabel;
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
      visibleManifestEntries = visibleRequests.map((request) => ({
        request,
        student: studentById.get(request.studentId),
      }));

      studentRows.replaceChildren();
      for (const [index, request] of visibleRequests.entries()) {
        const student = studentById.get(request.studentId);
        const row = document.createElement("tr");
        const numberCell = document.createElement("td");
        numberCell.className = "trip-print-number";
        numberCell.textContent = arabicNumber(index + 1);
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
        const registrationTimeCell = document.createElement("td");
        registrationTimeCell.textContent = formatRegistrationTime(request.createdAt);
        row.append(
          numberCell,
          nameCell,
          codeCell,
          pickupCell,
          phoneCell,
          schoolCell,
          registrationTimeCell
        );
        studentRows.append(row);
      }
      document.querySelector("#admin-trip-manifest-count").textContent =
        `${arabicNumber(visibleRequests.length)} من ${arabicNumber(selectedGroup.requests.length)} طالب`;
      document.querySelector("#trip-print-count").textContent =
        arabicNumber(visibleRequests.length);
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
  pickupInput.addEventListener("change", () => render());
  searchInput.addEventListener("input", () => render());
  document.querySelector("#export-selected-trip").addEventListener("click", () => {
    try {
      const rows = visibleManifestEntries.map(({ request, student }) => {
        return [
          request.studentName || student?.name || "",
          student ? studentUsername(student.id) : request.studentId,
          pickupFor(request, student),
          request.tripDate,
          request.tripTime,
          formatRegistrationTime(request.createdAt),
          request.status === "cancelled" ? "ملغي" : "مسجل",
        ];
      });
      downloadTripCsv(
        `vota-trip-manifest-${dateInput.value}-${selectedDirection}.csv`,
        ["اسم الطالب", "كود الطالب", "منطقة الركوب", "تاريخ الرحلة", "موعد الرحلة", "موعد التسجيل", "حالة الحجز"],
        rows
      );
      error.hidden = true;
    } catch (exportError) {
      console.error("Unable to export trip manifest.", exportError);
      error.textContent = "تعذر تصدير كشف الرحلة. حاول مرة أخرى.";
      error.hidden = false;
    }
  });
  const printWithScope = (className) => {
    document.body.classList.add(className);
    try {
      window.print();
    } finally {
      document.body.classList.remove(className);
    }
  };
  document.querySelector("#print-trip-manifest").addEventListener("click", () =>
    printWithScope("is-printing-trip-day")
  );
  document.querySelector("#print-selected-trip").addEventListener("click", () =>
    printWithScope("is-printing-trip-manifest")
  );
  render();
}
async function initializeStudentPortal() {
  const page = document.querySelector("#student-portal");
  if (!page) return;

  const message = document.querySelector("#portal-message");
  const passwordForm = document.querySelector("#portal-password-form");
  const passwordSection = document.querySelector("#portal-password-section");
  const profileSection = document.querySelector("#portal-profile");
  const passwordError = document.querySelector("#portal-password-error");
  const appNavigation = document.querySelector(".student-app-nav");
  const profileEditForm = document.querySelector("#portal-profile-edit");
  const profileEditToggle = document.querySelector("#toggle-portal-profile-edit");
  const profileEditMessage = document.querySelector("#portal-profile-edit-message");
  const profilePhotoInput = document.querySelector("#portal-profile-photo-input");
  const profilePhotoPreview = document.querySelector("#portal-profile-photo-preview");
  const profilePhotoEmpty = document.querySelector("#portal-profile-photo-empty");
  const removeProfilePhotoButton = document.querySelector("#remove-portal-profile-photo");
  let selectedProfilePhotoDataUrl = null;
  const notificationList = document.querySelector("#portal-notification-list");
  const notificationCount = document.querySelector("#portal-notification-count");
  const notificationEmpty = document.querySelector("#portal-notifications-empty");
  const notificationMore = document.querySelector("#portal-notifications-more");
  const notificationError = document.querySelector("#portal-notifications-error");
  const markNotificationsButton = document.querySelector("#mark-portal-notifications-read");
  const notificationDialog = document.querySelector("#portal-notifications-dialog");
  const notificationTrigger = document.querySelector("#open-portal-notifications");
  const closeNotificationsButton = document.querySelector("#close-portal-notifications");
  const sectionName = page.dataset.portalSection;
  const homePhotoPlaceholder = page.querySelector("#portal-home-photo-placeholder");
  const homePhotoMark = page.querySelector("#portal-home-photo-mark");
  if (homePhotoPlaceholder) {
    homePhotoPlaceholder.hidden = false;
    homePhotoPlaceholder.dataset.portalLoading = "true";
    if (homePhotoMark) homePhotoMark.hidden = true;
  }
  page.querySelectorAll(
    ".portal-details dd, #portal-student-name, #trip-page-date, #trip-page-pickup, #trip-page-eligibility, #portal-payment-history"
  ).forEach((element) => {
    element.dataset.portalLoading = "true";
  });
  if (notificationList) notificationList.dataset.portalLoading = "true";

  if (window.votaData.role !== "student" || !window.votaData.studentId) {
    message.textContent = "سجّل دخولك بحساب الطالب لعرض ملفك.";
    message.hidden = false;
    page.querySelectorAll("[data-portal-loading]").forEach((element) => {
      delete element.dataset.portalLoading;
    });
    return;
  }

  profileSection.hidden = false;
  let students;
  try {
    students = await readStudentRecords();
  } catch (error) {
    console.error("Unable to load the student portal profile.", error);
    message.textContent = "تعذر تحميل بيانات الحساب.";
    message.hidden = false;
    profileSection.hidden = true;
    page.querySelectorAll("[data-portal-loading]").forEach((element) => {
      delete element.dataset.portalLoading;
    });
    return;
  }
  const student = students.find((record) => record.id === window.votaData.studentId);
  if (!student || student.archivedAt) {
    message.textContent = "الحساب غير متاح. سجّل الدخول مرة أخرى.";
    message.hidden = false;
    profileSection.hidden = true;
    page.querySelectorAll("[data-portal-loading]").forEach((element) => {
      delete element.dataset.portalLoading;
    });
    return;
  }

  const formatMoney = (cents) =>
    `${new Intl.NumberFormat("ar-EG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)} ج.م`;
  function setText(id, value) {
    const element = document.querySelector(`#${id}`);
    if (element) {
      element.textContent = value ?? "";
      delete element.dataset.portalLoading;
    }
  }

  function updateHome() {
    setText("portal-student-name", student.name);
    const photo = document.querySelector("#portal-home-student-photo");
    const placeholder = document.querySelector("#portal-home-photo-placeholder");
    const logo = document.querySelector("#portal-home-photo-logo");
    const mark = document.querySelector("#portal-home-photo-mark");
    if (!photo || !placeholder || !logo || !mark) return;

    const photoDataUrl = typeof student.photoDataUrl === "string" ? student.photoDataUrl : "";
    let hasCompanyLogo = Boolean(currentSystemSettings.logoDataUrl);
    const showPlaceholder = () => {
      photo.hidden = true;
      placeholder.hidden = !hasCompanyLogo;
    };
    photo.onload = () => {
      delete photo.dataset.portalLoading;
    };
    photo.onerror = () => {
      delete photo.dataset.portalLoading;
      showPlaceholder();
    };
    logo.onerror = () => {
      logo.hidden = true;
      mark.hidden = true;
      hasCompanyLogo = false;
      if (photo.hidden) placeholder.hidden = true;
    };
    if (photoDataUrl) {
      placeholder.hidden = true;
      photo.hidden = false;
      photo.dataset.portalLoading = "true";
      photo.src = photoDataUrl;
    } else {
      photo.removeAttribute("src");
      delete photo.dataset.portalLoading;
      showPlaceholder();
    }

    if (currentSystemSettings.logoDataUrl) {
      logo.src = currentSystemSettings.logoDataUrl;
      logo.hidden = false;
      mark.hidden = true;
    } else {
      logo.removeAttribute("src");
      logo.hidden = true;
      mark.hidden = true;
    }
    delete placeholder.dataset.portalLoading;
  }

  async function updateNotifications() {
    if (!notificationList || !notificationCount || !notificationEmpty || !notificationMore || !notificationError) return;
    try {
      const [subscriptions, tripRequests] = await Promise.all([
        window.votaAPI.getStudentSubscriptions(student.id),
        window.votaAPI.getStudentTripRequests(student.id),
      ]);
      const events = subscriptions.flatMap((subscription) =>
        subscription.payments.map((payment) => ({
          id: `payment:${subscription.id}:${payment.id || payment.receiptNumber}`,
          type: "payment",
          timestamp: payment.paidAt || "",
          title: "تم تسجيل دفعة على اشتراكك",
          description: `${subscription.termName || "الاشتراك"} — ${formatMoney(payment.amountCents)}${payment.receiptNumber ? ` · إيصال ${payment.receiptNumber}` : ""}`,
          date: payment.paidAt,
        }))
      );
      const tripStatusLabels = {
        pending: "قيد المراجعة",
        approved: "تم تأكيد الحجز",
        rejected: "لم يتم قبول الحجز",
        cancelled: "تم إلغاء الحجز",
      };
      tripRequests.forEach((request) => {
        const direction = tripDirectionLabels[request.tripType] || "رحلة";
        const date = request.tripDate ? formatLocalDate(request.tripDate) : "موعد غير محدد";
        const time = request.tripTime ? formatTripTime(request.tripTime) : "";
        events.push({
          id: `trip:${request.id}`,
          type: "trip",
          timestamp: request.updatedAt || request.createdAt || "",
          title: tripStatusLabels[request.status] || "تحديث على حجز الرحلة",
          description: `${direction} · ${date}${time ? ` · ${time}` : ""}`,
          date: request.updatedAt || request.createdAt,
        });
      });
      events.sort((first, second) =>
        Date.parse(second.timestamp || "") - Date.parse(first.timestamp || "")
      );

      const notificationState = await window.votaAPI.getStudentNotificationState(student.id);
      const dismissedIds = Array.isArray(notificationState.dismissed)
        ? notificationState.dismissed
        : [];
      if (dismissedIds.some((id) => typeof id !== "string")) {
        throw new Error("Stored dismissed notification data is invalid.");
      }
      const activeEvents = events.filter((event) => !dismissedIds.includes(event.id));
      let lastSeen = Number(notificationState.lastSeen);
      if (!Number.isFinite(lastSeen) || lastSeen <= 0) {
        lastSeen = Date.now();
        await window.votaAPI.updateStudentNotificationState(student.id, {
          lastSeen,
          dismissed: dismissedIds,
        });
      }
      const unreadCount = activeEvents.filter((item) =>
        Number.isFinite(Date.parse(item.timestamp || "")) &&
        Date.parse(item.timestamp) > lastSeen
      ).length;
      const visibleEventsCount = window.innerHeight < 560 ? 2 : window.innerWidth <= 600 ? 3 : 4;
      notificationCount.textContent = new Intl.NumberFormat("ar-EG").format(unreadCount);
      notificationCount.hidden = unreadCount === 0;
      if (markNotificationsButton) markNotificationsButton.hidden = unreadCount === 0;
      if (notificationTrigger) {
        notificationTrigger.setAttribute(
          "aria-label",
          unreadCount > 0
            ? `فتح التنبيهات، ${new Intl.NumberFormat("ar-EG").format(unreadCount)} غير مقروء`
            : "فتح التنبيهات"
        );
      }
      notificationList.replaceChildren();

      activeEvents.slice(0, visibleEventsCount).forEach((event) => {
        const item = document.createElement("li");
        const unread = Date.parse(event.timestamp || "") > lastSeen;
        item.className = `portal-notification-item${unread ? " is-unread" : ""}`;
        const icon = document.createElement("span");
        icon.className = `portal-notification-icon is-${event.type}`;
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = event.type === "payment" ? "ج" : "↗";
        const content = document.createElement("span");
        content.className = "portal-notification-content";
        const title = document.createElement("strong");
        title.textContent = event.title;
        const description = document.createElement("span");
        description.textContent = event.description;
        const date = document.createElement("small");
        const parsedDate = new Date(event.date || "");
        date.textContent = Number.isNaN(parsedDate.getTime())
          ? "تاريخ غير محدد"
          : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(parsedDate);
        content.append(title, description, date);
        const dismissButton = document.createElement("button");
        dismissButton.className = "portal-notification-dismiss";
        dismissButton.type = "button";
        dismissButton.setAttribute("aria-label", `حذف التنبيه: ${event.title}`);
        dismissButton.title = "حذف التنبيه";
        dismissButton.hidden = unread;
        dismissButton.innerHTML = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.5 0 .6 10h7.8L15 6M8 6V4h4v2m-3 3v4m2-4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        dismissButton.addEventListener("click", async () => {
          try {
            const latestState = await window.votaAPI.getStudentNotificationState(student.id);
            const latestDismissedIds = Array.isArray(latestState.dismissed)
              ? latestState.dismissed
              : [];
            if (latestDismissedIds.some((id) => typeof id !== "string")) {
              throw new Error("Stored dismissed notification data is invalid.");
            }
            if (!latestDismissedIds.includes(event.id)) latestDismissedIds.push(event.id);
            await window.votaAPI.updateStudentNotificationState(student.id, {
              lastSeen: latestState.lastSeen,
              dismissed: latestDismissedIds,
            });
            await updateNotifications();
          } catch (error) {
            console.error("Unable to dismiss student notification.", error);
            notificationError.textContent = "تعذر حذف التنبيه على هذا الجهاز.";
            notificationError.hidden = false;
          }
        });
        item.append(icon, content, dismissButton);
        notificationList.append(item);
      });
      notificationEmpty.hidden = activeEvents.length > 0;
      notificationMore.textContent = `يعرض أحدث ${new Intl.NumberFormat("ar-EG").format(visibleEventsCount)} تحديثات.`;
      notificationMore.hidden = activeEvents.length <= visibleEventsCount;
      notificationError.hidden = true;
      delete notificationList.dataset.portalLoading;
    } catch (error) {
      console.error("Unable to load student notifications.", error);
      notificationError.textContent = "تعذر تحميل التحديثات. حاول تحديث الصفحة.";
      notificationError.hidden = false;
      notificationEmpty.hidden = true;
      delete notificationList.dataset.portalLoading;
    }
  }

  async function updatePersonal() {
    const values = {
      "portal-student-name": student.name,
      "portal-student-code": studentUsername(student.id),
      "portal-phone": student.phone,
      "portal-pickup": student.pickup,
      "portal-university": student.university,
      "portal-faculty": student.faculty,
      "portal-study-year": student.studyYear,
      "portal-emergency-phone": student.emergencyPhone,
      "portal-student-status": ({
        active: "نشط",
        pending: "بانتظار التفعيل",
        inactive: "غير نشط",
        paused: "متوقف مؤقتًا",
        withdrawn: "منسحب",
        expired: "منتهي الاشتراك",
      })[student.subscription],
    };
    for (const [id, value] of Object.entries(values)) setText(id, value);
    const photo = document.querySelector("#portal-student-photo");
    const photoPlaceholder = document.querySelector("#portal-student-photo-placeholder");
    const photoLogo = document.querySelector("#portal-student-photo-logo");
    const photoMark = document.querySelector("#portal-student-photo-mark");
    if (photo && photoPlaceholder && photoLogo && photoMark) {
      const photoDataUrl = typeof student.photoDataUrl === "string" ? student.photoDataUrl : "";
      let hasCompanyLogo = Boolean(currentSystemSettings.logoDataUrl);
      const showPlaceholder = () => {
        photo.hidden = true;
        photoPlaceholder.hidden = !hasCompanyLogo;
      };
      photo.onload = () => {
        delete photo.dataset.portalLoading;
      };
      photo.onerror = () => {
        delete photo.dataset.portalLoading;
        showPlaceholder();
      };
      photoLogo.onerror = () => {
        photoLogo.hidden = true;
        photoMark.hidden = true;
        hasCompanyLogo = false;
        if (photo.hidden) photoPlaceholder.hidden = true;
      };
      if (photoDataUrl) {
        photoPlaceholder.hidden = true;
        photo.hidden = false;
        photo.dataset.portalLoading = "true";
        photo.src = photoDataUrl;
      } else {
        photo.removeAttribute("src");
        delete photo.dataset.portalLoading;
        showPlaceholder();
      }
      if (currentSystemSettings.logoDataUrl) {
        photoLogo.src = currentSystemSettings.logoDataUrl;
        photoLogo.hidden = false;
        photoMark.hidden = true;
      } else {
        photoLogo.removeAttribute("src");
        photoLogo.hidden = true;
        photoMark.hidden = true;
      }
      delete photo.closest("dd")?.dataset.portalLoading;
    }
    try {
      const terms = await window.votaAPI.getTerms();
      const term = terms.find((record) => record.id === student.termId);
      setText(
        "portal-student-term",
        term ? `${term.name} — ${term.academicYear}` : ""
      );
    } catch (error) {
      console.error("Unable to load the student term for the profile.", error);
      setText("portal-student-term", "تعذر تحميل بيانات الترم.");
    }
    if (profileEditForm) {
      if (profilePhotoPreview && profilePhotoEmpty) {
        profilePhotoPreview.hidden = !student.photoDataUrl;
        profilePhotoEmpty.hidden = Boolean(student.photoDataUrl);
        if (student.photoDataUrl) profilePhotoPreview.src = student.photoDataUrl;
        else profilePhotoPreview.removeAttribute("src");
      }
      const fields = {
        name: student.name,
        phone: student.phone,
        pickup: student.pickup,
        university: student.university,
        faculty: student.faculty,
        studyYear: student.studyYear,
        emergencyPhone: student.emergencyPhone,
      };
      for (const [field, value] of Object.entries(fields)) {
        profileEditForm.elements[field].value = value || "";
      }
    }
  }

  async function updateSubscription() {
    let subscriptions;
    try {
      const allSubscriptions = await window.votaAPI.getSubscriptions();
      subscriptions = allSubscriptions.filter(
        (record) => record.studentId === student.id
      );
    } catch (error) {
      console.error("Unable to load student subscription details.", error);
      message.textContent = "تعذر تحميل بيانات الاشتراك.";
      message.hidden = false;
      page.querySelectorAll(".portal-details dd[data-portal-loading]").forEach((element) => {
        delete element.dataset.portalLoading;
      });
      const empty = document.querySelector("#portal-no-payments");
      if (empty) empty.hidden = true;
      const history = document.querySelector("#portal-payment-history");
      if (history) delete history.dataset.portalLoading;
      return;
    }
    const currentSubscription = subscriptions.find(
      (record) => record.termId === student.termId
    );
    const paidTotal = currentSubscription
      ? currentSubscription.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
      : 0;
    setText("portal-student-name", student.name);
    setText("portal-term", currentSubscription
      ? [currentSubscription.termName, currentSubscription.academicYear].filter(Boolean).join(" — ")
      : "");
    setText("portal-price", currentSubscription ? formatMoney(currentSubscription.priceCents) : "");
    setText("portal-payment-status", currentSubscription
      ? paidTotal === 0
        ? "غير مدفوع"
        : paidTotal >= currentSubscription.priceCents
          ? "مدفوع بالكامل"
          : "مدفوع جزئيًا"
      : "");
    setText("portal-paid", currentSubscription ? formatMoney(paidTotal) : "");
    setText("portal-remaining", currentSubscription
      ? formatMoney(Math.max(0, currentSubscription.priceCents - paidTotal))
      : "");

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
    delete history.dataset.portalLoading;
  }

  async function updateTripPage() {
    setText("trip-pickup-location", student.pickup);
    const cards = document.querySelector("#trip-schedule-cards");
    if (!cards) return;
    const empty = document.querySelector("#trip-schedules-empty");
    const successMessage = document.querySelector("#trip-booking-success");
    const errorMessage = document.querySelector("#trip-request-error");
    const directionButtons = [...document.querySelectorAll("[data-trip-direction]")];
    const eligibilityCard = document.querySelector("#trip-eligibility-card");
    let selectedDirection = "outbound";
    cards.hidden = false;
    empty.hidden = true;
    setText("trip-page-date", formatTripCardDate(localDateString()));
    setText("trip-page-pickup", student.pickup);
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

    async function updateAvailableTimes() {
      cards.dataset.portalLoading = "true";
      cards.replaceChildren();
      cards.hidden = false;
      empty.hidden = true;
      try {
        const schedules = selectedDirection
          ? (await readTripSchedules())
            .filter((schedule) => schedule.active)
            .filter((schedule) => schedule.direction === selectedDirection)
            .sort((first, second) => first.time.localeCompare(second.time))
          : [];
        const requests = await readTripRequests();
        const tripDate = localDateString();
        const eligible = await isStudentEligibleForTrips(student, tripDate);
        const activeRequests = requests.filter((request) =>
          request.studentId === student.id &&
          request.tripDate === tripDate &&
          ["pending", "approved"].includes(request.status)
        );
        eligibilityCard?.classList.toggle("is-eligible", eligible);
        eligibilityCard?.classList.toggle("has-registration", activeRequests.length > 0);
        setText(
          "trip-page-eligibility",
          activeRequests.length > 0
            ? "لديك حجز اليوم"
            : eligible
              ? "الاشتراك نشط — التسجيل متاح"
              : "الاشتراك غير مؤهل للتسجيل"
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
        delete cards.dataset.portalLoading;
        empty.hidden = !selectedDirection || schedules.length > 0;
        empty.textContent = selectedDirection
          ? "لا توجد مواعيد مضافة لهذا الاتجاه حاليًا."
          : "لا توجد مواعيد رحلات متاحة حاليًا.";
        errorMessage.hidden = true;
      } catch (scheduleError) {
        console.error("Unable to load trip schedules.", scheduleError);
        cards.replaceChildren();
        delete cards.dataset.portalLoading;
        empty.hidden = true;
        cards.hidden = !selectedDirection;
        showBookingError("تعذر تحميل مواعيد الرحلات. أعد تحميل الصفحة أو تواصل مع الإدارة.");
      }
    }

    async function bookSchedule(scheduleId) {
      try {
        const tripDate = localDateString();
        const schedules = await readTripSchedules();
        const schedule = schedules.find((item) =>
          item.id === scheduleId && item.active && item.direction === selectedDirection
        );
        if (!schedule) {
          showBookingError("هذا الموعد لم يعد متاحًا. حدّث الصفحة واختر موعدًا آخر.");
          updateAvailableTimes();
          return;
        }
        if (!(await isStudentEligibleForTrips(student, tripDate))) {
          showBookingError("التسجيل متاح للطلاب النشطين خلال فترة اشتراكهم فقط.");
          updateAvailableTimes();
          return;
        }
        const requests = await readTripRequests();
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
              : `لديك تسجيل ${tripDirectionLabels[schedule.direction]} اليوم. لا يمكنك التسجيل في موعد آخر لنفس الاتجاه.`
          );
          return;
        }

        await window.votaData.bookStudentTrip(schedule.id, tripDate);
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
        await window.votaData.cancelStudentTrip(requestId);
        errorMessage.hidden = true;
        successMessage.textContent = "تم إلغاء تسجيلك في الرحلة.";
        successMessage.hidden = false;
        updateAvailableTimes();
      } catch (cancelError) {
        console.error("Unable to cancel the trip registration.", cancelError);
        showBookingError("تعذر إلغاء التسجيل. حاول مرة أخرى.");
      }
    }

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
  if (appNavigation) appNavigation.hidden = needsPasswordChange;
  if (notificationTrigger) notificationTrigger.hidden = needsPasswordChange;
  setText("portal-student-name", student.name);
  if (notificationTrigger && notificationDialog) {
    notificationTrigger.addEventListener("click", () => {
      if (notificationDialog.open) {
        notificationDialog.close();
        return;
      }
      notificationDialog.showModal();
      notificationTrigger.setAttribute("aria-expanded", "true");
    });
    notificationDialog.addEventListener("close", () => {
      notificationTrigger.setAttribute("aria-expanded", "false");
    });
    notificationDialog.addEventListener("click", (event) => {
      if (event.target === notificationDialog) notificationDialog.close();
    });
  }
  if (closeNotificationsButton && notificationDialog) {
    closeNotificationsButton.addEventListener("click", () => notificationDialog.close());
  }
  if (markNotificationsButton) {
    markNotificationsButton.addEventListener("click", async () => {
      try {
        const notificationState = await window.votaAPI.getStudentNotificationState(student.id);
        await window.votaAPI.updateStudentNotificationState(student.id, {
          lastSeen: Date.now(),
          dismissed: Array.isArray(notificationState.dismissed) ? notificationState.dismissed : [],
        });
        await updateNotifications();
      } catch (error) {
        console.error("Unable to mark student notifications as read.", error);
        notificationError.textContent = "تعذر حفظ حالة التنبيهات في قاعدة البيانات.";
        notificationError.hidden = false;
      }
    });
  }
  if (!needsPasswordChange) {
    void updateNotifications();
    if (sectionName === "home") updateHome();
    if (sectionName === "personal") await updatePersonal();
    if (sectionName === "subscription") updateSubscription();
    if (sectionName === "trips") updateTripPage();
  }

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    passwordError.textContent = "";
    if (!passwordForm.reportValidity()) return;
    const password = passwordForm.elements.newPassword.value;
    if (!/^[0-9]{8,128}$/.test(password)) {
      passwordError.textContent = "كلمة المرور يجب أن تتكون من 8 أرقام على الأقل.";
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
      if (appNavigation) appNavigation.hidden = false;
      if (notificationTrigger) notificationTrigger.hidden = false;
      void updateNotifications();
      if (sectionName === "home") updateHome();
      if (sectionName === "personal") await updatePersonal();
      if (sectionName === "subscription") updateSubscription();
      if (sectionName === "trips") updateTripPage();
    } catch (error) {
      console.error("Unable to update the student portal password.", error);
      passwordError.textContent = "تعذر حفظ كلمة المرور. حاول مرة أخرى.";
    }
  });

  if (profileEditForm && profileEditToggle && profileEditMessage) {
    const showProfilePhotoPreview = (photoDataUrl) => {
      profilePhotoPreview.hidden = !photoDataUrl;
      profilePhotoEmpty.hidden = Boolean(photoDataUrl);
      if (photoDataUrl) profilePhotoPreview.src = photoDataUrl;
      else profilePhotoPreview.removeAttribute("src");
    };

    profilePhotoInput.addEventListener("change", async () => {
      const file = profilePhotoInput.files?.[0];
      if (!file) return;
      profileEditMessage.hidden = true;
      if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
        profileEditMessage.textContent = "اختر صورة بصيغة JPG أو PNG أو WebP أو GIF.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
        profilePhotoInput.value = "";
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        profileEditMessage.textContent = "حجم الصورة أكبر من ٥ ميجابايت.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
        profilePhotoInput.value = "";
        return;
      }
      try {
        const photoDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            if (typeof reader.result !== "string") {
              reject(new Error("تعذر قراءة الصورة المحددة."));
              return;
            }
            resolve(reader.result);
          }, { once: true });
          reader.addEventListener("error", () => reject(new Error("تعذر قراءة الصورة المحددة.")), { once: true });
          reader.readAsDataURL(file);
        });
        if (photoDataUrl.length > 7 * 1024 * 1024) {
          throw new Error("حجم الصورة بعد تجهيزها أكبر من الحد المسموح.");
        }
        selectedProfilePhotoDataUrl = photoDataUrl;
        showProfilePhotoPreview(photoDataUrl);
      } catch (error) {
        console.error("Unable to read the selected student profile photo.", error);
        profileEditMessage.textContent = error instanceof Error
          ? error.message
          : "تعذر قراءة الصورة المحددة.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
        profilePhotoInput.value = "";
      }
    });

    removeProfilePhotoButton.addEventListener("click", () => {
      selectedProfilePhotoDataUrl = "";
      profilePhotoInput.value = "";
      showProfilePhotoPreview("");
      profileEditMessage.hidden = true;
    });

    profileEditToggle.addEventListener("click", () => {
      const opening = profileEditForm.hidden;
      profileEditForm.hidden = !opening;
      profileEditToggle.setAttribute("aria-expanded", String(opening));
      profileEditToggle.textContent = opening ? "إغلاق التعديل" : "تعديل بياناتي";
      profileEditMessage.hidden = true;
      selectedProfilePhotoDataUrl = null;
      profilePhotoInput.value = "";
      if (opening) {
        updatePersonal();
        profileEditForm.elements.name.focus();
      } else {
        updatePersonal();
      }
    });

    document.querySelector("#cancel-portal-profile-edit").addEventListener("click", () => {
      profileEditForm.hidden = true;
      profileEditToggle.setAttribute("aria-expanded", "false");
      profileEditToggle.textContent = "تعديل بياناتي";
      profileEditMessage.hidden = true;
      selectedProfilePhotoDataUrl = null;
      profilePhotoInput.value = "";
      updatePersonal();
    });

    registerGuardedSubmit(profileEditForm, async () => {
      profileEditMessage.hidden = true;
      if (!profileEditForm.reportValidity()) return;

      const fields = [
        "name", "phone", "pickup", "university", "faculty", "studyYear", "emergencyPhone",
      ];
      const updates = Object.fromEntries(fields.map((field) => [
        field,
        String(profileEditForm.elements[field].value).trim(),
      ]));
      if (selectedProfilePhotoDataUrl !== null) {
        updates.photoDataUrl = selectedProfilePhotoDataUrl;
      }
      const phonePattern = /^\+?[\d\s()-]{7,20}$/;
      if (!phonePattern.test(updates.phone)) {
        profileEditMessage.textContent = "تأكد من كتابة رقم هاتف صحيح.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
        return;
      }
      if (updates.emergencyPhone && !phonePattern.test(updates.emergencyPhone)) {
        profileEditMessage.textContent = "تأكد من كتابة رقم هاتف ولي الأمر بشكل صحيح.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
        return;
      }

      const saveButton = document.querySelector("#save-portal-profile");
      saveButton.disabled = true;
      try {
        const updatedStudent = await window.votaAPI.updateCurrentStudentProfile(updates);
        Object.assign(student, updatedStudent);
        selectedProfilePhotoDataUrl = null;
        profilePhotoInput.value = "";
        await updatePersonal();
        profileEditMessage.textContent = "تم حفظ بياناتك بنجاح.";
        profileEditMessage.classList.remove("is-error");
        profileEditMessage.hidden = false;
      } catch (error) {
        console.error("Unable to update the student profile.", error);
        profileEditMessage.textContent = error instanceof Error
          ? error.message
          : "تعذر حفظ التعديلات. حاول مرة أخرى.";
        profileEditMessage.classList.add("is-error");
        profileEditMessage.hidden = false;
      } finally {
        saveButton.disabled = false;
      }
    });
  }
}

async function initializeStudentFile() {
  const profile = document.querySelector("#student-profile");
  if (!profile) return;
  const message = document.querySelector("#student-profile-message");
  const profileTabs = [...document.querySelectorAll("[data-profile-tab]")];
  const profilePanels = [...document.querySelectorAll("[data-profile-panel]")];
  const activateProfileTab = (name, focus = false) => {
    for (const tab of profileTabs) {
      const selected = tab.dataset.profileTab === name;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    }
    for (const panel of profilePanels) {
      panel.hidden = panel.dataset.profilePanel !== name;
    }
  };
  for (const tab of profileTabs) {
    tab.addEventListener("click", () => activateProfileTab(tab.dataset.profileTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = profileTabs.indexOf(tab);
      const forwardKey = getComputedStyle(tab.parentElement).direction === "rtl"
        ? "ArrowLeft"
        : "ArrowRight";
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? profileTabs.length - 1
          : (currentIndex + (event.key === forwardKey ? 1 : -1) + profileTabs.length) %
            profileTabs.length;
      activateProfileTab(profileTabs[nextIndex].dataset.profileTab, true);
    });
  }
  activateProfileTab("details");
  if (window.votaData.role !== "admin") {
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
    const students = await readStudentRecords();
    const student = students.find((record) => record.id === studentId);
    if (!student) {
      message.textContent = "لم يتم العثور على الطالب.";
      message.hidden = false;
      return;
    }
    const subscriptions = await window.votaAPI.getSubscriptions();
    const terms = await window.votaAPI.getTerms();

    const studentSubscriptions = subscriptions.filter(
      (record) => record.studentId === student.id
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
      "print-profile-name": student.name,
      "print-profile-code": studentUsername(student.id),
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
      `students.html?edit=${encodeURIComponent(student.id)}&return=profile`;
    document.querySelector("#profile-call").href =
      `tel:${encodeURIComponent(student.phone)}`;

    const profileActionsMenu = document.querySelector("#profile-more-actions-menu");
    const profileActionUrl = (action) =>
      `students.html?action=${encodeURIComponent(action)}&id=${encodeURIComponent(student.id)}&return=profile`;
    const profileActionIcons = {
      payment: '<path d="M3 5.5h14v10H3zM3 8h14m-10 4h3m-7 0h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      renew: '<path d="M16.5 7.5A6.5 6.5 0 0 0 5 6l-1.5 1.5M3.5 4v3.5H7m-3.5 5A6.5 6.5 0 0 0 15 14l1.5-1.5M16.5 16v-3.5H13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      "toggle-status": '<path d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8M10 6v4l2.5 1.5M13.5 3.5h4m-2-2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      password: '<rect x="3.5" y="8" width="13" height="9" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6.5 8V5.8a3.5 3.5 0 0 1 7 0V8m-3.5 3v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
      receipt: '<path d="M5 2.8h9l2 2V17l-2-1.2L12 17l-2-1.2L8 17l-3-1.2V2.8Zm2.5 4h5m-5 3h6m-6 3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      archive: '<path d="M3 5h14v3H3zM5 8v8.5h10V8m-7 3h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      restore: '<path d="M4 5h12v3H4zM6 8v8h8V8m-4 5v-3m-2 2 2-2 2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
      withdraw: '<path d="M10 3.5v6m0 7.5a7 7 0 1 1 7-7m-3-1 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    };
    function addProfileAction(action, label, options = {}) {
      const link = document.createElement("a");
      link.className = `profile-icon-action${options.danger ? " is-danger" : ""}`;
      link.href = profileActionUrl(action);
      link.setAttribute("aria-label", label);
      link.title = label;
      if (options.disabled) {
        link.setAttribute("aria-disabled", "true");
        link.tabIndex = -1;
        link.addEventListener("click", (event) => event.preventDefault());
      }
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 20 20");
      icon.setAttribute("fill", "none");
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = profileActionIcons[action];
      link.append(icon);
      profileActionsMenu.append(link);
    }

    profileActionsMenu.replaceChildren();
    if (student.archivedAt) {
      addProfileAction("restore", "استعادة ملف الطالب");
    } else {
      const paidTotal = currentSubscription
        ? currentSubscription.payments.reduce((sum, payment) => sum + payment.amountCents, 0)
        : 0;
      const latestPayment = currentSubscription?.payments.at(-1);
      addProfileAction("payment", "تسجيل دفعة", {
        disabled: !currentSubscription || paidTotal >= currentSubscription.priceCents,
      });
      addProfileAction("renew", "تجديد الاشتراك");
      if (!["expired", "withdrawn"].includes(effectiveStudentStatus)) {
        addProfileAction(
          "toggle-status",
          ["inactive", "paused"].includes(effectiveStudentStatus)
            ? "استئناف الاشتراك"
            : "إيقاف الاشتراك مؤقتًا"
        );
      }
      addProfileAction("reset-password", "إعادة تعيين كلمة مرور الطالب");
      addProfileAction("receipt", "طباعة آخر إيصال", { disabled: !latestPayment });
      addProfileAction("withdraw", "إلغاء اشتراك الطالب", { danger: true });
      addProfileAction("archive", "أرشفة ملف الطالب", { danger: true });
    }

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
    profile.hidden = false;
    if (new URLSearchParams(window.location.search).get("print") === "1") {
      window.setTimeout(() => window.print(), 0);
    }
  } catch (error) {
    console.error("Unable to load the student profile.", error);
    message.textContent = "تعذر تحميل ملف الطالب.";
    message.hidden = false;
  }

  for (const button of document.querySelectorAll("[data-profile-print]")) {
    button.addEventListener("click", () => {
      const printScope = `is-printing-profile-${button.dataset.profilePrint}`;
      document.body.classList.add(printScope);
      try {
        window.print();
      } finally {
        document.body.classList.remove(printScope);
      }
    });
  }
  document.querySelector("#print-student-file").addEventListener("click", () => window.print());
}

async function initializeStudents() {
  const studentDialog = document.querySelector("#student-dialog");
  const studentForm = document.querySelector("#student-form");
  const studentRows = document.querySelector("#student-rows");
  const studentSearch = document.querySelector("#student-search");
  const studentStatusFilter = document.querySelector("#student-status-filter");
  const studentTermFilter = document.querySelector("#student-term-filter");
  const studentUniversityFilter = document.querySelector("#student-university-filter");
  const studentFacultyFilter = document.querySelector("#student-faculty-filter");
  const studentPickupFilter = document.querySelector("#student-pickup-filter");
  const studentFilterResults = document.querySelector("#student-filter-results");
  const resetStudentFiltersButton = document.querySelector("#reset-student-filters");
  const printStudentsButton = document.querySelector("#print-students-list");
  const studentsPrintView = document.querySelector("#students-print-view");
  const studentsPrintDate = document.querySelector("#students-print-date");
  const studentsPrintCount = document.querySelector("#students-print-count");
  const studentsPrintFilters = document.querySelector("#students-print-filters");
  const studentSort = document.querySelector("#student-sort");
  const studentCount = document.querySelector("#student-count");
  const activeStudentCount = document.querySelector("#active-student-count");
  const archivedStudentCount = document.querySelector("#archived-student-count");
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
  const studentPhotoInput = document.querySelector("#student-photo-input");
  const studentPhotoImage = document.querySelector("#student-photo-image");
  const studentPhotoFallback = document.querySelector("#student-photo-fallback");
  const studentPhotoRemove = document.querySelector("#student-photo-remove");
  const studentPhotoMaxDataUrlLength = 7 * 1024 * 1024;
  const credentialDialog = document.querySelector("#credential-dialog");
  const paymentDialog = document.querySelector("#student-payment-dialog");
  const paymentForm = document.querySelector("#student-payment-form");
  const renewalDialog = document.querySelector("#student-renewal-dialog");
  const renewalForm = document.querySelector("#student-renewal-form");
  const renewalTermSelect = document.querySelector("#renewal-term");
  let returnToStudentProfileId = null;

  if (
    !studentDialog ||
    !studentForm ||
    !studentRows ||
    !studentSearch ||
    !studentStatusFilter ||
    !studentTermFilter ||
    !studentUniversityFilter ||
    !studentFacultyFilter ||
    !studentPickupFilter ||
    !studentFilterResults ||
    !resetStudentFiltersButton ||
    !printStudentsButton ||
    !studentsPrintView ||
    !studentsPrintDate ||
    !studentsPrintCount ||
    !studentsPrintFilters ||
    !studentSort ||
    !studentCount ||
    !activeStudentCount ||
    !archivedStudentCount ||
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
    !studentPhotoInput ||
    !studentPhotoImage ||
    !studentPhotoFallback ||
    !studentPhotoRemove ||
    !credentialDialog ||
    !paymentDialog ||
    !paymentForm ||
    !renewalDialog ||
    !renewalForm ||
    !renewalTermSelect
  ) {
    return;
  }

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
  let studentPhotoDataUrl = "";
  let studentPhotoSelectionVersion = 0;
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

  function studentInitials(name) {
    return String(name || "طالب")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("");
  }

  function setStudentPhoto(photoDataUrl, studentName = "") {
    studentPhotoDataUrl = photoDataUrl || "";
    studentPhotoImage.hidden = !studentPhotoDataUrl;
    studentPhotoFallback.hidden = Boolean(studentPhotoDataUrl);
    studentPhotoFallback.textContent = studentInitials(studentName);
    if (studentPhotoDataUrl) {
      studentPhotoImage.src = studentPhotoDataUrl;
      studentPhotoImage.alt = `صورة ${studentName || "الطالب"}`;
    } else {
      studentPhotoImage.removeAttribute("src");
      studentPhotoImage.alt = "";
    }
    studentPhotoRemove.disabled = !studentPhotoDataUrl;
  }

  async function readStudentPhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      throw new Error("اختر صورة بصيغة JPG أو PNG أو WebP أو GIF.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("حجم الصورة أكبر من ٥ ميجابايت.");
    }

    const readFile = () => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") {
          reject(new Error("تعذر قراءة الصورة المحددة."));
          return;
        }
        resolve(reader.result);
      }, { once: true });
      reader.addEventListener("error", () => {
        reject(new Error("تعذر قراءة الصورة المحددة."));
      }, { once: true });
      reader.readAsDataURL(file);
    });

    if (file.type === "image/gif") return readFile();

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("تعذر قراءة الصورة المحددة.")), { once: true });
        image.src = objectUrl;
      });

      const targetRatio = 17 / 22;
      let sourceX = 0;
      let sourceY = 0;
      let sourceWidth = image.naturalWidth;
      let sourceHeight = image.naturalHeight;
      if (sourceWidth / sourceHeight > targetRatio) {
        sourceWidth = sourceHeight * targetRatio;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
      } else {
        sourceHeight = sourceWidth / targetRatio;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(sourceWidth);
      canvas.height = Math.round(sourceHeight);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز الصورة للحفظ.");
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      const croppedPhoto = canvas.toDataURL("image/png");
      return croppedPhoto.length <= studentPhotoMaxDataUrlLength
        ? croppedPhoto
        : await readFile();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
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
      (student.photoDataUrl === undefined ||
        (typeof student.photoDataUrl === "string" &&
          (student.photoDataUrl === "" ||
            /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(student.photoDataUrl)) &&
          student.photoDataUrl.length <= studentPhotoMaxDataUrlLength)) &&
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

  async function loadStudents() {
    try {
      students = await window.votaAPI.getStudents();
      terms = await window.votaAPI.getTerms();
      subscriptions = await window.votaAPI.getSubscriptions();
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

  async function saveRegistration(updatedStudents, updatedSubscriptions) {
    try {
      const studentIds = new Map();
      const savedStudents = [];
      for (const student of updatedStudents) {
        const existing = students.find((record) => record.id === student.id);
        if (existing && JSON.stringify(existing) === JSON.stringify(student)) {
          savedStudents.push(student);
        } else if (existing) {
          Object.assign(student, await window.votaAPI.updateStudent(student.id, student));
          savedStudents.push(student);
        } else {
          const temporaryId = student.id;
          Object.assign(student, await window.votaAPI.createStudent(student));
          studentIds.set(temporaryId, student.id);
          savedStudents.push(student);
        }
      }

      const savedSubscriptions = [];
      for (const subscription of updatedSubscriptions) {
        const originalStudentId = subscription.studentId;
        if (studentIds.has(originalStudentId)) {
          subscription.studentId = studentIds.get(originalStudentId);
        }
        const existing = subscriptions.find((record) => record.id === subscription.id);
        if (existing && JSON.stringify(existing) === JSON.stringify(subscription)) {
          savedSubscriptions.push(subscription);
        } else if (existing) {
          Object.assign(
            subscription,
            await window.votaAPI.updateSubscription(subscription.id, subscription)
          );
          savedSubscriptions.push(subscription);
        } else {
          for (const [index, payment] of (subscription.payments || []).entries()) {
            if (studentIds.has(originalStudentId)) {
              payment.receiptNumber = `VOTA-${subscription.studentId}-${Date.now()}-${index + 1}`;
            }
          }
          Object.assign(subscription, await window.votaAPI.createSubscription(subscription));
          savedSubscriptions.push(subscription);
        }
      }
      students = savedStudents;
      subscriptions = savedSubscriptions;
      storageMessage.textContent = "";
      storageMessage.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save student registration and subscription.", error);
      const databaseErrorText = [
        error?.message,
        error?.details,
        error?.hint,
        error?.constraint,
      ].filter(Boolean).join(" ").toLowerCase();
      const duplicatePhone = error?.code === "23505" && (
        databaseErrorText.includes("students_normalized_phone_unique") ||
        databaseErrorText.includes("students_phone_key") ||
        databaseErrorText.includes("student with this phone number already exists")
      );
      const duplicatePaymentReceipt = error?.code === "23505" &&
        databaseErrorText.includes("subscriptions_payment_receipt_unique");
      if (duplicatePhone) {
        formError.textContent = "رقم الهاتف مسجل لطالب آخر بالفعل.";
        storageMessage.textContent = "لا يمكن حفظ طالب برقم هاتف مستخدم في حساب آخر.";
      } else if (duplicatePaymentReceipt) {
        storageMessage.textContent = "لا يمكن تسجيل دفعة برقم إيصال مستخدم من قبل.";
      } else {
        storageMessage.textContent = "تعذر حفظ بيانات الطالب والاشتراك. حاول مرة أخرى.";
      }
      storageMessage.hidden = false;
      return false;
    }
  }

  async function saveStudents(updatedStudents) {
    try {
      const savedStudents = [];
      for (const student of updatedStudents) {
        const existing = students.find((record) => record.id === student.id);
        if (existing && JSON.stringify(existing) === JSON.stringify(student)) {
          savedStudents.push(student);
        } else if (existing) {
          Object.assign(student, await window.votaAPI.updateStudent(student.id, student));
          savedStudents.push(student);
        } else {
          Object.assign(student, await window.votaAPI.createStudent(student));
          savedStudents.push(student);
        }
      }
      students = savedStudents;
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

  function normalizedFacetValue(value) {
    return String(value || "").trim().toLocaleLowerCase("ar");
  }

  function getBaseFilteredStudents() {
    const query = studentSearch.value.trim().toLocaleLowerCase("ar");
    const statusFilter = studentStatusFilter.value;
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
        const matchesTerm = !termFilter || String(student.termId) === termFilter;
        return matchesQuery && matchesStatus && matchesTerm;
      });
  }

  function matchesStudentFacets(student, excludedFacet = "") {
    const facets = [
      ["university", studentUniversityFilter.value, student.university],
      ["faculty", studentFacultyFilter.value, student.faculty],
      ["pickup", studentPickupFilter.value, student.pickup],
    ];
    return facets.every(([name, selected, value]) =>
      name === excludedFacet ||
      !selected ||
      normalizedFacetValue(value) === selected
    );
  }

  function refreshStudentFacetOptions(baseStudents) {
    const facets = [
      [studentUniversityFilter, "كل الجامعات", "university", "university"],
      [studentFacultyFilter, "كل الكليات", "faculty", "faculty"],
      [studentPickupFilter, "كل المناطق", "pickup", "pickup"],
    ];
    for (const [select, placeholder, property, excludedFacet] of facets) {
      const selectedValue = select.value;
      const candidates = baseStudents.filter((student) =>
        matchesStudentFacets(student, excludedFacet)
      );
      const values = new Map();
      for (const student of candidates) {
        const label = String(student[property] || "").trim();
        const key = normalizedFacetValue(label);
        if (!key) continue;
        const entry = values.get(key) || { label, count: 0 };
        entry.count++;
        values.set(key, entry);
      }
      if (selectedValue && !values.has(selectedValue)) {
        values.set(selectedValue, {
          label: select.selectedOptions[0]?.dataset.label || selectedValue,
          count: 0,
        });
      }
      select.replaceChildren(new Option(placeholder, ""));
      for (const [value, entry] of [...values.entries()].sort((first, second) =>
        first[1].label.localeCompare(second[1].label, "ar")
      )) {
        const option = new Option(
          `${entry.label} (${new Intl.NumberFormat("ar-EG").format(entry.count)})`,
          value
        );
        option.dataset.label = entry.label;
        select.add(option);
      }
      select.value = selectedValue;
    }
  }

  function visibleStudentsForExport() {
    return getBaseFilteredStudents()
      .filter((student) => matchesStudentFacets(student))
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
    const formatCount = (value) => new Intl.NumberFormat("ar-EG").format(value);
    studentCount.textContent = formatCount(students.length);
    activeStudentCount.textContent = formatCount(activeCount);
    archivedStudentCount.textContent = formatCount(archivedStudents.length);
    activeTabCount.textContent = formatCount(currentStudents.length);
    archivedTabCount.textContent = formatCount(archivedStudents.length);
    studentListCaption.textContent = studentView === "archived"
      ? "الملفات المؤرشفة محفوظة، ويمكن استعادتها في أي وقت."
      : "تابع بيانات الطالب وتواصله ودراسته ومنطقة الركوب والحالة.";

    const selectedTermId = studentTermFilter.value;
    studentTermFilter.replaceChildren(new Option("كل الترمات", ""));
    for (const term of terms) {
      studentTermFilter.add(
        new Option(`${term.name} — ${term.academicYear}`, String(term.id))
      );
    }
    studentTermFilter.value = selectedTermId;

    const baseFilteredStudents = getBaseFilteredStudents();
    refreshStudentFacetOptions(baseFilteredStudents);
    const visibleStudents = visibleStudentsForExport();
    const totalInCurrentView = studentView === "archived"
      ? archivedStudents.length
      : currentStudents.length;
    studentFilterResults.textContent =
      `عرض ${formatCount(visibleStudents.length)} من ${formatCount(totalInCurrentView)} طالب`;
    studentsPrintView.textContent = studentView === "archived"
      ? "الملفات المؤرشفة"
      : "الطلاب الحاليون";
    studentsPrintDate.textContent = formatLocalDate(localDateString());
    studentsPrintCount.textContent = formatCount(visibleStudents.length);
    const printFilters = [
      studentSearch.value.trim() ? `البحث: ${studentSearch.value.trim()}` : "",
      studentStatusFilter.value
        ? `الحالة: ${studentStatusFilter.selectedOptions[0].textContent}`
        : "",
      studentTermFilter.value
        ? `الترم: ${studentTermFilter.selectedOptions[0].textContent}`
        : "",
      studentUniversityFilter.value
        ? `الجامعة: ${studentUniversityFilter.selectedOptions[0].dataset.label}`
        : "",
      studentFacultyFilter.value
        ? `الكلية: ${studentFacultyFilter.selectedOptions[0].dataset.label}`
        : "",
      studentPickupFilter.value
        ? `منطقة الركوب: ${studentPickupFilter.selectedOptions[0].dataset.label}`
        : "",
    ].filter(Boolean);
    studentsPrintFilters.textContent = printFilters.length
      ? `الفلاتر: ${printFilters.join(" · ")}`
      : "بدون فلاتر إضافية";
    printStudentsButton.disabled = visibleStudents.length === 0;
    const hasActiveFilters = Boolean(
      studentSearch.value.trim() ||
      studentStatusFilter.value ||
      studentTermFilter.value ||
      studentUniversityFilter.value ||
      studentFacultyFilter.value ||
      studentPickupFilter.value
    );
    resetStudentFiltersButton.disabled = !hasActiveFilters;

    studentRows.replaceChildren();
    for (const student of visibleStudents) {
      const row = document.createElement("tr");
      if (student.archivedAt) row.classList.add("archived-student-row");
      const nameCell = document.createElement("td");
      const studentIdentity = document.createElement("div");
      const profileLink = document.createElement("a");
      const avatar = document.createElement("span");
      const studentName = document.createElement("strong");
      const studentId = document.createElement("span");
      avatar.className = "student-avatar";
      profileLink.className = "student-avatar-link";
      profileLink.href = `student.html?id=${encodeURIComponent(student.id)}`;
      profileLink.setAttribute("aria-label", `فتح ملف الطالب ${student.name}`);
      profileLink.title = `فتح ملف ${student.name}`;
      studentIdentity.className = "student-identity";
      studentName.textContent = student.name;
      studentId.className = "student-id";
      studentId.textContent = studentUsername(student.id);
      if (student.photoDataUrl) {
        const photo = document.createElement("img");
        photo.className = "student-avatar-photo";
        photo.src = student.photoDataUrl;
        photo.alt = "";
        photo.loading = "lazy";
        avatar.append(photo);
      } else {
        avatar.classList.add("student-avatar-fallback");
        avatar.textContent = studentInitials(student.name);
      }
      profileLink.append(avatar);
      const identityText = document.createElement("span");
      identityText.className = "student-identity-text";
      identityText.append(studentName, studentId);
      studentIdentity.append(profileLink, identityText);
      nameCell.append(studentIdentity);

      const contactCell = document.createElement("td");
      contactCell.className = "student-contact-cell";
      const studentPhoneLine = document.createElement("span");
      studentPhoneLine.className = "student-contact-line";
      const studentPhoneLabel = document.createElement("small");
      studentPhoneLabel.textContent = "الطالب";
      const phoneLink = document.createElement("a");
      phoneLink.href = `tel:${encodeURIComponent(student.phone)}`;
      phoneLink.textContent = student.phone;
      phoneLink.dir = "ltr";
      studentPhoneLine.append(studentPhoneLabel, phoneLink);
      contactCell.append(studentPhoneLine);
      const parentPhoneLine = document.createElement("span");
      parentPhoneLine.className = "student-contact-line";
      const parentPhoneLabel = document.createElement("small");
      parentPhoneLabel.textContent = "ولي الأمر";
      if (student.emergencyPhone) {
        const parentPhone = document.createElement("a");
        parentPhone.href = `tel:${encodeURIComponent(student.emergencyPhone)}`;
        parentPhone.textContent = student.emergencyPhone;
        parentPhone.dir = "ltr";
        parentPhoneLine.append(parentPhoneLabel, parentPhone);
      } else {
        const missingParentPhone = document.createElement("span");
        missingParentPhone.textContent = "غير مسجل";
        parentPhoneLine.append(parentPhoneLabel, missingParentPhone);
      }
      contactCell.append(parentPhoneLine);

      const education = [student.university, student.faculty]
        .filter(Boolean)
        .join("، ") || "—";
      const educationCell = document.createElement("td");
      educationCell.className = "student-education-cell";
      const educationDetails = document.createElement("span");
      educationDetails.textContent = education;
      const studyYear = document.createElement("small");
      studyYear.textContent = student.studyYear
        ? `السنة الدراسية: ${student.studyYear}`
        : "السنة الدراسية: —";
      educationCell.append(educationDetails, studyYear);
      const term = terms.find((item) => item.id === student.termId);
      const currentSubscription = subscriptionFor(student);
      const termLabel = term
        ? `${term.name} — ${term.academicYear}`
        : currentSubscription
          ? `${currentSubscription.termName} — ${currentSubscription.academicYear}`
          : "—";
      const studentStatus = document.createElement("span");
      const currentStatus = effectiveStatus(student);
      studentStatus.className = `status-badge status-${currentStatus}`;
      studentStatus.textContent = subscriptionLabels[currentStatus];
      const statusStack = document.createElement("div");
      statusStack.className = "student-record-status";
      statusStack.append(studentStatus);
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

      row.append(
        nameCell,
        contactCell,
        educationCell,
        createCell(student.pickup),
        createCell(termLabel),
        statusCell
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
    studentPhotoSelectionVersion++;
    editingStudentId = null;
    studentForm.reset();
    studentPhotoInput.value = "";
    setStudentPhoto("", "");
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
    studentPhotoSelectionVersion++;
    studentForm.reset();
    studentPhotoInput.value = "";
    setStudentPhoto("", "");
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
    await window.votaData.manageStudentAuth(
      student.authUserId ? "reset" : "create",
      student.id,
      temporaryPassword
    );
    await window.votaAPI.updateStudent(student.id, {
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    });
    students = await window.votaAPI.getStudents();
    renderStudents();
    showCredentials(student.id, temporaryPassword);
  }

  function openEditDialog(student) {
    editingStudentId = student.id;
    formError.textContent = "";
    studentPhotoSelectionVersion++;
    studentForm.reset();
    studentPhotoInput.value = "";
    studentForm.elements.subscription.querySelector('option[value="expired"]')?.remove();
    if (student.subscription === "expired") {
      studentForm.elements.subscription.add(new Option("منتهي الاشتراك", "expired"));
    }
    const fields = [
      "name", "phone", "pickup", "university", "faculty", "studyYear",
      "emergencyPhone", "subscription", "notes",
    ];
    for (const field of fields) studentForm.elements[field].value = student[field] || "";
    setStudentPhoto(student.photoDataUrl || "", student.name);
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
  const closeAndReturnToProfile = (closeDialog) => {
    closeDialog();
    returnToStudentProfile();
  };
  document.querySelector("#close-dialog").addEventListener("click", () =>
    closeAndReturnToProfile(closeStudentDialog)
  );
  document.querySelector("#cancel-dialog").addEventListener("click", () =>
    closeAndReturnToProfile(closeStudentDialog)
  );
  document.querySelector("#close-student-payment").addEventListener("click", () =>
    closeAndReturnToProfile(closePaymentDialog)
  );
  document.querySelector("#cancel-student-payment").addEventListener("click", () =>
    closeAndReturnToProfile(closePaymentDialog)
  );
  paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) {
      closePaymentDialog();
      returnToStudentProfile();
    }
  });
  paymentDialog.addEventListener("cancel", () => {
    activePaymentSubscriptionId = null;
    paymentForm.reset();
    returnToStudentProfile();
  });
  document.querySelector("#close-student-renewal").addEventListener("click", () =>
    closeAndReturnToProfile(closeRenewalDialog)
  );
  document.querySelector("#cancel-student-renewal").addEventListener("click", () =>
    closeAndReturnToProfile(closeRenewalDialog)
  );
  renewalDialog.addEventListener("click", (event) => {
    if (event.target === renewalDialog) {
      closeRenewalDialog();
      returnToStudentProfile();
    }
  });
  renewalDialog.addEventListener("cancel", () => {
    renewingStudentId = null;
    renewalForm.reset();
    returnToStudentProfile();
  });
  renewalTermSelect.addEventListener("change", updateRenewalPreview);
  registerGuardedSubmit(paymentForm, async () => {
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
    if (!(await saveRegistration(updatedStudents, updatedSubscriptions))) {
      error.textContent = "لم يتم حفظ الدفعة. حاول مرة أخرى.";
      return;
    }
    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    closePaymentDialog();
    renderStudents();
    printReceipt(student, subscription, payment);
    returnToStudentProfile();
  });
  registerGuardedSubmit(renewalForm, async () => {
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
      id: -nextSubscriptionId,
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
            receiptNumber: `VOTA-${student.id}-${Date.now()}-1`,
          }]
        : [],
    };
    const updatedStudents = students.map((record) =>
      record.id === student.id
        ? { ...record, termId: term.id, subscription: "active", updatedAt: new Date().toISOString() }
        : record
    );
    const updatedSubscriptions = [...subscriptions, subscription];
    if (!(await saveRegistration(updatedStudents, updatedSubscriptions))) {
      error.textContent = "تعذر حفظ تجديد الاشتراك. حاول مرة أخرى.";
      return;
    }
    nextSubscriptionId++;
    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    closeRenewalDialog();
    renderStudents();
    returnToStudentProfile();
  });
  studentSearch.addEventListener("input", renderStudents);
  studentStatusFilter.addEventListener("change", renderStudents);
  studentTermFilter.addEventListener("change", renderStudents);
  studentUniversityFilter.addEventListener("change", renderStudents);
  studentFacultyFilter.addEventListener("change", renderStudents);
  studentPickupFilter.addEventListener("change", renderStudents);
  studentSort.addEventListener("change", renderStudents);
  resetStudentFiltersButton.addEventListener("click", () => {
    studentSearch.value = "";
    studentStatusFilter.value = "";
    studentTermFilter.value = "";
    studentUniversityFilter.value = "";
    studentFacultyFilter.value = "";
    studentPickupFilter.value = "";
    renderStudents();
  });
  printStudentsButton.addEventListener("click", () => {
    if (!visibleStudentsForExport().length) return;
    document.body.classList.add("is-printing-students-list");
    try {
      window.print();
    } finally {
      document.body.classList.remove("is-printing-students-list");
    }
  });
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
      "كود الطالب", "اسم الطالب", "رقم الهاتف", "رقم ولي الأمر", "منطقة الركوب",
      "الجامعة", "الكلية أو التخصص", "السنة الدراسية", "الترم", "حالة الطالب",
    ];
    const rows = records.map((student) => {
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
        term ? `${term.name} — ${term.academicYear}` : "",
        subscriptionLabels[effectiveStatus(student)],
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
    returnToStudentProfile();
  });
  termSelect.addEventListener("change", updateTermOptions);
  studentForm.elements.name.addEventListener("input", () => {
    if (!studentPhotoDataUrl) {
      studentPhotoFallback.textContent = studentInitials(studentForm.elements.name.value);
    }
  });
  studentPhotoInput.addEventListener("change", async () => {
    const file = studentPhotoInput.files?.[0];
    if (!file) return;
    const selectionVersion = ++studentPhotoSelectionVersion;
    formError.textContent = "";
    try {
      const photoDataUrl = await readStudentPhoto(file);
      if (selectionVersion !== studentPhotoSelectionVersion) return;
      setStudentPhoto(photoDataUrl, studentForm.elements.name.value);
    } catch (error) {
      if (selectionVersion !== studentPhotoSelectionVersion) return;
      studentPhotoInput.value = "";
      formError.textContent = error instanceof Error
        ? error.message
        : "تعذر تجهيز الصورة. اختر صورة أخرى.";
    }
  });
  studentPhotoRemove.addEventListener("click", () => {
    studentPhotoSelectionVersion++;
    studentPhotoInput.value = "";
    setStudentPhoto("", studentForm.elements.name.value);
    formError.textContent = "";
  });

  studentDialog.addEventListener("click", (event) => {
    if (event.target === studentDialog) {
      closeStudentDialog();
      returnToStudentProfile();
    }
  });

  studentDialog.addEventListener("cancel", () => {
    studentPhotoSelectionVersion++;
    studentForm.reset();
    studentPhotoInput.value = "";
    setStudentPhoto("", "");
    formError.textContent = "";
    returnToStudentProfile();
  });

  registerGuardedSubmit(studentForm, async () => {
    formError.textContent = "";
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
      (student) =>
        student.id !== editingStudentId &&
        normalizePhoneNumber(student.phone) === normalizePhoneNumber(phone)
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
        photoDataUrl: studentPhotoDataUrl,
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
      if (!(await saveRegistration(updatedStudents, updatedSubscriptions))) {
        if (!formError.textContent) formError.textContent = "لم يتم حفظ التعديلات. حاول مرة أخرى.";
        return;
      }
      students = updatedStudents;
      subscriptions = updatedSubscriptions;
      closeStudentDialog();
      renderStudents();
      returnToStudentProfile();
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

    const newId = -nextStudentId++;
    let temporaryPassword;
    try {
      temporaryPassword = generateTemporaryPassword();
    } catch (error) {
      nextStudentId--;
      console.error("Unable to create student portal credentials.", error);
      formError.textContent = "تعذر إنشاء بيانات الدخول. تحقق من الاتصال وحاول مرة أخرى.";
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
      photoDataUrl: studentPhotoDataUrl,
      subscription: String(formData.get("subscription")),
      notes: String(formData.get("notes")).trim(),
      termId: term.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mustChangePassword: true,
    };

    const newSubscription = {
      id: -nextSubscriptionId++,
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
              receiptNumber: `VOTA-${newStudent.id}-${Date.now()}-1`,
            },
          ]
        : [],
    };
    const updatedStudents = [...students, newStudent];
    const updatedSubscriptions = [...subscriptions, newSubscription];
    if (!(await saveRegistration(updatedStudents, updatedSubscriptions))) {
      nextStudentId--;
      nextSubscriptionId--;
      if (!formError.textContent) formError.textContent = "لم يتم حفظ بيانات الطالب. حاول مرة أخرى.";
      return;
    }

    students = updatedStudents;
    subscriptions = updatedSubscriptions;
    try {
      const account = await window.votaData.manageStudentAuth(
        "create",
        newStudent.id,
        temporaryPassword
      );
      students = await window.votaAPI.getStudents();
      const linkedStudent = students.find((student) => student.id === newStudent.id);
      if (!linkedStudent || linkedStudent.authUserId !== account.userId) {
        throw new Error("Student Auth account was created but the profile link could not be loaded.");
      }
      closeStudentDialog();
      showCredentials(newStudent.id, temporaryPassword);
      renderStudents();
    } catch (error) {
      console.error("Unable to create the Supabase student account.", error);
      formError.textContent = error?.message?.includes("وظيفة إنشاء حسابات الطلاب")
        ? `تم حفظ بيانات الطالب، لكن ${error.message}`
        : "تم حفظ بيانات الطالب، لكن تعذر إنشاء حسابه. استخدم زر كلمة المرور لإعادة المحاولة.";
      renderStudents();
    }
  });

  async function handleStudentAction(actionButton) {
    if (!storageReady) return;
    const studentId = Number(actionButton.dataset.studentId);
    const student = students.find((record) => record.id === studentId);
    if (!student) return false;

    if (actionButton.dataset.action === "edit") {
      openEditDialog(student);
      return true;
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
      if (!(await saveStudents(updatedStudents))) return;
      renderStudents();
      returnToStudentProfile();
      return true;
    }

    if (actionButton.dataset.action === "payment") {
      openPaymentDialog(student);
      return true;
    }

    if (actionButton.dataset.action === "renew") {
      openRenewalDialog(student);
      return true;
    }

    if (actionButton.dataset.action === "receipt") {
      const subscription = subscriptionFor(student);
      const payment = subscription?.payments.at(-1);
      if (subscription && payment) printReceipt(student, subscription, payment);
      returnToStudentProfile();
      return true;
    }

    if (actionButton.dataset.action === "withdraw") {
      if (!window.confirm(`هل تريد إلغاء اشتراك ${student.name} وتحديد حالته كمنسحب؟`)) {
        returnToStudentProfile();
        return false;
      }
      const updatedStudents = students.map((record) =>
        record.id === student.id
          ? { ...record, subscription: "withdrawn", updatedAt: new Date().toISOString() }
          : record
      );
      if (!(await saveStudents(updatedStudents))) return;
      renderStudents();
      returnToStudentProfile();
      return true;
    }

    if (actionButton.dataset.action === "archive" || actionButton.dataset.action === "restore") {
      const isArchiving = actionButton.dataset.action === "archive";
      const prompt = isArchiving
        ? `هل تريد أرشفة ملف ${student.name}؟ ستظل بياناته واشتراكاته محفوظة، وسيتوقف دخوله للبوابة.`
        : `هل تريد استعادة ملف ${student.name} وإعادة إتاحة حسابه؟`;
      if (!window.confirm(prompt)) {
        returnToStudentProfile();
        return false;
      }
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
      if (!(await saveStudents(updatedStudents))) return;
      renderStudents();
      returnToStudentProfile();
      return true;
    }

    if (actionButton.dataset.action === "reset-password") {
      try {
        await resetStudentPassword(student);
      } catch (error) {
        console.error("Unable to reset the student portal password.", error);
        storageMessage.textContent = error?.message?.includes("وظيفة إنشاء حسابات الطلاب") ||
          error?.message?.includes("انتهت جلسة الإدارة") ||
          error?.message?.includes("لا يملك صلاحية إدارة حسابات الطلاب")
          ? error.message
          : "تعذر إنشاء كلمة مرور جديدة. حاول مرة أخرى.";
        storageMessage.hidden = false;
        return false;
      }
      return true;
    }
    return false;
  }

  function returnToStudentProfile() {
    if (returnToStudentProfileId === null) return;
    window.location.assign(`student.html?id=${encodeURIComponent(returnToStudentProfileId)}`);
  }

  studentRows.addEventListener("click", (event) => {
    const actionButton = event.target.closest("button[data-action]");
    if (actionButton) {
      handleStudentAction(actionButton).catch((error) => {
        console.error("Unable to handle the student action.", error);
        storageMessage.textContent = "تعذر تنفيذ الإجراء. حاول مرة أخرى.";
        storageMessage.hidden = false;
      });
    }
  });

  await loadStudents();
  updateTermOptions();
  renderStudents();
  const params = new URLSearchParams(window.location.search);
  const requestedEditId = Number(params.get("edit"));
  const requestedActionId = Number(params.get("id"));
  const requestedAction = params.get("action");
  if (params.get("return") === "profile" &&
    students.some((student) => student.id === requestedActionId || student.id === requestedEditId)) {
    returnToStudentProfileId = requestedActionId || requestedEditId;
  }
  const requestedEditStudent = students.find((student) => student.id === requestedEditId);
  if (requestedEditStudent) openEditDialog(requestedEditStudent);
  const supportedActions = new Set([
    "payment", "renew", "toggle-status", "reset-password", "receipt",
    "withdraw", "archive", "restore",
  ]);
  if (supportedActions.has(requestedAction)) {
    const actionButton = document.createElement("button");
    actionButton.dataset.action = requestedAction;
    actionButton.dataset.studentId = String(requestedActionId);
    await handleStudentAction(actionButton);
  }
}

async function initializeSettings() {
  const termForm = document.querySelector("#term-form");
  if (!termForm) return;

  const systemSettingsForm = document.querySelector("#system-settings-form");
  if (systemSettingsForm) {
    const logoInput = document.querySelector("#system-logo-file");
    const logoPreview = document.querySelector("#system-logo-preview");
    const logoPreviewImage = document.querySelector("#system-logo-preview-image");
    const clearLogoButton = document.querySelector("#clear-system-logo");
    const systemError = document.querySelector("#system-settings-error");
    const systemSuccess = document.querySelector("#system-settings-success");
    let logoDataUrl = currentSystemSettings.logoDataUrl;

    function renderLogoPreview() {
      logoPreview.hidden = !logoDataUrl;
      if (logoDataUrl) logoPreviewImage.src = logoDataUrl;
      else logoPreviewImage.removeAttribute("src");
    }

    function renderSystemSettingsForm() {
      const { elements } = systemSettingsForm;
      elements.companyName.value = currentSystemSettings.companyName;
      elements.companyPhone.value = currentSystemSettings.companyPhone;
      elements.companyAddress.value = currentSystemSettings.companyAddress;
      elements.primaryColor.value = currentSystemSettings.primaryColor;
      elements.outboundLabel.value = currentSystemSettings.tripLabels.outbound;
      elements.returnLabel.value = currentSystemSettings.tripLabels.return;
      elements.pickupAreas.value = currentSystemSettings.pickupAreas.join("\n");
      logoDataUrl = currentSystemSettings.logoDataUrl;
      renderLogoPreview();
    }

    function showSystemError(message) {
      systemError.textContent = message;
      systemError.hidden = !message;
    }

    function readLogoFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => {
          if (typeof reader.result !== "string") {
            reject(new Error("تعذر قراءة ملف الشعار."));
            return;
          }
          resolve(reader.result);
        }, { once: true });
        reader.addEventListener("error", () => {
          reject(reader.error || new Error("تعذر قراءة ملف الشعار."));
        }, { once: true });
        reader.readAsDataURL(file);
      });
    }

    renderSystemSettingsForm();
    logoInput.addEventListener("change", async () => {
      const [file] = logoInput.files || [];
      if (!file) return;
      if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
        logoInput.value = "";
        showSystemError("صيغة الشعار يجب أن تكون PNG أو JPG أو WEBP أو SVG.");
        return;
      }
      if (file.size > 1024 * 1024) {
        logoInput.value = "";
        showSystemError("حجم الشعار يجب ألا يتجاوز 1 ميجابايت.");
        return;
      }
      try {
        logoDataUrl = await readLogoFile(file);
        renderLogoPreview();
        showSystemError("");
      } catch (error) {
        console.error("Unable to read the company logo.", error);
        logoInput.value = "";
        showSystemError(error.message || "تعذر قراءة ملف الشعار.");
      }
    });
    clearLogoButton.addEventListener("click", () => {
      logoDataUrl = "";
      logoInput.value = "";
      renderLogoPreview();
      showSystemError("");
    });
    registerGuardedSubmit(systemSettingsForm, async () => {
      systemSuccess.hidden = true;
      showSystemError("");
      if (!systemSettingsForm.reportValidity()) return;
      const { elements } = systemSettingsForm;
      const submitButton = systemSettingsForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        const savedSettings = await window.votaAPI.updateSystemSettings({
          companyName: elements.companyName.value,
          companyPhone: elements.companyPhone.value,
          companyAddress: elements.companyAddress.value,
          logoDataUrl,
          primaryColor: elements.primaryColor.value,
          tripLabels: {
            outbound: elements.outboundLabel.value,
            return: elements.returnLabel.value,
          },
          pickupAreas: elements.pickupAreas.value.split(/\r?\n/),
        });
        await applySystemSettings(savedSettings);
        renderSystemSettingsForm();
        systemSuccess.hidden = false;
      } catch (error) {
        console.error("Unable to save system settings.", error);
        showSystemError(error.message || "تعذر حفظ بيانات النظام.");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const adminLoginForm = document.querySelector("#admin-login-form");
  if (adminLoginForm) {
    const errorMessage = document.querySelector("#admin-login-error");
    const successMessage = document.querySelector("#admin-login-success");
    try {
      adminLoginForm.elements.loginName.value = await window.votaAPI.getAdministratorLoginName();
    } catch (error) {
      console.error("Unable to load administrator login name.", error);
      errorMessage.textContent = error.message || "تعذر تحميل اسم مستخدم الإدارة.";
      errorMessage.hidden = false;
    }
    adminLoginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorMessage.hidden = true;
      successMessage.hidden = true;
      if (!adminLoginForm.reportValidity()) return;
      const submitButton = adminLoginForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        await window.votaAPI.changeAdministratorLoginName(
          adminLoginForm.elements.currentPassword.value,
          adminLoginForm.elements.loginName.value
        );
        adminLoginForm.elements.currentPassword.value = "";
        successMessage.hidden = false;
      } catch (error) {
        console.error("Unable to change administrator login name.", error);
        errorMessage.textContent = error.message || "تعذر تحديث اسم المستخدم.";
        errorMessage.hidden = false;
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const adminPasswordForm = document.querySelector("#admin-password-form");
  adminPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorMessage = document.querySelector("#admin-password-error");
    const successMessage = document.querySelector("#admin-password-success");
    errorMessage.textContent = "";
    errorMessage.hidden = true;
    successMessage.hidden = true;
    if (!adminPasswordForm.reportValidity()) return;

    const currentPassword = adminPasswordForm.elements.currentPassword.value;
    const newPassword = adminPasswordForm.elements.newPassword.value;
    if (!/^[0-9]{8,128}$/.test(newPassword)) {
      errorMessage.textContent = "كلمة المرور الجديدة يجب أن تتكون من 8 أرقام على الأقل.";
      errorMessage.hidden = false;
      return;
    }
    if (newPassword !== adminPasswordForm.elements.confirmPassword.value) {
      errorMessage.textContent = "تأكيد كلمة المرور غير مطابق.";
      errorMessage.hidden = false;
      return;
    }

    const submitButton = adminPasswordForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      await window.votaData.changeAdministratorPassword(currentPassword, newPassword);
      adminPasswordForm.reset();
      successMessage.hidden = false;
    } catch (error) {
      console.error("Unable to change the administrator password.", error);
      errorMessage.textContent = error.message || "تعذر تغيير كلمة المرور.";
      errorMessage.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  });

  const termList = document.querySelector("#term-list");
  const termError = document.querySelector("#term-error");
  const storageError = document.querySelector("#settings-storage-error");
  const termPriceDialog = document.querySelector("#term-price-dialog");
  const termPriceForm = document.querySelector("#term-price-form");
  const priceError = document.querySelector("#term-price-error");
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

  async function saveTerms(updatedTerms) {
    try {
      for (const term of updatedTerms) {
        const existing = terms.find((record) => record.id === term.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(term)) {
            Object.assign(term, await window.votaAPI.updateTerm(term.id, term));
          }
        } else {
          Object.assign(term, await window.votaAPI.createTerm(term));
        }
      }
      const retainedIds = new Set(updatedTerms.map((term) => term.id));
      for (const term of terms) {
        if (!retainedIds.has(term.id)) await window.votaAPI.deleteTerm(term.id);
      }
      terms = updatedTerms;
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save terms.", error);
      const databaseErrorText = [
        error?.message,
        error?.details,
        error?.hint,
        error?.constraint,
      ].filter(Boolean).join(" ").toLowerCase();
      if (error?.code === "23505" && databaseErrorText.includes("terms_name_year_unique")) {
        termError.textContent = "الترم مسجل بالفعل لهذا العام الدراسي.";
      }
      storageError.textContent = "تعذر حفظ إعدادات الترم في قاعدة البيانات.";
      storageError.hidden = false;
      return false;
    }
  }

  async function saveTermSchedule(updatedTerms, updatedSubscriptions) {
    try {
      for (const term of updatedTerms) {
        const existing = terms.find((record) => record.id === term.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(term)) {
            Object.assign(term, await window.votaAPI.updateTerm(term.id, term));
          }
        } else {
          Object.assign(term, await window.votaAPI.createTerm(term));
        }
      }
      for (const subscription of updatedSubscriptions) {
        const existing = subscriptions.find((record) => record.id === subscription.id);
        if (existing) {
          if (JSON.stringify(existing) !== JSON.stringify(subscription)) {
            Object.assign(
              subscription,
              await window.votaAPI.updateSubscription(subscription.id, subscription)
            );
          }
        } else {
          Object.assign(subscription, await window.votaAPI.createSubscription(subscription));
        }
      }
      terms = updatedTerms;
      subscriptions = updatedSubscriptions;
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save term schedule.", error);
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

  registerGuardedSubmit(termForm, async () => {
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
      term.name.trim().toLocaleLowerCase("ar") === name.toLocaleLowerCase("ar") &&
      term.academicYear.trim().toLocaleLowerCase("ar") === academicYear.toLocaleLowerCase("ar")
    );
    if (duplicate) {
      termError.textContent = "الترم مسجل بالفعل لهذا العام الدراسي.";
      return;
    }

    const updatedTerms = [...terms, { id: -nextTermId, name, academicYear, priceCents, startDate, endDate }];
    if (!(await saveTerms(updatedTerms))) return;
    nextTermId++;
    terms = updatedTerms;
    termForm.reset();
    renderTerms();
  });

  termList.addEventListener("click", async (event) => {
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
    if (!(await saveTerms(updatedTerms))) return;
    terms = updatedTerms;
    termError.textContent = "";
    renderTerms();
  });

  registerGuardedSubmit(termPriceForm, async () => {
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
    if (!(await saveTermSchedule(updatedTerms, updatedSubscriptions))) return;
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
    terms = await window.votaAPI.getTerms();
    subscriptions = await window.votaAPI.getSubscriptions();
    nextTermId = terms.reduce((max, term) => Math.max(max, term.id), 0) + 1;
  } catch (error) {
    setStorageError("تعذر تحميل إعدادات الترم. لم يتم تعديلها.", error);
  }
  renderTerms();
}

async function initializeSubscriptions() {
  const subscriptionsTable = document.querySelector("#subscriptions-table");
  if (!subscriptionsTable) return;

  const subscriptionRows = document.querySelector("#subscription-rows");
  const paymentDialog = document.querySelector("#payment-dialog");
  const paymentForm = document.querySelector("#payment-form");
  const paymentError = document.querySelector("#payment-error");
  const storageError = document.querySelector("#subscriptions-storage-error");
  const termFilter = document.querySelector("#subscription-term-filter");
  const statusFilter = document.querySelector("#subscription-status-filter");
  const sortSelect = document.querySelector("#subscription-sort");
  const searchInput = document.querySelector("#subscription-search");
  const report = document.querySelector("#subscriptions-report");
  const exportButton = document.querySelector("#export-subscriptions");
  const printReportButton = document.querySelector("#print-subscriptions-report");
  const methodLabels = { cash: "نقدي", transfer: "تحويل", other: "أخرى" };
  const currency = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let subscriptions = [];
  let activeSubscriptionId = null;
  let activePaymentId = null;
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
    const remaining = subscription.priceCents - paid;
    if (remaining > 0 && subscription.endDate && subscription.endDate < localDateString()) {
      return { label: "متأخر عن السداد", className: "payment-overdue" };
    }
    if (paid > 0) return { label: "مدفوع جزئيًا", className: "payment-partial" };
    return { label: "غير مدفوع", className: "payment-unpaid" };
  }

  function paymentFilterState(subscription) {
    const paid = paidAmount(subscription);
    if (paid >= subscription.priceCents) return "paid";
    if (subscription.priceCents - paid > 0 &&
      subscription.endDate && subscription.endDate < localDateString()) return "overdue";
    return paid > 0 ? "partial" : "unpaid";
  }

  function remainingAmount(subscription) {
    return Math.max(0, subscription.priceCents - paidAmount(subscription));
  }

  function visibleSubscriptions() {
    const query = searchInput.value.trim().toLocaleLowerCase("ar");
    const term = termFilter.value;
    const status = statusFilter.value;
    const visible = subscriptions.filter((item) =>
      `${item.studentName} ${item.studentPhone} ${item.termName} ${item.academicYear}`
        .toLocaleLowerCase("ar").includes(query) &&
      (!term || String(item.termId) === term) &&
      (!status || paymentFilterState(item) === status)
    );
    if (sortSelect.value === "remaining") {
      visible.sort((a, b) => remainingAmount(b) - remainingAmount(a));
    } else if (sortSelect.value === "expiry") {
      visible.sort((a, b) => (a.endDate || "9999-12-31").localeCompare(b.endDate || "9999-12-31"));
    }
    return visible;
  }

  function updateTermFilter() {
    const selected = termFilter.value;
    const terms = new Map();
    subscriptions.forEach((item) => {
      if (item.termId === undefined || item.termId === null) return;
      terms.set(String(item.termId), `${item.termName} — ${item.academicYear}`);
    });
    termFilter.replaceChildren(new Option("كل الترمات", ""));
    [...terms.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ar"))
      .forEach(([value, label]) => termFilter.add(new Option(label, value)));
    termFilter.value = terms.has(selected) ? selected : "";
  }

  function showStorageError(message, error) {
    console.error(message, error);
    storageError.textContent = message;
    storageError.hidden = false;
    storageReady = false;
  }

  function showActionError(message, error) {
    console.error(message, error);
    storageError.textContent = message;
    storageError.hidden = false;
  }

  async function persistPayment(updatedSubscriptions, studentId) {
    try {
      if (!subscriptions.some((subscription) => subscription.studentId === studentId)) {
        throw new TypeError("Payment student record was not found.");
      }
      for (const subscription of updatedSubscriptions) {
        const existing = subscriptions.find((record) => record.id === subscription.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(subscription)) {
          Object.assign(
            subscription,
            await window.votaAPI.updateSubscription(subscription.id, subscription)
          );
        }
      }
      subscriptions = updatedSubscriptions;
      storageError.textContent = "";
      storageError.hidden = true;
      return true;
    } catch (error) {
      console.error("Unable to save the subscription payment.", error);
      storageError.textContent = "تعذر حفظ الدفعة في قاعدة البيانات.";
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
    updateTermFilter();
    const visible = visibleSubscriptions();
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
      const remaining = remainingAmount(subscription);
      const state = paymentState(subscription);
      const status = document.createElement("span");
      status.className = `payment-status ${state.className}`;
      status.textContent = state.label;
      const statusCell = document.createElement("td");
      statusCell.append(status);
      if (state.className === "payment-overdue") row.classList.add("is-overdue");

      const action = document.createElement("button");
      action.className = "record-payment-button";
      action.type = "button";
      action.dataset.subscriptionId = String(subscription.id);
      action.disabled = remaining <= 0 || !storageReady;
      action.textContent = remaining > 0 ? "تسجيل دفعة" : "مكتمل";
      const historyButton = document.createElement("button");
      historyButton.className = "subscription-history-button";
      historyButton.type = "button";
      historyButton.dataset.subscriptionId = String(subscription.id);
      historyButton.textContent = `الدفعات (${subscription.payments.length})`;
      const actionCell = document.createElement("td");
      actionCell.append(historyButton, action);

      const reminder = document.createElement("button");
      reminder.className = "subscription-whatsapp-button";
      reminder.type = "button";
      reminder.dataset.subscriptionId = String(subscription.id);
      reminder.disabled = remaining <= 0 || !subscription.studentPhone || !storageReady;
      reminder.textContent = "تذكير واتساب";
      const reminderCell = document.createElement("td");
      reminderCell.append(reminder);

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
        reminderCell,
        actionCell
      );
      subscriptionRows.append(row);
    }

    const noSubscriptions = subscriptions.length === 0;
    const noResults = !noSubscriptions && visible.length === 0;
    subscriptionsTable.hidden = noSubscriptions || noResults;
    exportButton.disabled = !storageReady;
    printReportButton.disabled = !storageReady;
    document.querySelector("#subscriptions-empty").hidden = !noSubscriptions && !noResults;
    document.querySelector("#subscriptions-empty-title").textContent = noResults
      ? "لا توجد نتائج مطابقة"
      : "لا توجد اشتراكات مسجلة";
    document.querySelector("#subscriptions-empty-description").textContent = noResults
      ? "غيّر البحث أو الفلاتر لعرض اشتراكات أخرى."
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
    activePaymentId = null;
  }

  function openPaymentDialog(subscription) {
    activeSubscriptionId = subscription.id;
    activePaymentId = null;
    paymentError.textContent = "";
    paymentForm.reset();
    document.querySelector("#payment-dialog-title").textContent = "تسجيل دفعة";
    paymentForm.querySelector('button[type="submit"]').textContent = "حفظ الدفعة";
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
        const entry = document.createElement("div");
        entry.className = "payment-history-entry";
        const summary = document.createElement("span");
        const date = new Date(payment.paidAt);
        const readableDate = Number.isNaN(date.getTime()) ? "" :
          new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(date);
        summary.textContent = `${formatMoney(payment.amountCents)} — ${methodLabels[payment.method] || "أخرى"}${readableDate ? ` — ${readableDate}` : ""} — ${payment.receiptNumber || "بدون رقم مرجعي"}`;
        const actions = document.createElement("div");
        actions.className = "payment-history-actions";
        const receiptButton = document.createElement("button");
        receiptButton.type = "button";
        receiptButton.className = "payment-record-action";
        receiptButton.dataset.paymentAction = "receipt";
        receiptButton.dataset.paymentId = String(payment.id || payment.receiptNumber);
        receiptButton.textContent = "طباعة الإيصال";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "payment-record-action";
        editButton.dataset.paymentAction = "edit";
        editButton.dataset.paymentId = String(payment.id || payment.receiptNumber);
        editButton.textContent = "تصحيح";
        actions.append(receiptButton, editButton);
        entry.append(summary, actions);
        history.append(entry);
      }
    } else {
      history.textContent = "لا توجد دفعات سابقة.";
    }
    const audit = document.querySelector("#payment-audit");
    audit.replaceChildren();
    const auditEntries = (subscription.paymentAudit || []).slice().reverse();
    if (auditEntries.length) {
      const auditTitle = document.createElement("strong");
      auditTitle.className = "payment-audit-title";
      auditTitle.textContent = "سجل تعديلات الدفعات";
      audit.append(auditTitle);
      auditEntries.forEach((change) => {
        const entry = document.createElement("p");
        const previous = change.before
          ? `${formatMoney(change.before.amountCents)} (${methodLabels[change.before.method] || "أخرى"})`
          : "—";
        const next = change.after
          ? `${formatMoney(change.after.amountCents)} (${methodLabels[change.after.method] || "أخرى"})`
          : "—";
        const date = new Date(change.changedAt);
        const dateLabel = Number.isNaN(date.getTime())
          ? ""
          : new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
        entry.textContent = `${change.action === "payment-corrected" ? "تصحيح دفعة" : change.action === "payment-removed" ? "إلغاء دفعة" : "تسجيل دفعة"}: ${previous} ← ${next}${dateLabel ? ` — ${dateLabel}` : ""}`;
        audit.append(entry);
      });
    }
    const amountInput = paymentForm.elements.amount;
    amountInput.max = String((subscription.priceCents - paid) / 100);
    paymentDialog.showModal();
    amountInput.focus();
  }

  subscriptionRows.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-subscription-id]");
    if (!button) return;
    const subscription = subscriptions.find(
      (item) => item.id === Number(button.dataset.subscriptionId)
    );
    if (!subscription) return;
    if (button.classList.contains("subscription-whatsapp-button")) {
      if (button.disabled) return;
      const phone = subscription.studentPhone.replace(/\D/g, "");
      const normalizedPhone = phone.startsWith("00")
        ? phone.slice(2)
        : phone.startsWith("0")
          ? `20${phone.slice(1)}`
          : phone;
      if (!/^\d{10,15}$/.test(normalizedPhone)) {
        window.alert("رقم هاتف الطالب غير صالح لإرسال تذكير واتساب.");
        return;
      }
      const message = `مرحبًا ${subscription.studentName}، نذكّركم بوجود مبلغ متبقٍ قدره ${formatMoney(remainingAmount(subscription))} لاشتراك ${subscription.termName} — ${subscription.academicYear}.`;
      if (window.confirm(`راجع رسالة التذكير قبل فتح واتساب:\n\n${message}\n\nهل تريد المتابعة؟`)) {
        const whatsappWindow = window.open(
          `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`,
          "_blank"
        );
        if (whatsappWindow) whatsappWindow.opener = null;
        else window.alert("تعذر فتح واتساب. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");
      }
      return;
    }
    if (button.classList.contains("subscription-history-button") ||
      button.classList.contains("record-payment-button")) {
      if (button.disabled && button.classList.contains("record-payment-button")) return;
      openPaymentDialog(subscription);
    }
  });

  [searchInput, termFilter, statusFilter, sortSelect].forEach((input) =>
    input.addEventListener(input === searchInput ? "input" : "change", render)
  );
  exportButton.addEventListener("click", () => {
    try {
      const rows = visibleSubscriptions().map((subscription) => [
        subscription.studentName,
        subscription.studentPhone,
        `${subscription.termName} — ${subscription.academicYear}`,
        subscription.startDate,
        subscription.endDate,
        subscription.priceCents / 100,
        paidAmount(subscription) / 100,
        remainingAmount(subscription) / 100,
        paymentState(subscription).label,
      ]);
      const csvCell = (value) => {
        const text = String(value ?? "");
        const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
      };
      const headers = ["الطالب", "الهاتف", "الترم", "بداية الاشتراك", "نهاية الاشتراك", "السعر", "المدفوع", "المتبقي", "حالة السداد"];
      const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
      const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `vota-subscriptions-${localDateString()}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      if (storageReady) storageError.hidden = true;
    } catch (error) {
      showActionError("تعذر تصدير تقرير الاشتراكات.", error);
    }
  });
  printReportButton.addEventListener("click", () => {
    const visible = visibleSubscriptions();
    const heading = document.createElement("h1");
    heading.textContent = `تقرير تحصيل الاشتراكات — ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date())}`;
    const summary = document.createElement("p");
    summary.textContent = `عدد الاشتراكات: ${visible.length} | المستحق: ${formatMoney(visible.reduce((sum, item) => sum + item.priceCents, 0))} | المحصل: ${formatMoney(visible.reduce((sum, item) => sum + paidAmount(item), 0))} | المتبقي: ${formatMoney(visible.reduce((sum, item) => sum + remainingAmount(item), 0))}`;
    const table = document.createElement("table");
    const headers = ["الطالب", "الترم", "النهاية", "المستحق", "المدفوع", "المتبقي", "الحالة"];
    const header = document.createElement("tr");
    headers.forEach((value) => {
      const cell = document.createElement("th");
      cell.textContent = value;
      header.append(cell);
    });
    const thead = document.createElement("thead");
    thead.append(header);
    const tbody = document.createElement("tbody");
    visible.forEach((item) => {
      const row = document.createElement("tr");
      [
        item.studentName,
        `${item.termName} — ${item.academicYear}`,
        formatLocalDate(item.endDate),
        formatMoney(item.priceCents),
        formatMoney(paidAmount(item)),
        formatMoney(remainingAmount(item)),
        paymentState(item).label,
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      tbody.append(row);
    });
    table.append(thead, tbody);
    report.replaceChildren(heading, summary, table);
    report.hidden = false;
    document.body.classList.add("is-printing-subscriptions-report");
    try {
      window.print();
      if (storageReady) storageError.hidden = true;
    } catch (error) {
      showActionError("تعذرت طباعة تقرير الاشتراكات.", error);
    } finally {
      document.body.classList.remove("is-printing-subscriptions-report");
      report.hidden = true;
    }
  });
  document.querySelector("#payment-history").addEventListener("click", (event) => {
    const button = event.target.closest("[data-payment-action]");
    if (!button) return;
    const subscription = subscriptions.find((item) => item.id === activeSubscriptionId);
    const payment = subscription?.payments.find((item) =>
      String(item.id || item.receiptNumber) === button.dataset.paymentId
    );
    if (!subscription || !payment) return;
    if (button.dataset.paymentAction === "receipt") {
      printReceipt({
        id: subscription.studentId,
        name: subscription.studentName,
        phone: subscription.studentPhone,
      }, subscription, payment);
      return;
    }
    activePaymentId = payment.id || payment.receiptNumber;
    document.querySelector("#payment-dialog-title").textContent = "تصحيح دفعة مسجلة";
    paymentForm.querySelector('button[type="submit"]').textContent = "حفظ التصحيح";
    paymentForm.elements.amount.value = String(payment.amountCents / 100);
    paymentForm.elements.amount.max = String(
      (subscription.priceCents - paidAmount(subscription) + payment.amountCents) / 100
    );
    paymentForm.elements.method.value = payment.method;
    paymentError.textContent = "";
    paymentForm.elements.amount.focus();
  });
  document.querySelector("#close-payment-dialog").addEventListener("click", closePaymentDialog);
  document.querySelector("#cancel-payment").addEventListener("click", closePaymentDialog);
  paymentDialog.addEventListener("click", (event) => {
    if (event.target === paymentDialog) closePaymentDialog();
  });
  paymentDialog.addEventListener("cancel", () => {
    activeSubscriptionId = null;
    activePaymentId = null;
    paymentForm.reset();
    paymentError.textContent = "";
  });

  registerGuardedSubmit(paymentForm, async () => {
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
    const method = String(paymentForm.elements.method.value);
    const previousPayment = activePaymentId === null
      ? null
      : subscription.payments.find((item) =>
        String(item.id || item.receiptNumber) === String(activePaymentId)
      );
    const maxAllowed = subscription.priceCents - paidAmount(subscription) +
      (previousPayment?.amountCents || 0);
    if (amountCents < 1 || amountCents > maxAllowed || !Object.hasOwn(methodLabels, method)) {
      paymentError.textContent = `أدخل مبلغًا أكبر من صفر ولا يتجاوز ${formatMoney(maxAllowed)}.`;
      return;
    }
    const payment = previousPayment
      ? { ...previousPayment, amountCents, method }
      : {
          amountCents,
          method,
          paidAt: new Date().toISOString(),
          receiptNumber: `VOTA-${subscription.studentId}-${subscription.id}-${subscription.payments.length + 1}`,
        };
    const updatedSubscriptions = subscriptions.map((item) =>
      item.id === subscription.id
        ? {
            ...item,
            payments: previousPayment
              ? item.payments.map((entry) =>
                String(entry.id || entry.receiptNumber) === String(activePaymentId) ? payment : entry
              )
              : [...item.payments, payment],
          }
        : item
    );
    if (!(await persistPayment(updatedSubscriptions, subscription.studentId))) {
      paymentError.textContent = "لم يتم حفظ الدفعة. حاول مرة أخرى.";
      return;
    }
    subscriptions = updatedSubscriptions;
    closePaymentDialog();
    activePaymentId = null;
    render();
    printReceipt({
      id: subscription.studentId,
      name: subscription.studentName,
      phone: subscription.studentPhone,
    }, subscription, payment);
  });

  try {
    subscriptions = await window.votaAPI.getSubscriptions();
  } catch (error) {
    showStorageError("تعذر تحميل الاشتراكات. لم يتم تعديلها.", error);
  }

  render();
}

async function initializeStudentCards() {
  const grid = document.querySelector("#student-cards-grid");
  if (!grid) return;
  const backPrintGrid = document.querySelector("#student-cards-back-print-grid");

  const search = document.querySelector("#cards-search");
  const count = document.querySelector("#cards-count");
  const emptyState = document.querySelector("#cards-empty");
  const emptyTitle = document.querySelector("#cards-empty-title");
  const emptyDescription = document.querySelector("#cards-empty-description");
  const errorMessage = document.querySelector("#cards-error");
  const printSelectedButton = document.querySelector("#print-selected-cards");
  const printVisibleButton = document.querySelector("#print-visible-cards");
  const selectVisibleInput = document.querySelector("#select-visible-cards");
  const clearFiltersButton = document.querySelector("#clear-card-filters");
  const clearSelectionButton = document.querySelector("#clear-card-selection");
  const settingsTrigger = document.querySelector("#open-card-settings");
  const settingsDialog = document.querySelector("#cards-settings-dialog");
  const closeSettingsButton = document.querySelector("#close-card-settings");
  const filters = {
    university: document.querySelector("#cards-university-filter"),
    faculty: document.querySelector("#cards-faculty-filter"),
    country: document.querySelector("#cards-country-filter"),
    term: document.querySelector("#cards-term-filter"),
  };
  const printLayout = document.querySelector("#cards-print-layout");
  const printSize = document.querySelector("#cards-print-size");
  const displayOptions = {
    term: document.querySelector("#show-term"),
    price: document.querySelector("#show-price"),
    qr: document.querySelector("#show-qr"),
  };
  const numberFormatter = new Intl.NumberFormat("ar-EG");
  const moneyFormatter = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  let cards = [];
  let visibleCards = [];
  const selectedStudentIds = new Set();

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makeCompanyLogo(className) {
    const mark = makeElement("span", className, "v.");
    if (currentSystemSettings.logoDataUrl) {
      const image = makeElement("img", "student-card-logo-image");
      image.alt = "";
      image.src = currentSystemSettings.logoDataUrl;
      mark.replaceChildren(image);
    }
    return mark;
  }

  function makeCardIcon(pathData) {
    const namespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(namespace, "svg");
    icon.setAttribute("viewBox", "0 0 20 20");
    icon.setAttribute("fill", "none");
    icon.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", pathData);
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    icon.append(path);
    return icon;
  }

  function addCardDetail(parent, label, value, className = "") {
    const detail = makeElement("div", `student-card-detail ${className}`.trim());
    detail.append(makeElement("span", "student-card-detail-label", label));
    detail.append(makeElement("strong", "student-card-detail-value", value || "—"));
    parent.append(detail);
  }

  function createCardBack() {
    const back = makeElement("div", "student-id-card student-id-card-back student-card-back-preview");
    back.hidden = true;
    const brand = makeElement("div", "student-card-back-brand");
    brand.append(makeCompanyLogo("student-card-back-mark"));
    brand.append(makeElement("strong", "student-card-back-name", currentSystemSettings.companyName));
    brand.append(makeElement("small", "student-card-back-caption", "بطاقة طالب"));
    back.append(brand);
    back.append(makeElement("p", "student-card-back-tagline", "طول ما أنت معانا، مشوارك في أمان"));
    return back;
  }

  function createPrintCardBack() {
    const item = makeElement("div", "student-card-back-print-item");
    const back = createCardBack();
    back.hidden = false;
    item.append(back);
    return item;
  }

  function createStudentCodeQr(value) {
    const bytes = Array.from(new TextEncoder().encode(value));
    const version = 2;
    const size = version * 4 + 17;
    const dataCodewordCount = 34;
    const errorCodewordCount = 10;
    if (bytes.length > 32) throw new Error("Student code is too long for the QR code.");

    const bits = [];
    function appendBits(number, length) {
      for (let bit = length - 1; bit >= 0; bit--) bits.push((number >>> bit) & 1);
    }

    appendBits(0b0100, 4);
    appendBits(bytes.length, 8);
    bytes.forEach((byte) => appendBits(byte, 8));
    const dataCapacity = dataCodewordCount * 8;
    for (let bit = 0; bit < Math.min(4, dataCapacity - bits.length); bit++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let offset = 0; offset < bits.length; offset += 8) {
      data.push(bits.slice(offset, offset + 8).reduce((word, bit) => (word << 1) | bit, 0));
    }
    for (let pad = 0; data.length < dataCodewordCount; pad++) data.push(pad % 2 ? 0x11 : 0xec);

    function multiply(a, b) {
      let product = 0;
      for (let bit = 7; bit >= 0; bit--) {
        product = (product << 1) ^ ((product >>> 7) * 0x11d);
        product ^= ((b >>> bit) & 1) * a;
      }
      return product;
    }

    const divisor = Array(errorCodewordCount).fill(0);
    divisor[errorCodewordCount - 1] = 1;
    let root = 1;
    for (let index = 0; index < errorCodewordCount; index++) {
      for (let coefficient = 0; coefficient < errorCodewordCount; coefficient++) {
        divisor[coefficient] = multiply(divisor[coefficient], root);
        if (coefficient + 1 < errorCodewordCount) {
          divisor[coefficient] ^= divisor[coefficient + 1];
        }
      }
      root = multiply(root, 2);
    }
    const remainder = Array(errorCodewordCount).fill(0);
    for (const byte of data) {
      const factor = byte ^ remainder.shift();
      remainder.push(0);
      for (let index = 0; index < errorCodewordCount; index++) {
        remainder[index] ^= multiply(divisor[index], factor);
      }
    }
    const codewordBits = [...data, ...remainder].flatMap((word) =>
      Array.from({ length: 8 }, (_, bit) => (word >>> (7 - bit)) & 1)
    );
    const matrix = Array.from({ length: size }, () => Array(size).fill(null));

    function setModule(x, y, dark) {
      if (x >= 0 && x < size && y >= 0 && y < size) matrix[y][x] = dark;
    }

    function drawFinder(centerX, centerY) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setModule(centerX + dx, centerY + dy, distance !== 2 && distance !== 4);
        }
      }
    }

    drawFinder(3, 3);
    drawFinder(size - 4, 3);
    drawFinder(3, size - 4);
    for (let index = 8; index < size - 8; index++) {
      setModule(6, index, index % 2 === 0);
      setModule(index, 6, index % 2 === 0);
    }
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setModule(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }

    const formatData = 0b01000;
    let formatRemainder = formatData;
    for (let bit = 0; bit < 10; bit++) {
      formatRemainder = (formatRemainder << 1) ^ (((formatRemainder >>> 9) & 1) * 0x537);
    }
    const formatBits = ((formatData << 10) | formatRemainder) ^ 0x5412;
    for (let bit = 0; bit <= 5; bit++) setModule(8, bit, ((formatBits >>> bit) & 1) !== 0);
    setModule(8, 7, ((formatBits >>> 6) & 1) !== 0);
    setModule(8, 8, ((formatBits >>> 7) & 1) !== 0);
    setModule(7, 8, ((formatBits >>> 8) & 1) !== 0);
    for (let bit = 9; bit < 15; bit++) {
      setModule(14 - bit, 8, ((formatBits >>> bit) & 1) !== 0);
    }
    for (let bit = 0; bit < 8; bit++) {
      setModule(size - 1 - bit, 8, ((formatBits >>> bit) & 1) !== 0);
    }
    for (let bit = 8; bit < 15; bit++) {
      setModule(8, size - 15 + bit, ((formatBits >>> bit) & 1) !== 0);
    }
    setModule(8, size - 8, true);

    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
        for (let offset = 0; offset < 2; offset++) {
          const x = right - offset;
          if (matrix[y][x] !== null) continue;
          let dark = bitIndex < codewordBits.length && codewordBits[bitIndex] === 1;
          bitIndex++;
          if ((x + y) % 2 === 0) dark = !dark;
          matrix[y][x] = dark;
        }
      }
    }

    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", "student-card-qr");
    svg.setAttribute("viewBox", `0 0 ${size + 4} ${size + 4}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `QR code for ${value}`);
    const background = document.createElementNS(namespace, "rect");
    background.setAttribute("width", String(size + 4));
    background.setAttribute("height", String(size + 4));
    background.setAttribute("fill", "#fff");
    svg.append(background);
    const path = document.createElementNS(namespace, "path");
    const commands = [];
    matrix.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) commands.push(`M${x + 2} ${y + 2}h1v1h-1z`);
    }));
    path.setAttribute("d", commands.join(""));
    path.setAttribute("fill", "#102f35");
    svg.append(path);
    return svg;
  }

  function createCardRecord(student, subscription, termsById) {
    const term = subscription ? termsById.get(subscription.termId) : null;
    return {
      student,
      subscription,
      termId: subscription?.termId || null,
      termName: term?.name || subscription?.termName || "—",
      academicYear: term?.academicYear || subscription?.academicYear || "",
      validUntil: subscription?.endDate || term?.endDate || "",
      price: Number.isSafeInteger(subscription?.priceCents) && subscription.priceCents >= 0
        ? `${moneyFormatter.format(subscription.priceCents / 100)} ج.م`
        : "—",
    };
  }

  function createCardItem(record) {
    const { student } = record;
    const item = makeElement("article", "student-card-item");
    const selectLabel = makeElement("label", "student-card-select");
    const selectInput = makeElement("input");
    selectInput.type = "checkbox";
    selectInput.checked = selectedStudentIds.has(student.id);
    selectInput.dataset.selectCardId = String(student.id);
    selectLabel.append(selectInput, makeElement("span", "", "تحديد"));
    item.append(selectLabel);
    const card = makeElement("div", "student-id-card");
    card.dataset.cardId = String(student.id);

    const brandLine = makeElement("div", "student-card-brand-line");
    brandLine.append(makeCompanyLogo("student-card-brand-mark"));
    const brandName = makeElement("span", "student-card-brand-name");
    brandName.append(makeElement("strong", "", currentSystemSettings.companyName));
    brandName.append(makeElement("small", "", "بطاقة طالب"));
    brandLine.append(brandName);
    card.append(brandLine);

    const cardBody = makeElement("div", "student-card-body");
    const photoColumn = makeElement("div", "student-card-photo-column");
    const photo = makeElement("div", "student-card-photo");
    const photoPlaceholder = makeElement("div", "student-card-photo-placeholder");
    photoPlaceholder.append(makeCompanyLogo("student-card-photo-logo"));
    photo.append(photoPlaceholder);
    if (student.photoDataUrl) {
      const image = makeElement("img", "student-card-image");
      image.alt = `صورة ${student.name}`;
      image.addEventListener("load", () => photo.classList.add("has-photo"), { once: true });
      image.addEventListener("error", () => image.remove(), { once: true });
      photo.append(image);
      image.src = student.photoDataUrl;
    }
    photoColumn.append(photo);
    if (displayOptions.qr.checked) {
      const qrWrap = makeElement("div", "student-card-qr-wrap");
      qrWrap.append(createStudentCodeQr(studentUsername(student.id)));
      photoColumn.append(qrWrap);
    }
    cardBody.append(photoColumn);

    const details = makeElement("div", "student-card-details");
    const identity = makeElement("div", "student-card-identity");
    identity.append(makeElement("h2", "student-card-student-name", student.name));
    const studentCode = makeElement("span", "student-card-code");
    studentCode.append(makeElement("small", "", "كود الطالب"));
    studentCode.append(makeElement("strong", "", studentUsername(student.id)));
    identity.append(studentCode);
    details.append(identity);
    addCardDetail(details, "الكلية", student.faculty);
    addCardDetail(details, "الجامعة", student.university);
    addCardDetail(details, "البلد", student.pickup);
    if (record.validUntil) {
      addCardDetail(details, "صالح حتى", formatLocalDate(record.validUntil));
    }
    const meta = makeElement("div", "student-card-meta");
    if (displayOptions.term.checked) {
      const termDetail = makeElement("div", "student-card-meta-item");
      termDetail.append(makeElement("small", "", "الترم"));
      termDetail.append(makeElement("strong", "", record.termName));
      meta.append(termDetail);
    }
    if (displayOptions.price.checked) {
      const priceDetail = makeElement("div", "student-card-meta-item");
      priceDetail.append(makeElement("small", "", "قيمة الاشتراك"));
      priceDetail.append(makeElement("strong", "", record.price));
      meta.append(priceDetail);
    }
    if (meta.childElementCount) details.append(meta);
    cardBody.append(details);
    card.append(cardBody);

    card.append(makeElement("div", "student-card-footer", currentSystemSettings.companyName));
    item.append(card);
    const back = createCardBack();
    item.append(back);

    const actions = makeElement("div", "student-card-actions");
    const printButton = makeElement("button", "secondary-button student-card-print-button");
    printButton.type = "button";
    printButton.dataset.printCardId = String(student.id);
    printButton.setAttribute("aria-label", "طباعة هذا الكارنيه");
    printButton.title = "طباعة هذا الكارنيه";
    printButton.append(makeCardIcon("M5.5 6V2.8h9V6m-9 8H3.2V7.2h13.6V14h-2.3m-9 0v3.2h9V14h-9Zm7-4h2"));
    actions.append(printButton);
    const sideButton = makeElement("button", "secondary-button student-card-side-button");
    sideButton.type = "button";
    sideButton.dataset.toggleCardSide = "";
    sideButton.setAttribute("aria-pressed", "false");
    sideButton.setAttribute("aria-label", "معاينة الظهر");
    sideButton.title = "معاينة الظهر";
    sideButton.append(makeCardIcon("M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-9Zm3.2 2.2h7.6m-7.6 4.6h4.2m3.3-9.2 1.8-1.8m-1.8 1.8 1.8 1.8"));
    actions.append(sideButton);
    item.append(actions);
    return item;
  }

  function getFilterValue(record, key) {
    if (key === "university") return record.student.university || "";
    if (key === "faculty") return record.student.faculty || "";
    if (key === "country") return record.student.pickup || "";
    return record.termId ? String(record.termId) : "";
  }

  function updateFilterOptions() {
    const placeholders = {
      university: "كل الجامعات",
      faculty: "كل الكليات",
      country: "كل البلاد",
      term: "كل الترمات",
    };
    const filterEntries = Object.entries(filters);

    filterEntries.forEach(([key, select], index) => {
      const selectedValue = select.value;
      const parentFilters = filterEntries.slice(0, index);
      const availableRecords = cards.filter((record) =>
        parentFilters.every(([parentKey, parentFilter]) =>
          !parentFilter.value || getFilterValue(record, parentKey) === parentFilter.value
        )
      );
      const options = new Map();
      availableRecords.forEach((record) => {
        const value = getFilterValue(record, key);
        if (!value) return;
        const label = key === "term"
          ? `${record.termName}${record.academicYear ? ` — ${record.academicYear}` : ""}`
          : value;
        options.set(value, label);
      });

      select.replaceChildren(new Option(placeholders[key], ""));
      [...options.entries()]
        .sort((left, right) => left[1].localeCompare(right[1], "ar"))
        .forEach(([value, label]) => select.add(new Option(label, value)));
      select.value = options.has(selectedValue) ? selectedValue : "";
    });

    clearFiltersButton.hidden = !search.value.trim() && Object.values(filters).every((filter) => !filter.value);
  }

  function render() {
    updateFilterOptions();
    const query = search.value.trim().toLocaleLowerCase("ar");
    visibleCards = cards.filter(({ student, termId, termName, academicYear }) => {
      const matchesQuery = [
        studentUsername(student.id),
        student.name,
        student.faculty,
        student.university,
        student.pickup,
        termName,
        academicYear,
      ].some((value) => String(value || "").toLocaleLowerCase("ar").includes(query));
      return matchesQuery &&
        (!filters.university.value || student.university === filters.university.value) &&
        (!filters.faculty.value || student.faculty === filters.faculty.value) &&
        (!filters.country.value || student.pickup === filters.country.value) &&
        (!filters.term.value || String(termId || "") === filters.term.value);
    });
    grid.replaceChildren(...cards.map((record) => {
      const item = createCardItem(record);
      item.hidden = !visibleCards.some(({ student }) => student.id === record.student.id);
      return item;
    }));
    const selectedCount = cards.filter(({ student }) => selectedStudentIds.has(student.id)).length;
    count.textContent = `${numberFormatter.format(visibleCards.length)} نتيجة ظاهرة · ${numberFormatter.format(selectedCount)} محدد`;
    printSelectedButton.disabled = selectedCount === 0;
    printVisibleButton.disabled = visibleCards.length === 0;
    emptyState.hidden = visibleCards.length !== 0;
    const selectedVisibleCount = visibleCards.filter(({ student }) => selectedStudentIds.has(student.id)).length;
    selectVisibleInput.checked = visibleCards.length > 0 && selectedVisibleCount === visibleCards.length;
    selectVisibleInput.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleCards.length;
    clearSelectionButton.hidden = selectedCount === 0;
    if (visibleCards.length === 0 && cards.length === 0) {
      emptyTitle.textContent = "لا يوجد طلاب لعرضهم";
      emptyDescription.textContent = "أضف طالبًا من قسم إدارة الطلاب لبدء إنشاء الكارنيهات.";
    } else {
      emptyTitle.textContent = "لا توجد كارنيهات مطابقة";
      emptyDescription.textContent = query
        ? "غيّر عبارة البحث أو الفلاتر لعرض الطلاب."
        : "عدّل الفلاتر لعرض نتائج أخرى.";
    }
  }

  async function printCards(studentIds, layout = printLayout.value) {
    const requestedIds = new Set(studentIds);
    const printRecords = cards.filter(({ student }) => requestedIds.has(student.id));
    backPrintGrid.replaceChildren(...printRecords.map(() => createPrintCardBack()));
    let lastTarget = null;
    grid.querySelectorAll(".student-card-item").forEach((item) => {
      const selected = requestedIds.has(Number(item.querySelector(".student-id-card").dataset.cardId));
      item.classList.toggle("is-print-target", selected);
      item.classList.remove("is-last-print-target");
      if (selected) lastTarget = item;
    });
    lastTarget?.classList.add("is-last-print-target");
    const size = {
      standard: [85.6, 54],
      compact: [76, 48],
      small: [70, 44],
    }[printSize.value] || [85.6, 54];
    document.body.style.setProperty("--card-print-width", `${size[0]}mm`);
    document.body.style.setProperty("--card-print-height", `${size[1]}mm`);
    document.body.classList.add("is-printing-cards");
    document.body.classList.toggle("is-single-card-page", layout === "single");
    try {
      await Promise.all([...grid.querySelectorAll(".student-card-item.is-print-target img")].map((image) =>
        image.decode().catch(() => undefined)
      ));
      window.print();
    } finally {
      document.body.classList.remove("is-printing-cards", "is-single-card-page");
      document.body.style.removeProperty("--card-print-width");
      document.body.style.removeProperty("--card-print-height");
      grid.querySelectorAll(".student-card-item").forEach((item) =>
        item.classList.remove("is-print-target", "is-last-print-target")
      );
    }
  }

  search.addEventListener("input", render);
  Object.values(filters).forEach((filter) => filter.addEventListener("change", render));
  settingsTrigger.addEventListener("click", () => settingsDialog.showModal());
  closeSettingsButton.addEventListener("click", () => settingsDialog.close());
  settingsDialog.addEventListener("click", (event) => {
    if (event.target !== settingsDialog) return;
    const bounds = settingsDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) settingsDialog.close();
  });
  settingsDialog.addEventListener("close", () => settingsTrigger.focus());
  clearFiltersButton.addEventListener("click", () => {
    search.value = "";
    Object.values(filters).forEach((filter) => {
      filter.value = "";
    });
    render();
  });
  Object.values(displayOptions).forEach((option) => option.addEventListener("change", render));
  selectVisibleInput.addEventListener("change", () => {
    visibleCards.forEach(({ student }) => {
      if (selectVisibleInput.checked) selectedStudentIds.add(student.id);
      else selectedStudentIds.delete(student.id);
    });
    render();
  });
  clearSelectionButton.addEventListener("click", () => {
    selectedStudentIds.clear();
    render();
  });
  printSelectedButton.addEventListener("click", () => {
    void printCards([...selectedStudentIds]);
  });
  printVisibleButton.addEventListener("click", () => {
    void printCards(visibleCards.map(({ student }) => student.id));
  });
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-print-card-id]");
    if (button) void printCards([Number(button.dataset.printCardId)], "single");
    const sideButton = event.target.closest("[data-toggle-card-side]");
    if (sideButton) {
      const item = sideButton.closest(".student-card-item");
      const isShowingBack = sideButton.getAttribute("aria-pressed") !== "true";
      item.querySelector(".student-id-card:not(.student-card-back-preview)").hidden = isShowingBack;
      item.querySelector(".student-card-back-preview").hidden = !isShowingBack;
      sideButton.setAttribute("aria-pressed", String(isShowingBack));
      const label = isShowingBack ? "معاينة الوجه الأمامي" : "معاينة الظهر";
      sideButton.setAttribute("aria-label", label);
      sideButton.title = label;
    }
  });
  grid.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-select-card-id]");
    if (!checkbox) return;
    const studentId = Number(checkbox.dataset.selectCardId);
    if (checkbox.checked) selectedStudentIds.add(studentId);
    else selectedStudentIds.delete(studentId);
    render();
  });

  try {
    const [students, subscriptions, terms] = await Promise.all([
      window.votaAPI.getStudents(),
      window.votaAPI.getSubscriptions(),
      window.votaAPI.getTerms(),
    ]);
    const activeStudents = students.filter((student) => !student.archivedAt);
    const activeStudentIds = new Set(activeStudents.map((student) => student.id));
    const termsById = new Map(terms.map((term) => [term.id, term]));
    const latestSubscriptionByStudent = new Map();
    subscriptions.forEach((subscription) => {
      if (activeStudentIds.has(subscription.studentId) && !latestSubscriptionByStudent.has(subscription.studentId)) {
        latestSubscriptionByStudent.set(subscription.studentId, subscription);
      }
    });
    cards = activeStudents.map((student) => createCardRecord(
        student,
        latestSubscriptionByStudent.get(student.id),
        termsById
      ));
    render();
  } catch (error) {
    console.error("Unable to load student cards from Supabase.", error);
    errorMessage.textContent = "تعذر تحميل بيانات الكارنيهات من قاعدة البيانات.";
    errorMessage.hidden = false;
  }
}

function initializeSettingsTabs() {
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  const panels = [...document.querySelectorAll("[data-settings-panel]")];
  if (!tabs.length || !panels.length) return;

  function activateTab(name, focus = false) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.settingsTab === name;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.settingsPanel !== name;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activateTab(tab.dataset.settingsTab));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = tabs.indexOf(tab);
      const forwardKey = getComputedStyle(tab.parentElement).direction === "rtl"
        ? "ArrowLeft"
        : "ArrowRight";
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex + (event.key === forwardKey ? 1 : -1) + tabs.length) % tabs.length;
      activateTab(tabs[nextIndex].dataset.settingsTab, true);
    });
  });
}

async function initializeReports() {
  const page = document.querySelector(".reports-page");
  if (!page) return;

  const reportType = document.querySelector("#report-type");
  const searchInput = document.querySelector("#report-search");
  const regionFilter = document.querySelector("#report-region");
  const universityFilter = document.querySelector("#report-university");
  const termFilter = document.querySelector("#report-term");
  const statusFilter = document.querySelector("#report-status");
  const fromFilter = document.querySelector("#report-from");
  const toFilter = document.querySelector("#report-to");
  const tableHead = document.querySelector("#report-table-head");
  const tableBody = document.querySelector("#report-table-body");
  const chart = document.querySelector("#report-chart");
  const emptyState = document.querySelector("#report-empty");
  const errorMessage = document.querySelector("#reports-error");
  const exportButton = document.querySelector("#export-report");
  const printButton = document.querySelector("#print-report");
  const printTitle = document.querySelector("#report-print-title");
  const printDate = document.querySelector("#report-print-date");
  const printCount = document.querySelector("#report-print-count");
  const printFilters = document.querySelector("#report-print-filters");
  const currency = new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const numbers = new Intl.NumberFormat("ar-EG");
  const studentStatusLabels = {
    active: "نشط",
    pending: "بانتظار التفعيل",
    inactive: "غير نشط",
    paused: "متوقف مؤقتًا",
    withdrawn: "منسحب",
    expired: "منتهي الاشتراك",
    archived: "مؤرشف",
  };
  const paymentStatusLabels = {
    paid: "مدفوع بالكامل",
    partial: "مدفوع جزئيًا",
    unpaid: "غير مدفوع",
    overdue: "متأخر عن السداد",
  };
  const paymentMethodLabels = { cash: "نقدي", transfer: "تحويل بنكي / محفظة", other: "أخرى" };
  const typeNames = {
    students: "تقرير الطلاب",
    subscriptions: "تقرير الاشتراكات",
    payments: "تقرير التحصيل والمدفوعات",
    regions: "تقرير البلاد / مناطق الركوب",
    universities: "تقرير الجامعات والكليات",
    trips: "تقرير الرحلات والحجوزات",
  };
  const descriptions = {
    students: "بيانات الطلاب وحالتهم الدراسية ومناطق الركوب والجامعات.",
    subscriptions: "قيمة الاشتراكات والمدفوعات والمتبقي وحالة السداد.",
    payments: "تفاصيل كل دفعة ووسيلة الدفع وتاريخ التحصيل.",
    regions: "توزيع الطلاب والاشتراكات والتحصيل حسب منطقة الركوب.",
    universities: "توزيع الطلاب والاشتراكات على الجامعات والكليات.",
    trips: "حجوزات الرحلات ومواعيدها ومناطق ركوب الطلاب.",
  };
  const methodOptions = ["cash", "transfer", "other"];
  const statusOptionsByType = {
    students: Object.entries(studentStatusLabels),
    subscriptions: Object.entries(paymentStatusLabels),
    payments: Object.entries(paymentMethodLabels),
    regions: Object.entries(studentStatusLabels),
    universities: Object.entries(studentStatusLabels),
    trips: Object.entries(tripStatusLabels),
  };
  const columnsByType = {
    students: [
      ["الطالب", (row) => row.studentName],
      ["رقم الهاتف", (row) => row.phone],
      ["منطقة الركوب", (row) => row.region],
      ["الجامعة", (row) => row.university],
      ["الكلية", (row) => row.faculty],
      ["السنة الدراسية", (row) => row.studyYear],
      ["الترم", (row) => row.term],
      ["الحالة", (row) => row.statusLabel],
      ["تاريخ التسجيل", (row) => row.dateLabel],
    ],
    subscriptions: [
      ["الطالب", (row) => row.studentName],
      ["منطقة الركوب", (row) => row.region],
      ["الجامعة", (row) => row.university],
      ["الترم", (row) => row.term],
      ["بداية الاشتراك", (row) => row.startDateLabel],
      ["نهاية الاشتراك", (row) => row.endDateLabel],
      ["قيمة الاشتراك", (row) => formatMoney(row.priceCents)],
      ["المدفوع", (row) => formatMoney(row.paidCents)],
      ["المتبقي", (row) => formatMoney(row.remainingCents)],
      ["حالة السداد", (row) => row.statusLabel],
    ],
    payments: [
      ["تاريخ الدفع", (row) => row.dateLabel],
      ["رقم الإيصال", (row) => row.receiptNumber],
      ["الطالب", (row) => row.studentName],
      ["منطقة الركوب", (row) => row.region],
      ["الترم", (row) => row.term],
      ["طريقة الدفع", (row) => row.statusLabel],
      ["المبلغ", (row) => formatMoney(row.amountCents)],
    ],
    regions: [
      ["البلد / منطقة الركوب", (row) => row.label],
      ["عدد الطلاب", (row) => numbers.format(row.studentCount)],
      ["طلاب نشطون", (row) => numbers.format(row.activeCount)],
      ["عدد الاشتراكات", (row) => numbers.format(row.subscriptionCount)],
      ["إجمالي المستحق", (row) => formatMoney(row.dueCents)],
      ["إجمالي المحصل", (row) => formatMoney(row.paidCents)],
      ["المتبقي", (row) => formatMoney(row.remainingCents)],
    ],
    universities: [
      ["الجامعة", (row) => row.label],
      ["الكلية", (row) => row.faculty || "غير محدد"],
      ["عدد الطلاب", (row) => numbers.format(row.studentCount)],
      ["طلاب نشطون", (row) => numbers.format(row.activeCount)],
      ["عدد الاشتراكات", (row) => numbers.format(row.subscriptionCount)],
      ["إجمالي المستحق", (row) => formatMoney(row.dueCents)],
      ["إجمالي المحصل", (row) => formatMoney(row.paidCents)],
      ["المتبقي", (row) => formatMoney(row.remainingCents)],
    ],
    trips: [
      ["تاريخ الرحلة", (row) => row.dateLabel],
      ["الوقت", (row) => row.time],
      ["الطالب", (row) => row.studentName],
      ["منطقة الركوب", (row) => row.region],
      ["الجامعة", (row) => row.university],
      ["الاتجاه", (row) => row.direction],
      ["الحالة", (row) => row.statusLabel],
    ],
  };
  let students = [];
  let subscriptions = [];
  let tripRequests = [];
  let visibleRows = [];
  exportButton.disabled = true;
  printButton.disabled = true;

  function formatMoney(cents) {
    return `${currency.format((Number(cents) || 0) / 100)} ج.م`;
  }

  function dateLabel(value) {
    return value ? formatLocalDate(String(value).slice(0, 10)) : "—";
  }

  function paidAmount(subscription) {
    return (Array.isArray(subscription.payments) ? subscription.payments : [])
      .reduce((sum, payment) => sum + (Number(payment.amountCents) || 0), 0);
  }

  function subscriptionStatus(subscription) {
    const paid = paidAmount(subscription);
    if (paid >= subscription.priceCents) return "paid";
    if (paid > 0) {
      return subscription.endDate && subscription.endDate < localDateString()
        ? "overdue"
        : "partial";
    }
    return subscription.endDate && subscription.endDate < localDateString()
      ? "overdue"
      : "unpaid";
  }

  function profileStatus(student) {
    return student.archivedAt ? "archived" : (student.subscription || "inactive");
  }

  function latestSubscription(studentId) {
    return subscriptions.find((item) => item.studentId === studentId);
  }

  function studentRows() {
    return students.map((student) => {
      const subscription = latestSubscription(student.id);
      const statusValue = profileStatus(student);
      return {
        studentId: student.id,
        studentName: student.name || "—",
        phone: student.phone || "—",
        region: student.pickup || "غير محدد",
        university: student.university || "غير محدد",
        faculty: student.faculty || "",
        studyYear: student.studyYear || "—",
        statusValue,
        statusLabel: studentStatusLabels[statusValue] || statusValue,
        termId: subscription?.termId || student.termId || "",
        term: [subscription?.termName, subscription?.academicYear].filter(Boolean).join(" — ") || "—",
        date: student.createdAt || "",
        dateLabel: dateLabel(student.createdAt),
        authUserId: student.authUserId,
        searchText: [
          student.name, student.phone, student.emergencyPhone, student.pickup,
          student.university, student.faculty, student.studyYear, subscription?.termName,
        ].filter(Boolean).join(" "),
      };
    });
  }

  function subscriptionRows() {
    return subscriptions.map((subscription) => {
      const student = students.find((item) => item.id === subscription.studentId);
      const paidCents = paidAmount(subscription);
      const remainingCents = Math.max(0, subscription.priceCents - paidCents);
      const statusValue = subscriptionStatus(subscription);
      const date = subscription.createdAt || subscription.startDate || "";
      return {
        studentId: subscription.studentId,
        studentName: subscription.studentName || student?.name || "—",
        phone: subscription.studentPhone || student?.phone || "—",
        region: student?.pickup || "غير محدد",
        university: student?.university || "غير محدد",
        termId: subscription.termId,
        term: [subscription.termName, subscription.academicYear].filter(Boolean).join(" — ") || "—",
        startDateLabel: dateLabel(subscription.startDate),
        endDateLabel: dateLabel(subscription.endDate),
        priceCents: subscription.priceCents,
        paidCents,
        remainingCents,
        statusValue,
        statusLabel: paymentStatusLabels[statusValue],
        date,
        dateLabel: dateLabel(date),
        searchText: [
          subscription.studentName, student?.name, subscription.studentPhone,
          student?.pickup, student?.university, subscription.termName, subscription.academicYear,
        ].filter(Boolean).join(" "),
      };
    });
  }

  function paymentRows() {
    return subscriptions.flatMap((subscription) => {
      const student = students.find((item) => item.id === subscription.studentId);
      return (Array.isArray(subscription.payments) ? subscription.payments : []).map((payment) => ({
        studentId: subscription.studentId,
        studentName: subscription.studentName || student?.name || "—",
        phone: subscription.studentPhone || student?.phone || "—",
        region: student?.pickup || "غير محدد",
        university: student?.university || "غير محدد",
        termId: subscription.termId,
        term: [subscription.termName, subscription.academicYear].filter(Boolean).join(" — ") || "—",
        amountCents: payment.amountCents,
        receiptNumber: payment.receiptNumber || "—",
        statusValue: methodOptions.includes(payment.method) ? payment.method : "other",
        statusLabel: paymentMethodLabels[payment.method] || paymentMethodLabels.other,
        date: payment.paidAt || "",
        dateLabel: dateLabel(payment.paidAt),
        searchText: [
          subscription.studentName, student?.name, subscription.studentPhone,
          student?.pickup, student?.university, subscription.termName,
          payment.receiptNumber, payment.method,
        ].filter(Boolean).join(" "),
      }));
    });
  }

  function tripRows() {
    return tripRequests.map((request) => {
      const student = students.find((item) => item.id === request.studentId);
      const statusValue = request.status || "pending";
      return {
        studentId: request.studentId,
        studentName: request.studentName || student?.name || "—",
        phone: student?.phone || "—",
        region: request.pickup || student?.pickup || "غير محدد",
        university: student?.university || "غير محدد",
        statusValue,
        statusLabel: tripStatusLabels[statusValue] || statusValue,
        direction: tripDirectionLabels[request.direction] || request.tripType || "—",
        time: request.tripTime || "—",
        date: request.tripDate || request.createdAt || "",
        dateLabel: dateLabel(request.tripDate || request.createdAt),
        searchText: [
          request.studentName, student?.name, student?.phone, student?.pickup,
          student?.university, request.tripType, request.direction, request.status,
        ].filter(Boolean).join(" "),
      };
    });
  }

  function filtersMatch(row) {
    const query = searchInput.value.trim().toLocaleLowerCase("ar");
    const rowDate = String(row.date || "").slice(0, 10);
    if (query && !String(row.searchText || "").toLocaleLowerCase("ar").includes(query)) return false;
    if (regionFilter.value && row.region !== regionFilter.value) return false;
    if (universityFilter.value && row.university !== universityFilter.value) return false;
    if (termFilter.value && String(row.termId || "") !== termFilter.value) return false;
    if (statusFilter.value && row.statusValue !== statusFilter.value) return false;
    if (fromFilter.value && (!rowDate || rowDate < fromFilter.value)) return false;
    if (toFilter.value && (!rowDate || rowDate > toFilter.value)) return false;
    return true;
  }

  function aggregateStudents(rows, grouping) {
    const groups = new Map();
    const studentsById = new Map(rows.map((row) => [row.studentId, row]));
    rows.forEach((row) => {
      const key = grouping === "regions" ? row.region : `${row.university}|||${row.faculty}`;
      const label = grouping === "regions" ? row.region : row.university;
      const group = groups.get(key) || {
        label,
        faculty: grouping === "universities" ? row.faculty : "",
        studentCount: 0,
        activeCount: 0,
        subscriptionCount: 0,
        dueCents: 0,
        paidCents: 0,
        remainingCents: 0,
        statusValue: "",
        searchText: `${label} ${row.faculty}`,
      };
      group.studentCount += 1;
      if (row.statusValue === "active") group.activeCount += 1;
      groups.set(key, group);
    });

    for (const subscription of subscriptionRows()) {
      const student = studentsById.get(subscription.studentId);
      if (!student) continue;
      if (termFilter.value && String(subscription.termId) !== termFilter.value) continue;
      const key = grouping === "regions"
        ? student.region
        : `${student.university}|||${student.faculty}`;
      const group = groups.get(key);
      if (!group) continue;
      group.subscriptionCount += 1;
      group.dueCents += subscription.priceCents;
      group.paidCents += subscription.paidCents;
      group.remainingCents += subscription.remainingCents;
    }

    return [...groups.values()].sort((first, second) =>
      second.studentCount - first.studentCount || first.label.localeCompare(second.label, "ar")
    );
  }

  function rawRows(type) {
    if (type === "students") return studentRows();
    if (type === "subscriptions") return subscriptionRows();
    if (type === "payments") return paymentRows();
    if (type === "trips") return tripRows();
    if (type === "regions" || type === "universities") {
      const rows = studentRows().filter((row) => {
        if (!termFilter.value) return filtersMatch(row);
        const hasSubscriptionInTerm = subscriptions.some((item) =>
          item.studentId === row.studentId && String(item.termId) === termFilter.value
        );
        return hasSubscriptionInTerm && filtersMatch({ ...row, termId: termFilter.value });
      });
      return aggregateStudents(rows, type);
    }
    return [];
  }

  function updateStatusOptions() {
    const selected = statusFilter.value;
    const type = reportType.value;
    const options = statusOptionsByType[type] || [];
    statusFilter.replaceChildren(new Option("كل الحالات", ""));
    options.forEach(([value, label]) => statusFilter.add(new Option(label, value)));
    statusFilter.value = options.some(([value]) => value === selected) ? selected : "";
    document.querySelector("#report-status-label").textContent =
      type === "payments" ? "طريقة الدفع" : "الحالة";
  }

  function updateMetric(index, label, value) {
    document.querySelector(`#report-metric-label-${index}`).textContent = label;
    document.querySelector(`#report-metric-${index}`).textContent = value;
  }

  function updateMetrics(type, rows) {
    if (type === "students") {
      updateMetric(1, "عدد الطلاب", numbers.format(rows.length));
      updateMetric(2, "طلاب نشطون", numbers.format(rows.filter((row) => row.statusValue === "active").length));
      updateMetric(3, "طلاب مؤرشفون", numbers.format(rows.filter((row) => row.statusValue === "archived").length));
      updateMetric(4, "لديهم حساب دخول", numbers.format(rows.filter((row) => Boolean(row.authUserId)).length));
      return;
    }
    if (type === "subscriptions") {
      updateMetric(1, "عدد الاشتراكات", numbers.format(rows.length));
      updateMetric(2, "إجمالي المستحق", formatMoney(rows.reduce((sum, row) => sum + row.priceCents, 0)));
      updateMetric(3, "إجمالي المحصل", formatMoney(rows.reduce((sum, row) => sum + row.paidCents, 0)));
      updateMetric(4, "المتبقي", formatMoney(rows.reduce((sum, row) => sum + row.remainingCents, 0)));
      return;
    }
    if (type === "payments") {
      updateMetric(1, "عدد الدفعات", numbers.format(rows.length));
      updateMetric(2, "إجمالي التحصيل", formatMoney(rows.reduce((sum, row) => sum + row.amountCents, 0)));
      updateMetric(3, "تحويل بنكي / محفظة", numbers.format(rows.filter((row) => row.statusValue === "transfer").length));
      updateMetric(4, "دفعات نقدية", numbers.format(rows.filter((row) => row.statusValue === "cash").length));
      return;
    }
    if (type === "trips") {
      updateMetric(1, "عدد الحجوزات", numbers.format(rows.length));
      updateMetric(2, "مسجلة", numbers.format(rows.filter((row) => ["pending", "approved"].includes(row.statusValue)).length));
      updateMetric(3, "مرفوضة", numbers.format(rows.filter((row) => row.statusValue === "rejected").length));
      updateMetric(4, "ملغاة", numbers.format(rows.filter((row) => row.statusValue === "cancelled").length));
      return;
    }
    updateMetric(1, type === "regions" ? "مناطق الركوب" : "الجامعات والكليات", numbers.format(rows.length));
    updateMetric(2, "عدد الطلاب", numbers.format(rows.reduce((sum, row) => sum + row.studentCount, 0)));
    updateMetric(3, "إجمالي المستحق", formatMoney(rows.reduce((sum, row) => sum + row.dueCents, 0)));
    updateMetric(4, "إجمالي المحصل", formatMoney(rows.reduce((sum, row) => sum + row.paidCents, 0)));
  }

  function renderChart(type, rows) {
    const grouping = {
      students: ["region", "منطقة الركوب"],
      subscriptions: ["statusLabel", "حالة السداد"],
      payments: ["statusLabel", "طريقة الدفع"],
      regions: ["label", "منطقة الركوب"],
      universities: ["label", "الجامعة"],
      trips: ["statusLabel", "حالة الحجز"],
    }[type];
    document.querySelector("#report-chart-title").textContent = `التوزيع حسب ${grouping[1]}`;
    const totals = new Map();
    rows.forEach((row) => {
      const label = row[grouping[0]] || "غير محدد";
      const value = type === "payments"
        ? row.amountCents
        : type === "subscriptions"
          ? row.priceCents
          : type === "regions" || type === "universities"
            ? row.studentCount
            : 1;
      totals.set(label, (totals.get(label) || 0) + value);
    });
    const groups = [...totals.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 7);
    const maximum = Math.max(1, ...groups.map(([, value]) => value));
    chart.replaceChildren();
    document.querySelector("#report-chart-total").textContent =
      type === "payments" || type === "subscriptions"
        ? formatMoney(groups.reduce((sum, [, value]) => sum + value, 0))
        : numbers.format(rows.length);

    if (!groups.length) {
      const empty = document.createElement("p");
      empty.className = "reports-chart-empty";
      empty.textContent = "لا توجد بيانات كافية لعرض التحليل.";
      chart.append(empty);
      return;
    }
    groups.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "reports-chart-item";
      const heading = document.createElement("div");
      heading.className = "reports-chart-item-heading";
      const name = document.createElement("span");
      name.textContent = label;
      const total = document.createElement("strong");
      total.textContent = type === "payments" || type === "subscriptions"
        ? formatMoney(value)
        : numbers.format(value);
      const track = document.createElement("div");
      track.className = "reports-chart-track";
      const bar = document.createElement("span");
      bar.className = "reports-chart-bar";
      bar.style.width = `${Math.max(4, (value / maximum) * 100)}%`;
      track.append(bar);
      heading.append(name, total);
      item.append(heading, track);
      chart.append(item);
    });
  }

  function renderTable(type, rows) {
    const columns = columnsByType[type];
    tableHead.replaceChildren();
    tableBody.replaceChildren();
    const headerRow = document.createElement("tr");
    columns.forEach(([label]) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      headerRow.append(cell);
    });
    tableHead.append(headerRow);
    rows.forEach((row) => {
      const tableRow = document.createElement("tr");
      columns.forEach(([, getValue]) => {
        const cell = document.createElement("td");
        cell.textContent = String(getValue(row) ?? "—");
        tableRow.append(cell);
      });
      tableBody.append(tableRow);
    });
    document.querySelector("#report-table-title").textContent = typeNames[type];
    document.querySelector("#report-results-count").textContent =
      `${numbers.format(rows.length)} ${type === "regions" ? "منطقة" : type === "universities" ? "جهة تعليمية" : "سجل"} مطابق للفلاتر`;
    emptyState.hidden = rows.length > 0;
  }

  function render() {
    if (fromFilter.value && toFilter.value && fromFilter.value > toFilter.value) {
      errorMessage.textContent = "تاريخ البداية يجب أن يكون قبل تاريخ النهاية.";
      errorMessage.hidden = false;
      exportButton.disabled = true;
      printButton.disabled = true;
      return;
    }
    errorMessage.hidden = true;
    const type = reportType.value;
    const allRows = rawRows(type);
    const rows = ["regions", "universities"].includes(type)
      ? allRows
      : allRows.filter(filtersMatch);
    if (!["regions", "universities"].includes(type)) {
      rows.sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")));
    }
    visibleRows = rows;
    exportButton.disabled = false;
    printButton.disabled = false;
    document.querySelector("#report-summary-title").textContent = typeNames[type];
    document.querySelector("#report-summary").textContent = descriptions[type];
    document.querySelector("#report-filter-hint").textContent = ({
      students: "التاريخ يصف تاريخ تسجيل الطالب.",
      subscriptions: "التاريخ يصف تاريخ إنشاء الاشتراك، أو بدايته إذا لم يتوفر.",
      payments: "التاريخ يصف يوم تسجيل الدفعة.",
      regions: "يُحتسب توزيع المناطق من الطلاب المسجلين خلال الفترة المختارة.",
      universities: "يُحتسب توزيع الجامعات من الطلاب المسجلين خلال الفترة المختارة.",
      trips: "التاريخ يصف تاريخ الرحلة.",
    })[type];
    printTitle.textContent = typeNames[type];
    printDate.textContent = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date());
    printCount.textContent = numbers.format(rows.length);
    const activeFilters = [];
    if (searchInput.value.trim()) activeFilters.push(`بحث: ${searchInput.value.trim()}`);
    if (regionFilter.value) activeFilters.push(`منطقة الركوب: ${regionFilter.value}`);
    if (universityFilter.value) activeFilters.push(`الجامعة: ${universityFilter.value}`);
    if (termFilter.value) activeFilters.push(`الترم: ${termFilter.selectedOptions[0].textContent}`);
    if (statusFilter.value) {
      activeFilters.push(`${document.querySelector("#report-status-label").textContent}: ${statusFilter.selectedOptions[0].textContent}`);
    }
    if (fromFilter.value || toFilter.value) {
      activeFilters.push(`الفترة: ${fromFilter.value ? dateLabel(fromFilter.value) : "البداية"} – ${toFilter.value ? dateLabel(toFilter.value) : "حتى الآن"}`);
    }
    printFilters.textContent = activeFilters.length
      ? `الفلاتر: ${activeFilters.join(" · ")}`
      : "الفلاتر: بدون فلاتر إضافية";
    updateMetrics(type, rows);
    renderChart(type, rows);
    renderTable(type, rows);
  }

  function populateSelect(select, placeholder, values) {
    const selected = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    [...new Set(values.filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, "ar"))
      .forEach((value) => select.add(new Option(value, value)));
    select.value = values.includes(selected) ? selected : "";
  }

  function exportCsv() {
    const columns = columnsByType[reportType.value];
    const rows = [
      columns.map(([label]) => label),
      ...visibleRows.map((row) => columns.map(([, getValue]) => getValue(row) ?? "")),
    ];
    const csvCell = (value) => {
      const text = String(value);
      const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const fileUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `vota-${reportType.value}-${localDateString()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }

  try {
    [students, subscriptions, tripRequests] = await Promise.all([
      window.votaAPI.getStudents(),
      window.votaAPI.getSubscriptions(),
      window.votaAPI.getTripRequests(),
    ]);
    populateSelect(regionFilter, "كل المناطق", students.map((student) => student.pickup || ""));
    populateSelect(universityFilter, "كل الجامعات", students.map((student) => student.university || ""));
    const termValues = new Map(subscriptions.map((item) => [
      String(item.termId),
      [item.termName, item.academicYear].filter(Boolean).join(" — ") || "ترم غير محدد",
    ]));
    termFilter.replaceChildren(new Option("كل الترمات", ""));
    [...termValues.entries()].forEach(([value, label]) => termFilter.add(new Option(label, value)));
    updateStatusOptions();
    [searchInput, regionFilter, universityFilter, termFilter, statusFilter, fromFilter, toFilter]
      .forEach((control) => control.addEventListener("input", render));
    reportType.addEventListener("change", () => {
      updateStatusOptions();
      render();
    });
    document.querySelector("#reset-report-filters").addEventListener("click", () => {
      searchInput.value = "";
      regionFilter.value = "";
      universityFilter.value = "";
      termFilter.value = "";
      statusFilter.value = "";
      fromFilter.value = "";
      toFilter.value = "";
      render();
    });
    exportButton.addEventListener("click", exportCsv);
    printButton.addEventListener("click", () => {
      document.body.classList.add("is-printing-report");
      try {
        window.print();
      } finally {
        document.body.classList.remove("is-printing-report");
      }
    });
    render();
    document.querySelector("#report-updated-at").textContent =
      `آخر تحديث: ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`;
  } catch (error) {
    console.error("Unable to load reports.", error);
    errorMessage.textContent = "تعذر تحميل بيانات التقارير من قاعدة البيانات. حاول تحديث الصفحة.";
    errorMessage.hidden = false;
    exportButton.disabled = true;
    printButton.disabled = true;
  }
}

async function initializeApplication() {
  try {
    const shouldInitialize = await window.votaData.initialize();
    initializeDateTime();
    initializeSessionLogout();
    await applySystemSettings();
    initializeSettingsTabs();

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Initialize login form only on index.html
    if (currentPage === 'index.html') {
      await initializeLogin();
      // If already logged in, redirect to appropriate page
      if (shouldInitialize) {
        if (window.votaData.role === 'admin') {
          window.location.replace('dashboard.html');
        } else if (window.votaData.role === 'student') {
          window.location.replace('portal.html');
        }
      }
      return;
    }

    // For protected pages, check authentication
    if (!shouldInitialize) {
      const protectedPages = ['dashboard.html', 'students.html', 'settings.html', 'subscriptions.html', 'cards.html', 'trips.html', 'reports.html', 'portal.html', 'portal-personal.html', 'portal-subscription.html', 'portal-trips.html', 'student.html'];
      if (protectedPages.includes(currentPage)) {
        window.location.replace('index.html');
      }
      return;
    }

    // Role-based access control
    const adminPages = ['dashboard.html', 'students.html', 'settings.html', 'subscriptions.html', 'cards.html', 'trips.html', 'reports.html', 'student.html'];
    const studentPages = ['portal.html', 'portal-personal.html', 'portal-subscription.html', 'portal-trips.html'];

    if (window.votaData.role === 'admin' && studentPages.includes(currentPage)) {
      window.location.replace('dashboard.html');
      return;
    }

    if (window.votaData.role === 'student' && adminPages.includes(currentPage)) {
      window.location.replace('portal.html');
      return;
    }

    // Initialize page-specific modules
    await initializeStudents();
    await initializeSettings();
    await initializeSubscriptions();
    await initializeReports();
    await initializeStudentPortal();
    await initializeStudentFile();
    initializeTripScheduleManager();
    initializeTripAdmin();
    await initializeStudentCards();
  } catch (error) {
    console.error("Unable to initialize the Supabase application.", error);
    document.documentElement.classList.add("company-name-loaded");
    document.querySelectorAll("[data-company-logo]").forEach((logo) => {
      logo.hidden = true;
    });
    const message = document.querySelector("#form-message") ||
      document.querySelector("#portal-message") ||
      document.querySelector("#admin-trips-error") ||
      document.querySelector("#storage-message") ||
      document.querySelector("#settings-storage-error") ||
      document.querySelector("#subscriptions-storage-error");
    const missingSettingsTable = error?.code === "PGRST205" &&
      String(error.message || "").includes("system_settings");
    const text = missingSettingsTable
      ? "جدول إعدادات النظام غير موجود في قاعدة البيانات. شغّل ملف supabase/schema.sql كاملًا من SQL Editor في Supabase ثم أعد تحميل الصفحة."
      : "تعذر تحميل البيانات من قاعدة البيانات. تحقق من اتصال Supabase ثم حاول مرة أخرى.";
    if (message) {
      message.textContent = text;
      message.hidden = false;
    } else {
      window.votaData?.showError(text);
    }
  }
}

initializeApplication();
