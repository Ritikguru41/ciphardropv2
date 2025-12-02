// utils/webrtc.js
export function createPeerConnection(onData, onState) {
  const turnUrl = process.env.REACT_APP_TURN_URL; // e.g. "turn:turn.example.com:3478"
  const turnUser = process.env.REACT_APP_TURN_USER;
  const turnPass = process.env.REACT_APP_TURN_PASS;

  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" }, // fallback STUN
  ];

  if (turnUrl && turnUser && turnPass) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnPass,
    });
  } else {
    // Optional: add a public relay provider's TURN if you have one
    // iceServers.push({ urls: "turn:relay1.expressturn.com:3478", username: "...", credential: "..." });
    console.warn("No TURN configured — public internet connectivity may fail in many NATs");
  }

  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onState({ type: "ice", candidate: event.candidate });
    }
  };

  pc.ondatachannel = (event) => {
    const channel = event.channel;
    channel.onmessage = onData;
    channel.onopen = () => {
      console.log("DataChannel opened (receiver side)");
    };
  };

  pc.onconnectionstatechange = () => {
    onState({ type: "state", state: pc.connectionState });
  };

  pc.oniceconnectionstatechange = () => {
    // you can log for debugging:
    console.log("ICE state:", pc.iceConnectionState);
  };

  return pc;
}
