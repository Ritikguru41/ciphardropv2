import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import express from "express";
import { createSession, getSession, deleteSession } from "./utils/sessions.js";


const app = express();
app.use(cors());
app.use(express.json());


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const SESSION_DURATION = 3 * 60 * 1000; // 3 minutes in milliseconds


app.post("/api/create-session", (req, res) => {
  const { fileName, size, type } = req.body;
  const fileMeta = { fileName, size, type };
  const code = createSession(fileMeta);
  return res.json({ code, fileMeta });
});


app.post("/api/check-session", (req, res) => {
  const { code } = req.body;
  const s = getSession(code);
  
  if (!s) {
    return res.json({ ok: false });
  }
  
  // Check if session expired
  if (Date.now() - s.createdAt > SESSION_DURATION) {
    deleteSession(code);
    return res.json({ ok: false });
  }
  
  return res.json({ ok: true, fileMeta: s.fileMeta });
});


io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);


  socket.on("join-session", ({ code, role }) => {
    const s = getSession(code);
    
    if (!s) {
      socket.emit("session-not-found");
      return;
    }
    
    // Check if session expired
    if (Date.now() - s.createdAt > SESSION_DURATION) {
      deleteSession(code);
      socket.emit("session-expired");
      socket.disconnect(true);
      return;
    }
    
    socket.join(code);

    if (role === "sender") s.senderSocket = socket.id;
    if (role === "receiver") s.receiverSocket = socket.id;

    io.to(code).emit("session-ready", s.fileMeta);
  });


  // Relay WebRTC signals (offer/answer/ice)
  socket.on("signal", ({ code, payload }) => {
    socket.to(code).emit("signal", payload);
  });


  // Relay AES ECDH public keys (fixed)
  socket.on("public-key", (publicKey) => {
    const rooms = [...socket.rooms];
    const code = rooms.find((r) => r !== socket.id);
    if (code) {
      socket.to(code).emit("public-key", publicKey);
    }
  });


  socket.on("cleanup-session", ({ code }) => {
    deleteSession(code);
  });


  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.id);
  });
});


// Clean up expired sessions every 30 seconds
setInterval(() => {
  console.log("Checking for expired sessions...");
}, 30000);


server.listen(5000, () => console.log(`Server running on 5000`));
