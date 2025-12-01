// src/components/LandingPage.jsx
import React from "react";

export default function LandingPage({ onGoSender, onGoReceiver }) {
  return (
    <div className="app-shell">
      {/* Navigation */}
      <nav className="app-nav">
        <div className="app-logo">
          <div className="app-logo-circle">C</div>
          <span className="app-logo-text">CipherDrop</span>
        </div>
        <div className="landing-nav-links">
          <button
            className="landing-nav-link"
            onClick={() => {
              const el = document.getElementById("features");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Features
          </button>
          <button
            className="landing-nav-link"
            onClick={() => {
              const el = document.getElementById("security");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Security
          </button>
          <button
            className="landing-nav-link"
            onClick={() => {
              const el = document.getElementById("contact");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Contact
          </button>
          <button className="landing-nav-cta" onClick={onGoSender}>
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <main className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-pill">
            <span className="landing-pill-text">Secure File Transfer</span>
          </div>

          <h1 className="landing-hero-title">
            Share files with <span className="landing-hero-highlight">complete security</span>
          </h1>

          <p className="landing-hero-subtitle">
            End-to-end encrypted file transfer. Your files never leave your control. Transfer with
            confidence, knowing your data is protected by strong encryption.
          </p>

          {/* CTA buttons */}
          <div className="landing-hero-cta-row">
            <button className="landing-hero-cta-primary" onClick={onGoSender}>
              <span className="landing-hero-cta-arrow">→</span>
              Send Files
            </button>
            <button className="landing-hero-cta-secondary" onClick={onGoReceiver}>
              Receive Files
            </button>
          </div>

          {/* Stats */}
          <div className="landing-stats-row">
            <div className="landing-stat-card">
              <div className="landing-stat-value">256-bit</div>
              <div className="landing-stat-label">AES Encryption</div>
            </div>
            <div className="landing-stat-card">
              <div className="landing-stat-value">No Logs</div>
              <div className="landing-stat-label">Privacy Guaranteed</div>
            </div>
            <div className="landing-stat-card">
              <div className="landing-stat-value">5GB</div>
              <div className="landing-stat-label">Per Transfer</div>
            </div>
          </div>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="landing-section">
        <div className="landing-section-inner">
          <h2 className="landing-section-title">Why Choose CipherDrop?</h2>

          <div className="landing-feature-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-icon">🛡️</div>
              <h3 className="landing-feature-title">End-to-End Encrypted</h3>
              <p className="landing-feature-text">
                Files are encrypted on your device before being transferred. Only the receiver can
                decrypt them.
              </p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">🔒</div>
              <h3 className="landing-feature-title">Zero-Knowledge</h3>
              <p className="landing-feature-text">
                The server never sees your plaintext files or keys. Your information stays private.
              </p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">⚡</div>
              <h3 className="landing-feature-title">Instant Sharing</h3>
              <p className="landing-feature-text">
                Create a secure session code instantly. Share with anyone, anywhere.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="landing-section landing-section-muted">
        <div className="landing-security-inner">
          <h2 className="landing-section-title">Bank-Level Security</h2>
          <p className="landing-security-text">
            CipherDrop uses modern encryption standards similar to those trusted by financial
            institutions. Your files are strongly protected in transit.
          </p>

          <div className="landing-security-grid">
            <div className="landing-security-item">
              <div className="landing-security-label">✓ Strong AES-256</div>
              <div className="landing-security-sub">Industry-standard encryption</div>
            </div>
            <div className="landing-security-item">
              <div className="landing-security-label">✓ Ephemeral sessions</div>
              <div className="landing-security-sub">Only active during transfers</div>
            </div>
            <div className="landing-security-item">
              <div className="landing-security-label">✓ Privacy-focused</div>
              <div className="landing-security-sub">No file contents stored on the server</div>
            </div>
            <div className="landing-security-item">
              <div className="landing-security-label">✓ Open design</div>
              <div className="landing-security-sub">Architecture easy to audit and review</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="landing-section">
        <div className="landing-cta-inner">
          <h2 className="landing-section-title">Ready to Transfer Securely?</h2>
          <p className="landing-cta-text">
            Start now – no sign up required. Choose to send or receive an encrypted file.
          </p>
          <div className="landing-hero-cta-row">
            <button className="landing-hero-cta-primary" onClick={onGoSender}>
              Send Files Now
            </button>
            <button className="landing-hero-cta-secondary" onClick={onGoReceiver}>
              Receive Files
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>© 2025 CipherDrop. Secure file transfer for everyone.</p>
      </footer>
    </div>
  );
}
