// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// تقديم الملفات الثابتة
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// تخزين الجلسات في الذاكرة (بسيط، ينفع كبداية)
const rooms = {}; 
// rooms[roomCode] = { hostId, players: { socketId: {name, score}}, currentQuestion, currentCategory, mode }

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("createRoom", ({ playerName }, callback) => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      hostId: socket.id,
      players: {},
      currentQuestion: null,
      currentCategory: null,
      mode: "online"
    };
    rooms[roomCode].players[socket.id] = {
      name: playerName || "مجهول",
      score: 0
    };
    socket.join(roomCode);
    callback({ roomCode, isHost: true, players: rooms[roomCode].players });
    io.to(roomCode).emit("playersUpdate", rooms[roomCode].players);
  });

  socket.on("joinRoom", ({ roomCode, playerName }, callback) => {
    roomCode = (roomCode || "").toUpperCase();
    const room = rooms[roomCode];
    if (!room) {
      callback({ error: "الغرفة غير موجودة" });
      return;
    }
    if (Object.keys(room.players).length >= 20) {
      callback({ error: "الغرفة ممتلئة" });
      return;
    }
    room.players[socket.id] = {
      name: playerName || "مجهول",
      score: 0
    };
    socket.join(roomCode);
    callback({ roomCode, isHost: room.hostId === socket.id, players: room.players });
    io.to(roomCode).emit("playersUpdate", room.players);
  });

  socket.on("startRoundOnline", ({ roomCode, categoryId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return; // فقط الهوست

    room.currentCategory = categoryId;
    room.currentQuestion = null;
    io.to(roomCode).emit("onlineRoundStarted", { categoryId });
  });

  socket.on("nextQuestionOnline", ({ roomCode, question }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return;

    room.currentQuestion = question;
    io.to(roomCode).emit("onlineQuestionUpdate", question);
  });

  socket.on("addScoreOnline", ({ roomCode, socketId, amount }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (!room.players[socketId]) return;
    room.players[socketId].score += amount || 1;
    io.to(roomCode).emit("playersUpdate", room.players);
  });

  socket.on("resetScoresOnline", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (room.hostId !== socket.id) return;
    Object.values(room.players).forEach((p) => (p.score = 0));
    io.to(roomCode).emit("playersUpdate", room.players);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // إزالة اللاعب من الغرف
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        // لو هوست طلع، نعطي الهوست لشخص آخر أو نحذف الغرفة
        if (room.hostId === socket.id) {
          const ids = Object.keys(room.players);
          if (ids.length === 0) {
            delete rooms[code];
            continue;
          } else {
            room.hostId = ids[0];
          }
        }
        io.to(code).emit("playersUpdate", room.players);
      }
      if (Object.keys(room.players).length === 0) {
        delete rooms[code];
      }
    }
  });
});

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms[code]) return generateRoomCode();
  return code;
}

server.listen(PORT, () => {
  console.log("بودي سين جيم يعمل على المنفذ:", PORT);
});
