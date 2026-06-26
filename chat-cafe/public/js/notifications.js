// public/js/notifications.js
//
// Modulo compartido por lobby.html y chat.html.
// Maneja dos paneles desplegables que usan el mismo socket:
//   1) Usuarios conectados (recibe el evento "online-users")
//   2) Notificaciones globales (recibe el evento "notification")
//
// Las notificaciones se guardan en localStorage para que persistan aunque
// el usuario navegue entre el lobby y las distintas salas (cada página abre
// su propia conexion de socket).

const NOTIF_KEY = "cafe_notifications";
const MAX_NOTIFS = 50;

function loadNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_KEY)) || [];
  } catch {
    return [];
  }
}

function saveNotifications(list) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, MAX_NOTIFS)));
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// currentRoomId: si la página actual es una sala de chat, pasar su id para
// no generar notificaciones de la sala que ya se esta viendo.
function initNotificationsWidget(socket, currentRoomId) {
  const btnUsers = document.getElementById("btn-users");
  const panelUsers = document.getElementById("panel-users");
  const usersList = document.getElementById("users-list");
  const usersCount = document.getElementById("users-count");

  const btnNotifs = document.getElementById("btn-notifs");
  const panelNotifs = document.getElementById("panel-notifs");
  const notifList = document.getElementById("notif-list");
  const notifBadge = document.getElementById("notif-badge");

  function closeAllPanels() {
    panelUsers.classList.remove("open");
    panelNotifs.classList.remove("open");
  }

  btnUsers.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !panelUsers.classList.contains("open");
    closeAllPanels();
    if (willOpen) panelUsers.classList.add("open");
  });

  btnNotifs.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !panelNotifs.classList.contains("open");
    closeAllPanels();
    if (willOpen) {
      panelNotifs.classList.add("open");
      markAllRead();
    }
  });

  document.addEventListener("click", closeAllPanels);

  // ---------------- Usuarios conectados ----------------

  socket.on("online-users", (usernames) => {
    usersCount.textContent = usernames.length;
    usersCount.classList.toggle("hidden", usernames.length === 0);

    if (usernames.length === 0) {
      usersList.innerHTML = '<div class="panel-empty">Nadie conectado por ahora.</div>';
      return;
    }

    usersList.innerHTML = usernames
      .map(
        (name) => `
        <div class="online-item">
          <span class="online-dot"></span>
          <span>${escapeHtml(name)}</span>
        </div>`
      )
      .join("");
  });

  // ---------------- Notificaciones ----------------

  function renderNotifications() {
    const list = loadNotifications();

    if (list.length === 0) {
      notifList.innerHTML = '<div class="panel-empty">Sin notificaciones todavía.</div>';
    } else {
      notifList.innerHTML = list
        .map(
          (n) => `
          <div class="notif-item ${n.read ? "" : "unread"}" data-room="${n.roomId}">
            <span class="notif-icon">${n.icon || "☕"}</span>
            <div class="notif-body">
              <div class="notif-room">${escapeHtml(n.roomName)}</div>
              <div class="notif-preview">Mensaje recibido: ${escapeHtml(n.preview)}</div>
              <div class="notif-time">${formatTime(n.time)}</div>
            </div>
          </div>`
        )
        .join("");

      notifList.querySelectorAll(".notif-item").forEach((el) => {
        el.addEventListener("click", () => {
          window.location.href = `/chat.html?room=${encodeURIComponent(el.dataset.room)}`;
        });
      });
    }

    const unread = list.filter((n) => !n.read).length;
    notifBadge.textContent = unread;
    notifBadge.classList.toggle("hidden", unread === 0);
  }

  function markAllRead() {
    const list = loadNotifications().map((n) => ({ ...n, read: true }));
    saveNotifications(list);
    renderNotifications();
  }

  socket.on("notification", (data) => {
    // No generamos notificación si el usuario ya está viendo esa misma sala.
    if (currentRoomId && data.roomId === currentRoomId) return;

    const list = loadNotifications();
    list.unshift({ ...data, read: false });
    saveNotifications(list);
    renderNotifications();
  });

  renderNotifications();
}

window.initNotificationsWidget = initNotificationsWidget;
