// lib/store.js
//
// "Base de datos" liviana basada en archivos JSON.
// No requiere motores externos (SQLite/MySQL) ni dependencias nativas,
// por lo que funciona en cualquier laboratorio con solo Node.js instalado.
//
// Estructura:
//   data/users.json    -> [ { username, passwordHash, createdAt } ]
//   data/messages.json -> { errores: [...], ayuda: [...], perdidos: [...], sugerencias: [...] }

const fs = require("fs");
const path = require("path");
const { ROOMS } = require("./rooms");

const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }

  if (!fs.existsSync(MESSAGES_FILE)) {
    const initial = {};
    ROOMS.forEach((r) => (initial[r.id] = []));
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(initial, null, 2));
  }
}

function readJSON(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------- Usuarios ----------

function getUsers() {
  return readJSON(USERS_FILE, []);
}

function findUser(username) {
  const users = getUsers();
  return users.find(
    (u) => u.username.toLowerCase() === String(username).toLowerCase()
  );
}

function createUser(username, passwordHash) {
  const users = getUsers();
  const user = { username, passwordHash, createdAt: Date.now() };
  users.push(user);
  writeJSON(USERS_FILE, users);
  return user;
}

// ---------- Mensajes ----------

function getAllMessages() {
  const data = readJSON(MESSAGES_FILE, {});
  ROOMS.forEach((r) => {
    if (!data[r.id]) data[r.id] = [];
  });
  return data;
}

function getRoomMessages(roomId) {
  const data = getAllMessages();
  return data[roomId] || [];
}

let messageCounter = Date.now();
function nextMessageId() {
  messageCounter += 1;
  return messageCounter.toString(36);
}

function addMessage(roomId, message) {
  const data = getAllMessages();
  if (!data[roomId]) data[roomId] = [];

  const fullMessage = {
    id: nextMessageId(),
    timestamp: Date.now(),
    ...message,
  };

  data[roomId].push(fullMessage);
  writeJSON(MESSAGES_FILE, data);
  return fullMessage;
}

// Devuelve un "page" de mensajes para scroll infinito.
// beforeId: id de mensaje (string) -> trae mensajes ANTERIORES a ese mensaje.
// limit: cantidad maxima de mensajes a devolver.
// Se usa el id (contador monotonico unico) como cursor en vez del timestamp,
// para evitar perder mensajes cuando dos llegan en el mismo milisegundo.
function getMessagesPage(roomId, beforeId, limit) {
  const all = getRoomMessages(roomId);
  const max = limit && limit > 0 ? limit : 20;

  let filtered = all;
  if (beforeId) {
    const idx = all.findIndex((m) => m.id === beforeId);
    filtered = idx >= 0 ? all.slice(0, idx) : [];
  }

  const total = filtered.length;
  const page = filtered.slice(Math.max(0, total - max), total);
  const hasMore = total - max > 0;

  return { messages: page, hasMore };
}

// Busqueda de mensajes por palabra clave dentro de una sala (historial de busqueda).
function searchMessages(roomId, query) {
  const all = getRoomMessages(roomId);
  if (!query) return [];
  const q = query.toLowerCase();
  return all.filter(
    (m) => m.text && m.text.toLowerCase().includes(q) && !m.system
  );
}

module.exports = {
  ensureDataFiles,
  getUsers,
  findUser,
  createUser,
  getRoomMessages,
  getMessagesPage,
  addMessage,
  searchMessages,
};
