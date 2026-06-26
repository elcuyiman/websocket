// lib/rooms.js
// Catálogo de salas de chat ("menú" de la cafetería).
// id          -> identificador usado en rutas, sockets y nombres de archivo
// name        -> nombre visible para el usuario
// icon        -> emoji decorativo (temática cafetería)
// description -> bajada descriptiva mostrada en el lobby
// anonymous   -> si es true, los mensajes enviados en esta sala se muestran como "Anónimo"

const ROOMS = [
  {
    id: "errores",
    name: "Comunicación de Errores",
    icon: "🐞",
    description: "Reporta fallos, bugs o caídas del sistema.",
  },
  {
    id: "ayuda",
    name: "Ayuda Técnica",
    icon: "🛠️",
    description: "Consulta dudas técnicas con la comunidad.",
  },
  {
    id: "perdidos",
    name: "Objetos Perdidos",
    icon: "🧳",
    description: "¿Perdiste algo en el laboratorio? Pregúntalo aquí.",
  },
  {
    id: "sugerencias",
    name: "Buzón de Sugerencias",
    icon: "💡",
    description: "Propón mejoras de forma 100% anónima.",
    anonymous: true,
  },
];

function getRoomById(id) {
  return ROOMS.find((r) => r.id === id) || null;
}

module.exports = { ROOMS, getRoomById };
