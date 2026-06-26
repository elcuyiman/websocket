// public/js/lobby.js

(function () {
  const username = localStorage.getItem("cafe_username");
  if (!username) {
    window.location.href = "/index.html";
    return;
  }

  document.getElementById("greet-username").textContent = username;

  const socket = io();
  socket.on("connect", () => socket.emit("identify", username));

  // El lobby no está "dentro" de ninguna sala -> currentRoomId = null,
  // así siempre se notifican los mensajes nuevos de cualquier sala.
  window.initNotificationsWidget(socket, null);

  // ---------------- Menu de salas ----------------

  async function loadRooms() {
    const menu = document.getElementById("room-menu");
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      if (!data.ok) throw new Error();

      menu.innerHTML = data.rooms
        .map(
          (room) => `
          <button class="room-row" data-room="${room.id}">
            <span class="room-icon">${room.icon}</span>
            <span class="room-info">
              <span class="room-name">${room.name}</span>
              <span class="room-desc">${room.description}</span>
              ${room.anonymous ? '<span class="anon-tag">Mensajes anónimos</span>' : ""}
            </span>
            <span class="room-arrow">→</span>
          </button>`
        )
        .join("");

      menu.querySelectorAll(".room-row").forEach((btn) => {
        btn.addEventListener("click", () => {
          window.location.href = `/chat.html?room=${encodeURIComponent(btn.dataset.room)}`;
        });
      });
    } catch (err) {
      menu.innerHTML = '<div class="panel-empty">No se pudo cargar el menú de salas. Revisa que el servidor esté corriendo.</div>';
    }
  }

  loadRooms();

  // ---------------- Logout ----------------

  document.getElementById("btn-logout").addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("cafe_username");
    socket.disconnect();
    window.location.href = "/index.html";
  });
})();
