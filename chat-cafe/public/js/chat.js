// public/js/chat.js

(function () {
  const username = localStorage.getItem("cafe_username");
  if (!username) {
    window.location.href = "/index.html";
    return;
  }

  const roomId = new URLSearchParams(window.location.search).get("room");
  if (!roomId) {
    window.location.href = "/lobby.html";
    return;
  }

  // ---------------- Elementos del DOM ----------------

  const chatScroll = document.getElementById("chat-scroll");
  const scrollLoader = document.getElementById("scroll-loader");
  const historyStart = document.getElementById("history-start");
  const jumpBottomBtn = document.getElementById("jump-bottom");

  const roomNameEl = document.getElementById("room-name");
  const roomIconEl = document.getElementById("room-icon");
  const anonPill = document.getElementById("anon-pill");
  const composerHint = document.getElementById("composer-hint");

  const searchBar = document.getElementById("search-bar");
  const searchInput = document.getElementById("search-input");
  const btnSearch = document.getElementById("btn-search");
  const btnSearchClose = document.getElementById("btn-search-close");

  const composer = document.getElementById("composer");
  const msgInput = document.getElementById("msg-input");
  const btnSend = document.getElementById("btn-send");
  const btnAttach = document.getElementById("btn-attach");
  const fileInput = document.getElementById("file-input");
  const stagedFileBox = document.getElementById("staged-file");
  const stagedFileName = document.getElementById("staged-file-name");
  const stagedFileSize = document.getElementById("staged-file-size");
  const removeStagedFileBtn = document.getElementById("remove-staged-file");
  const backLink = document.getElementById("btn-back");

  // ---------------- Estado ----------------

  let room = null;
  let loadedMessages = []; // orden ascendente (más antiguo -> más nuevo)
  let oldestMessageId = null;
  let hasMore = true;
  let isLoadingPage = false;
  let searchMode = false;
  let stagedFile = null;
  let pendingNewSinceJump = 0;

  // ---------------- Utilidades ----------------

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return time;
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" }) + " · " + time;
  }

  function formatSize(bytes) {
    if (!bytes) return "0 KB";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function isNearBottom() {
    return chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 130;
  }

  function scrollToBottom() {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  // ---------------- Render de una burbuja de mensaje ----------------

  function buildMessageNode(msg, highlightQuery) {
    if (msg.system) {
      const row = document.createElement("div");
      row.className = "msg-row system";
      row.innerHTML = `<span class="msg-system">${escapeHtml(msg.text)}</span>`;
      return row;
    }

    // En salas anonimas nunca mostramos burbujas "propias": todo se ve igual
    // para que nadie pueda identificar qué mensaje es de quién.
    const isOwn = !room.anonymous && msg.username.toLowerCase() === username.toLowerCase();

    const row = document.createElement("div");
    row.className = "msg-row" + (isOwn ? " own" : "");
    row.dataset.msgId = msg.id;

    let fileHtml = "";
    if (msg.file) {
      const isImage = msg.file.mimeType && msg.file.mimeType.startsWith("image/");
      if (isImage) {
        fileHtml = `<a href="${msg.file.url}" target="_blank" rel="noopener">
            <img class="file-image" src="${msg.file.url}" alt="${escapeHtml(msg.file.name)}" />
          </a>`;
      } else {
        fileHtml = `<a class="file-chip" href="${msg.file.url}" target="_blank" rel="noopener" download="${escapeHtml(msg.file.name)}">
            <span class="file-icon">📄</span>
            <span class="file-name">${escapeHtml(msg.file.name)}</span>
            <span class="file-size">${formatSize(msg.file.size)}</span>
          </a>`;
      }
    }

    let textContent = msg.text ? escapeHtml(msg.text) : "";
    if (highlightQuery && textContent) {
      const safeQuery = highlightQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      textContent = textContent.replace(new RegExp(safeQuery, "ig"), (m) => `<mark class="hit">${m}</mark>`);
    }

    const senderHtml = !isOwn ? `<div class="sender">${escapeHtml(msg.username)}</div>` : "";
    const textHtml = textContent ? `<div class="text">${textContent}</div>` : "";

    row.innerHTML = `
      <div class="bubble">
        ${senderHtml}
        ${fileHtml}
        ${textHtml}
        <div class="time">${formatTime(msg.timestamp)}</div>
      </div>`;
    return row;
  }

  function renderNormalView() {
    chatScroll.querySelectorAll(".msg-row").forEach((n) => n.remove());
    const frag = document.createDocumentFragment();
    loadedMessages.forEach((msg) => frag.appendChild(buildMessageNode(msg)));
    chatScroll.appendChild(frag);
  }

  // ---------------- Carga inicial e historial (scroll infinito) ----------------

  async function loadInitial() {
    const res = await fetch(`/api/messages/${roomId}?limit=20`);
    const data = await res.json();
    if (!data.ok) return;

    loadedMessages = data.messages;
    hasMore = data.hasMore;
    oldestMessageId = loadedMessages.length ? loadedMessages[0].id : null;

    renderNormalView();
    scrollToBottom();
    historyStart.style.display = hasMore ? "none" : "block";
  }

  async function loadOlderMessages() {
    if (isLoadingPage || !hasMore || searchMode) return;
    isLoadingPage = true;
    scrollLoader.classList.add("show");

    try {
      const res = await fetch(`/api/messages/${roomId}?before=${encodeURIComponent(oldestMessageId)}&limit=20`);
      const data = await res.json();
      if (!data.ok) return;

      const prevScrollHeight = chatScroll.scrollHeight;

      loadedMessages = [...data.messages, ...loadedMessages];
      hasMore = data.hasMore;
      if (data.messages.length) oldestMessageId = data.messages[0].id;

      const frag = document.createDocumentFragment();
      data.messages.forEach((msg) => frag.appendChild(buildMessageNode(msg)));
      chatScroll.insertBefore(frag, chatScroll.firstChild);

      chatScroll.scrollTop += chatScroll.scrollHeight - prevScrollHeight;
      historyStart.style.display = hasMore ? "none" : "block";
      if (!hasMore) chatScroll.insertBefore(historyStart, chatScroll.firstChild);
    } finally {
      isLoadingPage = false;
      scrollLoader.classList.remove("show");
    }
  }

  chatScroll.addEventListener("scroll", () => {
    if (chatScroll.scrollTop < 60) loadOlderMessages();

    if (isNearBottom()) {
      jumpBottomBtn.classList.remove("show");
      pendingNewSinceJump = 0;
    }
  });

  jumpBottomBtn.addEventListener("click", () => {
    scrollToBottom();
    jumpBottomBtn.classList.remove("show");
    pendingNewSinceJump = 0;
  });

  // ---------------- Búsqueda en el historial ----------------

  function setSearchMode(active) {
    searchMode = active;
    searchBar.classList.toggle("open", active);
    if (!active) {
      searchInput.value = "";
      renderNormalView();
      scrollToBottom();
    } else {
      searchInput.focus();
    }
  }

  btnSearch.addEventListener("click", () => setSearchMode(!searchBar.classList.contains("open")));
  btnSearchClose.addEventListener("click", () => setSearchMode(false));

  let searchDebounce = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();

    if (!q) {
      renderNormalView();
      return;
    }

    searchDebounce = setTimeout(async () => {
      const res = await fetch(`/api/messages/${roomId}/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!data.ok) return;

      chatScroll.querySelectorAll(".msg-row").forEach((n) => n.remove());

      if (data.results.length === 0) {
        const empty = document.createElement("div");
        empty.className = "panel-empty";
        empty.textContent = `No se encontraron mensajes con "${q}".`;
        chatScroll.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();
      data.results.forEach((msg) => frag.appendChild(buildMessageNode(msg, q)));
      chatScroll.appendChild(frag);
    }, 280);
  });

  // ---------------- Archivos: arrastrar/soltar + selector ----------------

  function iconForFile(file) {
    if (file.type.startsWith("image/")) return "🖼️";
    if (file.type === "application/pdf") return "📕";
    return "📄";
  }

  function stageFile(file) {
    const MAX_SIZE = 15 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("El archivo supera el límite de 15 MB.");
      return;
    }
    stagedFile = file;
    stagedFileBox.querySelector(".file-icon").textContent = iconForFile(file);
    stagedFileName.textContent = file.name;
    stagedFileSize.textContent = formatSize(file.size);
    stagedFileBox.classList.add("show");
  }

  function clearStagedFile() {
    stagedFile = null;
    fileInput.value = "";
    stagedFileBox.classList.remove("show");
  }

  btnAttach.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) stageFile(fileInput.files[0]);
  });
  removeStagedFileBtn.addEventListener("click", clearStagedFile);

  ["dragenter", "dragover"].forEach((evt) =>
    composer.addEventListener(evt, (e) => {
      e.preventDefault();
      composer.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    composer.addEventListener(evt, (e) => {
      e.preventDefault();
      composer.classList.remove("drag-over");
    })
  );
  composer.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) stageFile(file);
  });

  // ---------------- Textarea autoajustable ----------------

  msgInput.addEventListener("input", () => {
    msgInput.style.height = "auto";
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
  });

  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ---------------- Enviar mensaje ----------------

  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text && !stagedFile) return;

    btnSend.disabled = true;
    let fileInfo = null;

    try {
      if (stagedFile) {
        const formData = new FormData();
        formData.append("file", stagedFile);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "No se pudo subir el archivo.");
        fileInfo = data.file;
      }

      socket.emit("send-message", { roomId, username, text, file: fileInfo });

      msgInput.value = "";
      msgInput.style.height = "auto";
      clearStagedFile();
    } catch (err) {
      alert(err.message || "Ocurrió un error al enviar el mensaje.");
    } finally {
      btnSend.disabled = false;
      msgInput.focus();
    }
  }

  btnSend.addEventListener("click", sendMessage);

  // ---------------- Volver al lobby ----------------

  backLink.addEventListener("click", () => {
    try {
      socket.emit("leave-room", roomId);
    } catch (e) {}
  });

  // ---------------- Conexión / carga de la sala ----------------

  const socket = io();

  async function init() {
    const res = await fetch("/api/rooms");
    const data = await res.json();
    room = data.rooms.find((r) => r.id === roomId);

    if (!room) {
      window.location.href = "/lobby.html";
      return;
    }

    roomIconEl.textContent = room.icon;
    roomNameEl.textContent = room.name;
    if (room.anonymous) {
      anonPill.style.display = "inline-block";
      composerHint.textContent = "en esta sala tus mensajes se publican como Anónimo · también puedes arrastrar un archivo aquí";
    }

    socket.on("connect", () => {
      socket.emit("identify", username);
      socket.emit("join-room", roomId);
    });

    socket.on("new-message", (msg) => {
      loadedMessages.push(msg);
      if (searchMode) return; // no tocamos la vista mientras se busca

      const wasNear = isNearBottom();
      chatScroll.appendChild(buildMessageNode(msg));

      if (wasNear) {
        scrollToBottom();
      } else {
        pendingNewSinceJump += 1;
        jumpBottomBtn.textContent = `↓ ${pendingNewSinceJump} mensaje${pendingNewSinceJump > 1 ? "s" : ""} nuevo${pendingNewSinceJump > 1 ? "s" : ""}`;
        jumpBottomBtn.classList.add("show");
      }
    });

    window.initNotificationsWidget(socket, roomId);

    await loadInitial();
  }

  init();
})();
