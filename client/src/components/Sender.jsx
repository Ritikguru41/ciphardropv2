import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import { createSession } from "../api/api";
import { generateECDHKeyPair, deriveAESKey, encryptChunk } from "../utils/crypto";
import { createPeerConnection } from "../utils/webrtc";


export default function Sender({ onBack, onSessionCreated, sessionCreatedAt }) {
  // V1 logic state
  const [file, setFile] = useState(null);
  const [code, setCode] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(null);


  const socketRef = useRef();
  const pcRef = useRef();
  const aesKeyRef = useRef();
  const keyPairRef = useRef();
  const dataChannelRef = useRef();
  const totalBytesRef = useRef(0);
  const sentBytesRef = useRef(0);


  // UI-only state for drag effect
  const [isDragging, setIsDragging] = useState(false);

  const SESSION_DURATION = 3 * 60; // 3 minutes in seconds


  useEffect(() => {
    let interval;
    if (code && status !== "idle" && status !== "completed") {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - (sessionCreatedAt || Date.now())) / 1000
        );
        const remaining = Math.max(0, SESSION_DURATION - elapsed);
        setTimeRemaining(remaining);

        if (remaining === 0) {
          setError("Session expired! Please start a new transfer.");
          setStatus("expired");
          if (pcRef.current) pcRef.current.close();
          if (socketRef.current) socketRef.current.disconnect();
          clearInterval(interval);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [code, status, sessionCreatedAt, SESSION_DURATION]);


  async function startSession() {
    if (!file) {
      setError("Select a file first!");
      return;
    }


    try {
      setStatus("waiting");
      setError("");


      const response = await createSession({
        fileName: file.name,
        size: file.size,
        type: file.type,
      });


      const { code: sessionCode } = response.data;
      setCode(sessionCode);
      onSessionCreated?.(Date.now());
      totalBytesRef.current = file.size;
      sentBytesRef.current = 0;


      socketRef.current = io("http://localhost:5000");
      socketRef.current.emit("join-session", { code: sessionCode, role: "sender" });


      socketRef.current.on("session-ready", async () => {
        console.log("Both peers joined → generating ECDH");


        const { keyPair, publicJwk } = await generateECDHKeyPair();
        keyPairRef.current = keyPair;


        socketRef.current.emit("public-key", publicJwk);
        console.log("Sender public key sent");
      });


      socketRef.current.on("public-key", async (remotePublicKey) => {
        console.log("Received receiver public key");


        aesKeyRef.current = await deriveAESKey(
          keyPairRef.current.privateKey,
          remotePublicKey
        );


        console.log("AES Key Derived!");
        setStatus("connected");


        await setupWebRTC(sessionCode);
      });


      socketRef.current.on("signal", async (data) => {
        if (!data) return;


        if (data.type === "answer") {
          console.log("Received answer from receiver");
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(data.sdp)
            );
          }
        } else if (data.type === "ice") {
          console.log("Received ICE candidate from receiver");
          if (pcRef.current) {
            pcRef.current.addIceCandidate(data.candidate).catch(console.error);
          } else {
            console.warn("Received ICE but pc not ready yet");
          }
        }
      });


      socketRef.current.on("error", (err) => {
        setError(err.message || "Socket error");
        setStatus("error");
      });
    } catch (err) {
      console.error("Error creating session:", err);
      setError(err.message || "Failed to create session!");
      setStatus("error");
    }
  }


  async function setupWebRTC(sessionCode) {
    try {
      pcRef.current = createPeerConnection(
        () => {},
        ({ type, candidate }) => {
          if (type === "ice") {
            socketRef.current.emit("signal", {
              code: sessionCode,
              payload: { type: "ice", candidate },
            });
          }
        }
      );


      pcRef.current.onconnectionstatechange = () => {
        console.log("PC connectionState:", pcRef.current.connectionState);
      };


      pcRef.current.oniceconnectionstatechange = () => {
        console.log("PC iceConnectionState:", pcRef.current.iceConnectionState);
      };


      const channel = pcRef.current.createDataChannel("file", { ordered: true });
      dataChannelRef.current = channel;


      channel.onopen = () => {
        console.log("DataChannel OPEN → starting file send");
        setStatus("transferring");
        if (!aesKeyRef.current) {
          setError("AES key missing at channel open");
          setStatus("error");
          return;
        }
        sendFile(channel).catch((err) => {
          setError(err.message);
          setStatus("error");
        });
      };


      channel.onmessage = (e) => {
        console.log("Sender received message:", e.data);
      };


      channel.onerror = (err) => {
        console.error("DataChannel error:", err);
        setError("DataChannel error");
        setStatus("error");
      };


      channel.onclose = () => {
        console.warn("DataChannel closed");
        if (status === "transferring") {
          setStatus("completed");
        }
      };


      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);


      socketRef.current.emit("signal", {
        code: sessionCode,
        payload: { type: "offer", sdp: offer },
      });


      console.log("Sent WebRTC offer");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  }


  async function sendFile(channel) {
    try {
      console.log("Reading file and sending encrypted chunks...");


      if (!file.stream || !file.stream().getReader) {
        console.warn("File streaming not supported — using arrayBuffer fallback");
        const buf = await file.arrayBuffer();
        const encryptedChunks = await encryptChunk(aesKeyRef.current, buf);


        for (const chunkData of encryptedChunks) {
          channel.send(JSON.stringify(chunkData));
          sentBytesRef.current += buf.byteLength / encryptedChunks.length;
          setProgress(
            Math.min(
              100,
              Math.round((sentBytesRef.current / totalBytesRef.current) * 100)
            )
          );
        }


        channel.send(JSON.stringify({ done: true }));
        setProgress(100);
        console.log("Sent entire file as chunks");
        return;
      }


      const reader = file.stream().getReader();
      let buffer = new Uint8Array(0);


      while (true) {
        const { done, value } = await reader.read();


        if (done) {
          if (buffer.byteLength > 0) {
            const encryptedChunks = await encryptChunk(aesKeyRef.current, buffer.buffer);
            for (const chunkData of encryptedChunks) {
              channel.send(JSON.stringify(chunkData));
            }
          }


          console.log("File stream finished — sending done marker");
          channel.send(JSON.stringify({ done: true }));
          setProgress(100);
          break;
        }


        try {
          buffer = new Uint8Array([...buffer, ...value]);


          if (buffer.byteLength >= 8 * 1024) {
            const toSend = buffer.slice(0, 8 * 1024);
            buffer = buffer.slice(8 * 1024);


            const encryptedChunks = await encryptChunk(aesKeyRef.current, toSend.buffer);
            for (const chunkData of encryptedChunks) {
              channel.send(JSON.stringify(chunkData));
            }


            sentBytesRef.current += toSend.byteLength;
            const progressPercent = Math.round(
              (sentBytesRef.current / totalBytesRef.current) * 100
            );
            setProgress(Math.min(100, progressPercent));
            console.log(`Sent ${progressPercent}%`);
          }
        } catch (err) {
          console.error("Error encrypting/sending chunk:", err);
          throw err;
        }
      }


      console.log("File send finished — bytes sent:", sentBytesRef.current);
    } catch (err) {
      throw err;
    }
  }


  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError("");
      setProgress(0);
    }
  };


  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };


  const handleDragLeave = () => {
    setIsDragging(false);
  };


  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setError("");
      setProgress(0);
    }
  };


  const handleCancel = () => {
    if (pcRef.current) {
      pcRef.current.close();
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setStatus("idle");
    setFile(null);
    setCode(null);
    setProgress(0);
    setError("");
    setTimeRemaining(null);
  };


  return (
    <div className="app-shell">
      {/* Navigation */}
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
      <main className="sender-page-main">
        <div className="sender-page-inner">
          <h1 className="sender-heading">Send Files Securely</h1>
          <p className="sender-subtitle">
            Upload your files below. They will be encrypted and ready to share instantly.
          </p>


          {/* Upload Box */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={
              "sender-upload-box " +
              (isDragging ? "sender-upload-box-hover" : "")
            }
          >
            <input
              type="file"
              onChange={handleFileSelect}
              disabled={status !== "idle"}
              className="sender-upload-input"
            />


            <div className="sender-upload-content">
              <div className="sender-upload-icon-circle">↑</div>
              <h2 className="sender-upload-title">Drag & drop your file</h2>
              <p className="sender-upload-text">
                or click to browse from your computer
              </p>
              <p className="sender-upload-meta">
                Maximum 1GB per transfer • All files encrypted end-to-end
              </p>
            </div>
          </div>


          {/* Error */}
          {error && (
            <div className="sender-error-modern">{error}</div>
          )}


          {/* File preview + create link */}
          {file && (
            <div className="sender-file-section">
              <h3 className="sender-file-title">Selected File</h3>
              <div className="sender-file-card">
                <div className="sender-file-icon">
                  {(file.name.split(".").pop() || "FILE")
                    .toUpperCase()
                    .slice(0, 3)}
                </div>
                <div className="sender-file-info">
                  <p className="sender-file-name">{file.name}</p>
                  <p className="sender-file-size">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>


              <button
                onClick={startSession}
                disabled={!file || status !== "idle"}
                className="sender-primary-btn"
              >
                {status === "waiting" ? "Connecting..." : "Create Secure Link"}
              </button>
            </div>
          )}


          {/* Code display */}
          {code && status !== "idle" && (
            <div className="sender-code-box-modern">
              <p className="sender-code-label-modern">
                Share this code with receiver:
              </p>
              <p className="sender-code-modern">{code}</p>
            </div>
          )}


          {/* Timer */}
          {code && status !== "idle" && status !== "completed" && status !== "expired" && timeRemaining !== null && (
            <div className="sender-timer">
              <p className="sender-timer-text">
                Code expires in: <span className="sender-timer-value">
                  {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                </span>
              </p>
            </div>
          )}


          {/* Progress */}
          {status === "transferring" && (
            <div className="sender-progress-modern">
              <div className="sender-progress-track">
                <div
                  className="sender-progress-fill-modern"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="sender-progress-text">
                {progress}% Complete
              </p>
            </div>
          )}


          {/* Success */}
          {status === "completed" && (
            <div className="sender-success-modern">
              ✅ File sent and encrypted successfully!
            </div>
          )}


          {/* Cancel / Start over */}
          {status !== "idle" && (
            <button
              onClick={handleCancel}
              className="sender-secondary-btn"
            >
              {status === "completed" ? "Start Over" : "Cancel"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
