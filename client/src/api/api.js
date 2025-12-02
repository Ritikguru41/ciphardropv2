import axios from "axios";

const API = axios.create({
  baseURL: "https://ciphardropv2.onrender.com", // Render backend URL
});

// Create a new file-sharing session (sender)
export const createSession = (fileMeta) =>
  API.post("/api/create-session", fileMeta);

// Check if a session code exists (receiver)
export const checkSession = (code) =>
  API.post("/api/check-session", { code });

export default API;
