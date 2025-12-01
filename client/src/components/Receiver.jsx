import React, { useState, useRef } from "react";
import io from "socket.io-client";
import { checkSession } from "../api/api";
import { generateECDHKeyPair, deriveAESKey, decryptChunk } from "../utils/crypto";
import { createPeerConnection } from "../utils/webrtc";


export default function Receiver({ onBack }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [receivedFileName, setReceivedFileName] = useState("");
  const [receivedFileSize, setReceivedFileSize] = useState(0);


  const socketRef = useRef();
  const pcRef = useRef(null);
  const pcReadyRef = useRef(false);


  const keyPairRef = useRef();
  const aesKeyRef = useRef(null);


  const receivedChunks = useRef([]);
  const chunkQueue = useRef([]);
  const iceQueue = useRef([]);
  const fileMetaRef = useRef(null);
  const chunksReceivedRef = useRef(0);


  async function join() {
    if (!code.trim()) {
      setError("Please enter a session code");
      return;
    }

    try {
      setStatus("waiting");
      setError("");

      const response = await checkSession(code);
      if (!response.data.ok) {
        setError("Invalid or expired code!");
        setStatus("error");
        return;
      }

      console.log("Session OK!");

      socketRef.current = io("http://localhost:5000", {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 3,
        timeout: 10000,
      });

      let sessionReady = false;

      // Set up timeout - if no session-ready within 10 seconds, show error
      const timeoutId = setTimeout(() => {
        if (!sessionReady) {
          console.log("Timeout: Session not ready");
          setError("Invalid or expired code!");
          setStatus("error");
          if (socketRef.current) {
            socketRef.current.disconnect();
          }
        }
      }, 10000);

      // Set up listeners BEFORE emitting
      socketRef.current.on("session-expired", () => {
        sessionReady = true;
        clearTimeout(timeoutId);
        console.log("Session expired on server");
        setError("Invalid or expired code!");
        setStatus("error");
        socketRef.current.disconnect();
      });

      socketRef.current.on("session-not-found", () => {
        sessionReady = true;
        clearTimeout(timeoutId);
        console.log("Session not found on server");
        setError("Invalid or expired code!");
        setStatus("error");
        socketRef.current.disconnect();
      });

      socketRef.current.on("session-ready", (fileMeta) => {
        sessionReady = true;
        clearTimeout(timeoutId);
        console.log("File metadata:", fileMeta);
        fileMetaRef.current = fileMeta;
        setReceivedFileName(fileMeta?.fileName || "unknown");
        setReceivedFileSize(fileMeta?.size || 0);

        console.log("Both peers joined → generating ECDH");
        generateAndSendPublicKey();
      });

      socketRef.current.on("public-key", async (remotePublicKey) => {
        console.log("Received sender public key");

        aesKeyRef.current = await deriveAESKey(
          keyPairRef.current.privateKey,
          remotePublicKey
        );

        console.log("AES KEY READY!");

        for (let msg of chunkQueue.current) {
          await processEncryptedChunk(msg);
        }
        chunkQueue.current = [];
      });

      socketRef.current.on("signal", async (data) => {
        if (data.type === "offer") {
          console.log("Received WebRTC offer");

          const waitAES = setInterval(() => {
            if (aesKeyRef.current) {
              clearInterval(waitAES);

              console.log("Setting up WebRTC…");
              setupPeerConnection(code, data.sdp);
            }
          }, 30);
        }

        if (data.type === "ice") {
          if (!pcReadyRef.current || !pcRef.current) {
            console.warn("ICE arrived before pc ready → queued");
            iceQueue.current.push(data.candidate);
          } else {
            pcRef.current.addIceCandidate(data.candidate).catch(console.error);
          }
        }
      });

      socketRef.current.on("error", (err) => {
        sessionReady = true;
        clearTimeout(timeoutId);
        console.log("Socket error:", err);
        setError(err.message || "Socket error");
        setStatus("error");
      });

      socketRef.current.on("connect_error", (err) => {
        sessionReady = true;
        clearTimeout(timeoutId);
        console.log("Connection error:", err);
        setError("Invalid or expired code!");
        setStatus("error");
      });

      // NOW emit join-session after all listeners are set up
      socketRef.current.emit("join-session", { code, role: "receiver" });

    } catch (e) {
      console.error(e);
      setError("Invalid or expired code!");
      setStatus("error");
    }
  }

  async function generateAndSendPublicKey() {
    const { keyPair, publicJwk } = await generateECDHKeyPair();
    keyPairRef.current = keyPair;

    socketRef.current.emit("public-key", publicJwk);
    console.log("Receiver public key sent");
  }

  function setupPeerConnection(sessionCode, offer) {
    pcRef.current = createPeerConnection(
      onMessage,
      ({ type, candidate }) => {
        if (type === "ice") {
          socketRef.current.emit("signal", {
            code: sessionCode,
            payload: { type: "ice", candidate },
          });
        }
      }
    );

    pcReadyRef.current = true;
    setStatus("connected");

    pcRef.current.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    if (iceQueue.current.length > 0) {
      console.log("Applying queued ICE candidates…");
      iceQueue.current.forEach((c) =>
        pcRef.current.addIceCandidate(c).catch(console.error)
      );
      iceQueue.current = [];
    }

    pcRef.current.createAnswer().then((ans) => {
      pcRef.current.setLocalDescription(ans);
      socketRef.current.emit("signal", {
        code: sessionCode,
        payload: { type: "answer", sdp: ans },
      });
    });

    setStatus("receiving");
  }

  async function onMessage(event) {
    try {
      const msg = JSON.parse(event.data);

      if (msg.done) {
        console.log("File transfer completed. Preparing download…");

        const blob = new Blob(receivedChunks.current, {
          type: fileMetaRef.current?.type || "application/octet-stream",
        });

        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = fileMetaRef.current?.fileName || "downloaded-file";
        a.click();

        receivedChunks.current = [];
        setProgress(100);
        setStatus("completed");
        return;
      }

      if (!aesKeyRef.current) {
        console.warn("AES key not ready → queueing chunk");
        chunkQueue.current.push(msg);
        return;
      }

      await processEncryptedChunk(msg);
    } catch (err) {
      console.error("Message parse error:", err);
    }
  }

  async function processEncryptedChunk({ iv, cipher }) {
    try {
      const decrypted = await decryptChunk(aesKeyRef.current, iv, cipher);
      receivedChunks.current.push(decrypted);
      chunksReceivedRef.current++;

      const totalBytesReceived = receivedChunks.current.reduce(
        (sum, chunk) => sum + chunk.byteLength,
        0
      );
      const progressPercent = Math.round(
        (totalBytesReceived / receivedFileSize) * 100
      );
      setProgress(Math.min(100, progressPercent));

      console.log(`Received chunk ${chunksReceivedRef.current} - ${progressPercent}%`);
    } catch (err) {
      console.error("Decrypt failed:", err);
      setError(`Decryption error: ${err.message}`);
      setStatus("error");
    }
  }

  const handleCancel = () => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setStatus("idle");
    setCode("");
    setProgress(0);
    setError("");
    receivedChunks.current = [];
    chunkQueue.current = [];
    iceQueue.current = [];
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <nav className="app-nav">
        <div className="app-logo">
          <div className="app-logo-circle">C</div>
          <span className="app-logo-text">CipherDrop</span>
        </div>
        <button
          onClick={onBack}
          className="app-back-button"
        >
          ← Back
        </button>
      </nav>

      {/* Main Content */}
      <main className="receiver-page-main">
        <div className="receiver-page-inner">
          {/* Back */}
          <button
            onClick={onBack}
            className="receiver-back-link"
          >
            ← Back to Home
          </button>

          {/* Card */}
          <div className="receiver-card">
            <div className="receiver-card-header">
              <div className="receiver-lock-icon-circle">
                🔒
              </div>
              <h1 className="receiver-heading">Receive Files</h1>
              <p className="receiver-subtitle">
                Enter the 6-digit code to retrieve your files
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="receiver-error-modern">
                {error}
              </div>
            )}

            {/* Code Input (single field, V1 logic) */}
            <div className="receiver-code-section">
              <label className="receiver-code-label">Security Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit code"
                disabled={status !== "idle"}
                className="receiver-code-input"
              />
            </div>

            {/* Info Text */}
            <div className="receiver-info-banner">
              <p>
                You'll receive a 6-digit security code from the sender. Enter it here to start the transfer.
              </p>
            </div>

            {/* Join Button */}
            <button
              onClick={join}
              disabled={!code.trim() || status !== "idle"}
              className={
                "receiver-primary-btn " +
                (!code.trim() || status !== "idle"
                  ? "receiver-primary-btn-disabled"
                  : "")
              }
            >
              {status === "waiting" ? "Joining..." : "Retrieve Files"}
            </button>

            {/* Progress & file info when receiving */}
            {status === "receiving" && (
              <div className="receiver-progress-section">
                <div className="receiver-file-summary">
                  <p className="receiver-file-name">
                    <strong>File:</strong> {receivedFileName}
                  </p>
                  <p className="receiver-file-size">
                    <strong>Size:</strong>{" "}
                    {(receivedFileSize / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <div className="receiver-progress-track-modern">
                  <div
                    className="receiver-progress-fill-modern"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="receiver-progress-text-modern">
                  {progress}% received
                </p>
              </div>
            )}

            {/* Success */}
            {status === "completed" && (
              <div className="receiver-success-modern">
                ✅ File received and decrypted successfully! Download started.
              </div>
            )}

            {/* Cancel */}
            {status !== "idle" && (
              <button
                onClick={handleCancel}
                className="receiver-secondary-btn-modern"
              >
                {status === "completed" ? "Start Over" : "Cancel"}
              </button>
            )}

            {/* Status footer */}
            <div className="receiver-status-footer">
              <p>
                <strong>Status:</strong> {status}
              </p>
              {code && (
                <p>
                  <strong>Session Code:</strong> {code}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
