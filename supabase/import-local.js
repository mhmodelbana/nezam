(() => {
  const config = window.VOTA_SUPABASE_CONFIG;
  const client = window.supabase?.createClient(config?.url, config?.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true },
  });
  const form = document.querySelector("#import-form");
  const fileInput = document.querySelector("#state-file");
  const submitButton = document.querySelector("#submit");
  const preview = document.querySelector("#preview");
  const message = document.querySelector("#message");
  let stateToImport = null;
  let authenticated = false;

  if (!client) {
    message.textContent = "تعذر تهيئة Supabase. تحقق من رابط المشروع والمفتاح العام.";
    message.classList.add("error");
    submitButton.disabled = true;
    return;
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function summarize(state) {
    const labels = {
      students: "طلاب",
      terms: "فصول",
      subscriptions: "اشتراكات",
      tripSchedules: "مواعيد رحلات",
      tripRequests: "حجوزات",
    };
    return Object.entries(labels)
      .map(([key, label]) => `${label}: ${Array.isArray(state[key]) ? state[key].length : 0}`)
      .join(" — ");
  }

  fileInput.addEventListener("change", async () => {
    stateToImport = null;
    preview.textContent = "";
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const state = JSON.parse(await file.text());
      const collections = ["students", "terms", "subscriptions", "tripSchedules", "tripRequests"];
      if (!state || typeof state !== "object" ||
        collections.some((key) => !Array.isArray(state[key]))) {
        throw new Error("ملف JSON لا يحتوي على بيانات النظام المحلية المتوقعة.");
      }
      delete state.accounts;
      delete state.sessionUserId;
      stateToImport = state;
      preview.textContent = summarize(state);
      setMessage("تمت قراءة الملف. راجع الأعداد ثم ابدأ الاستيراد.");
    } catch (error) {
      setMessage(error.message || "تعذر قراءة ملف JSON.", true);
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!stateToImport) {
      setMessage("اختر ملف JSON صالحًا أولًا.", true);
      return;
    }

    submitButton.disabled = true;
    try {
      if (!authenticated) {
        const { data, error } = await client.auth.signInWithPassword({
          email: document.querySelector("#email").value.trim(),
          password: document.querySelector("#password").value,
        });
        if (error) throw error;
        const { data: profile, error: profileError } = await client
          .from("profiles")
          .select("role")
          .eq("user_id", data.user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (profile?.role !== "admin") {
          await client.auth.signOut();
          throw new Error("هذا الحساب ليس حساب إدارة.");
        }
        authenticated = true;
      }

      const confirmed = window.confirm(
        `سيتم استيراد ${summarize(stateToImport)}. يجب أن تكون جداول النظام فارغة. هل تريد المتابعة؟`
      );
      if (!confirmed) return;

      const { data, error } = await client.rpc("import_local_state", { p_state: stateToImport });
      if (error) throw error;
      setMessage(`اكتمل الاستيراد إلى Supabase:\n${JSON.stringify(data, null, 2)}`);
      preview.textContent = "أُنجز الاستيراد. احتفظ بنسخة الملف كنسخة احتياطية.";
      fileInput.disabled = true;
      submitButton.textContent = "تم الاستيراد";
    } catch (error) {
      setMessage(error.message || "تعذر استيراد البيانات إلى Supabase.", true);
    } finally {
      submitButton.disabled = false;
    }
  });
})();
