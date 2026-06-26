// public/js/auth.js
// Maneja las pestañas (Iniciar sesión / Registrarme) y el envío de
// los formularios contra la API REST del servidor.

(function () {
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const formLogin = document.getElementById("form-login");
  const formRegister = document.getElementById("form-register");

  function showLogin() {
    tabLogin.setAttribute("aria-selected", "true");
    tabRegister.setAttribute("aria-selected", "false");
    formLogin.style.display = "block";
    formRegister.style.display = "none";
  }

  function showRegister() {
    tabLogin.setAttribute("aria-selected", "false");
    tabRegister.setAttribute("aria-selected", "true");
    formLogin.style.display = "none";
    formRegister.style.display = "block";
  }

  tabLogin.addEventListener("click", showLogin);
  tabRegister.addEventListener("click", showRegister);

  function setMsg(el, text, type) {
    el.textContent = text;
    el.className = "form-msg show " + type;
  }

  function enterApp(username) {
    localStorage.setItem("cafe_username", username);
    window.location.href = "/lobby.html";
  }

  // Si ya había una sesión guardada, saltamos directo al lobby.
  const existing = localStorage.getItem("cafe_username");
  if (existing) {
    enterApp(existing);
    return;
  }

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("login-msg");
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMsg(msgEl, data.error || "No se pudo iniciar sesión.", "error");
        return;
      }

      setMsg(msgEl, "¡Bienvenido de nuevo! Entrando…", "success");
      setTimeout(() => enterApp(data.username), 400);
    } catch (err) {
      setMsg(msgEl, "No se pudo conectar con el servidor.", "error");
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("register-msg");
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMsg(msgEl, data.error || "No se pudo crear la cuenta.", "error");
        return;
      }

      setMsg(msgEl, "¡Cuenta creada! Entrando…", "success");
      setTimeout(() => enterApp(data.username), 400);
    } catch (err) {
      setMsg(msgEl, "No se pudo conectar con el servidor.", "error");
    }
  });
})();
