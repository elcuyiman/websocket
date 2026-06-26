// server.js
//
// Servidor de la app "Chat Café".
// - Express sirve el frontend estático (public/) y expone una API REST
//   para registro/login, historial de mensajes, busqueda y subida de archivos.
// - Socket.IO maneja la comunicacion persistente en tiempo real: envio de
//   mensajes, lista de usuarios conectados y notificaciones globales.

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const { ROOMS, getRoomById } = require("./lib/rooms");
const store = require("./lib/store");

store.ensureDataFiles();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------------------------------------------------------------------------
// Subida de archivos (multer): se guarda en disco con nombre unico.
// El archivo se sube recien cuando el usuario presiona "Enviar" en el chat
// (el frontend lo mantiene "cargado" en memoria antes de eso).
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9.\-_]/g, "_")
      .slice(-80);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// ---------------------------------------------------------------------------
// API: Autenticacion
// ---------------------------------------------------------------------------

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password || username.trim().length < 3 || password.length < 4) {
      return res.status(400).json({
        ok: false,
        error: "El usuario debe tener al menos 3 caracteres y la contraseña al menos 4.",
      });
    }

    const clean = username.trim();

    if (store.findUser(clean)) {
      return res.status(409).json({ ok: false, error: "Ese nombre de usuario ya existe. Intenta iniciar sesión." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    store.createUser(clean, passwordHash);

    return res.json({ ok: true, username: clean });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error interno al registrar." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Ingresa usuario y contraseña." });
    }

    const user = store.findUser(username);
    if (!user) {
      return res.status(404).json({ ok: false, error: "Usuario no encontrado. ¿Quizás necesitas registrarte?" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Contraseña incorrecta." });
    }

    return res.json({ ok: true, username: user.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Error interno al iniciar sesión." });
  }
});

// ---------------------------------------------------------------------------
// API: Salas
// ---------------------------------------------------------------------------

app.get("/api/rooms", (req, res) => {
  res.json({ ok: true, rooms: ROOMS });
});

// ---------------------------------------------------------------------------
// API: Mensajes (historial paginado para scroll infinito + busqueda)
// ---------------------------------------------------------------------------

app.get("/api/messages/:roomId", (req, res) => {
  const room = getRoomById(req.params.roomId);
  if (!room) return res.status(404).json({ ok: false, error: "Sala no encontrada." });

  const { before, limit } = req.query;
  const { messages, hasMore } = store.getMessagesPage(
    room.id,
    before,
    limit ? parseInt(limit, 10) : 20
  );

  res.json({ ok: true, messages, hasMore });
});

app.get("/api/messages/:roomId/search", (req, res) => {
  const room = getRoomById(req.params.roomId);
  if (!room) return res.status(404).json({ ok: false, error: "Sala no encontrada." });

  const q = (req.query.q || "").trim();
  const results = store.searchMessages(room.id, q);
  res.json({ ok: true, query: q, results });
});

// ---------------------------------------------------------------------------
// API: Subida de archivos
// ---------------------------------------------------------------------------

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "No se recibió ningún archivo." });

  res.json({
    ok: true,
    file: {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
});

// ---------------------------------------------------------------------------
// Socket.IO: tiempo real
// ---------------------------------------------------------------------------

// socketId -> { username, room }
const connectedSockets = new Map();

function broadcastOnlineUsers() {
  const usernames = [...new Set([...connectedSockets.values()].map((s) => s.username))];
  io.emit("online-users", usernames);
}

io.on("connection", (socket) => {
  connectedSockets.set(socket.id, { username: null, room: null });

  // El cliente se identifica justo después de conectarse (en cada página).
  socket.on("identify", (username) => {
    const entry = connectedSockets.get(socket.id) || {};
    entry.username = String(username || "Invitado").slice(0, 40);
    connectedSockets.set(socket.id, entry);
    broadcastOnlineUsers();
  });

  // Unirse a una sala especifica de chat.
  socket.on("join-room", (roomId) => {
    const room = getRoomById(roomId);
    if (!room) return;

    const entry = connectedSockets.get(socket.id) || {};
    entry.room = room.id;
    connectedSockets.set(socket.id, entry);

    socket.join(room.id);

    if (entry.username) {
      const systemMessage = store.addMessage(room.id, {
        username: "Sistema",
        text: `${entry.username} se unió a la sala ☕`,
        system: true,
      });
      io.to(room.id).emit("new-message", systemMessage);
    }
  });

  socket.on("leave-room", (roomId) => {
    const room = getRoomById(roomId);
    if (!room) return;

    const entry = connectedSockets.get(socket.id) || {};

    if (entry.username) {
      const systemMessage = store.addMessage(room.id, {
        username: "Sistema",
        text: `${entry.username} salió de la sala`,
        system: true,
      });
      io.to(room.id).emit("new-message", systemMessage);
    }

    socket.leave(room.id);
    entry.room = null;
    connectedSockets.set(socket.id, entry);
  });

  // Envio de un mensaje (texto y/o archivo ya subido previamente via /api/upload).
  socket.on("send-message", (payload) => {
    const room = getRoomById(payload && payload.roomId);
    if (!room) return;

    const text = (payload.text || "").toString().slice(0, 2000);
    const hasFile = payload.file && payload.file.url;
    if (!text && !hasFile) return;

    // En la sala de sugerencias, el remitente siempre se guarda como "Anónimo".
    const displayName = room.anonymous
      ? "Anónimo"
      : String(payload.username || "Invitado").slice(0, 40);

    const message = store.addMessage(room.id, {
      username: displayName,
      text,
      file: hasFile ? payload.file : null,
    });

    io.to(room.id).emit("new-message", message);

    // Notificacion global para quienes NO estan viendo esta sala en este momento.
    const sockedsInRoom = io.sockets.adapter.rooms.get(room.id) || new Set();
    const preview = text ? text : `📎 ${message.file.name}`;

    connectedSockets.forEach((entry, socketId) => {
      if (!sockedsInRoom.has(socketId)) {
        io.to(socketId).emit("notification", {
          roomId: room.id,
          roomName: room.name,
          icon: room.icon,
          preview: preview.slice(0, 80),
          time: message.timestamp,
        });
      }
    });
  });

  socket.on("disconnect", () => {
    const entry = connectedSockets.get(socket.id);
    if (entry && entry.room && entry.username) {
      const systemMessage = store.addMessage(entry.room, {
        username: "Sistema",
        text: `${entry.username} salió de la sala`,
        system: true,
      });
      io.to(entry.room).emit("new-message", systemMessage);
    }
    connectedSockets.delete(socket.id);
    broadcastOnlineUsers();
  });
});

server.listen(PORT, () => {
  console.log(`☕ Chat Café corriendo en http://localhost:${PORT}`);
});
