import React, { useState } from "react";
import LandingPage from "./components/LandingPage";
import Sender from "./components/Sender";
import Receiver from "./components/Receiver";


export default function App() {
  const [page, setPage] = useState("landing");
  const [sessionCreatedAt, setSessionCreatedAt] = useState(null);


  const handleGoSender = () => {
    setSessionCreatedAt(null); // Reset timer
    setPage("sender");
  };

  const handleGoReceiver = () => {
    setPage("receiver");
  };


  if (page === "sender") {
    return (
      <Sender 
        onBack={() => setPage("landing")} 
        onSessionCreated={(timestamp) => setSessionCreatedAt(timestamp)}
        sessionCreatedAt={sessionCreatedAt}
      />
    );
  }


  if (page === "receiver") {
    return <Receiver onBack={() => setPage("landing")} />;
  }


  return (
    <LandingPage
      onGoSender={handleGoSender}
      onGoReceiver={handleGoReceiver}
    />
  );
}
