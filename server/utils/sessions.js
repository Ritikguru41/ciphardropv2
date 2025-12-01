// utils/sessions.js

const sessions = new Map();
const SESSION_DURATION = 3 * 60 * 1000; // 3 minutes in ms

export function createSession(fileMeta) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  sessions.set(code, {
    senderSocket: null,
    receiverSocket: null,
    fileMeta,
    createdAt: Date.now(), // store creation time
  });

  return code;
}

export function getSession(code) {
  const s = sessions.get(code);
  if (!s) return null;

  // expire here as well (defensive)
  if (Date.now() - s.createdAt > SESSION_DURATION) {
    sessions.delete(code);
    return null;
  }

  return s;
}

export function deleteSession(code) {
  sessions.delete(code);
}

// optional: bulk cleanup helper if you ever want to call it
export function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [code, s] of sessions.entries()) {
    if (now - s.createdAt > SESSION_DURATION) {
      sessions.delete(code);
    }
  }
}
