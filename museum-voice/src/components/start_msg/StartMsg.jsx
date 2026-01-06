import React from "react";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: "5px",
    padding: "0 16px",
  },
  headline: {
    background: "#0a0a2a",
    color: "#fff",
    fontWeight: "bold",
    padding: "8px 24px",
    marginBottom: "6px",
    letterSpacing: "1px",
    fontFamily: "serif",
    maxWidth: "82vw", 
    textAlign: "center",
    display: "inline-block",
    transformOrigin: "center",
  },
  subline: {
    background: "#0a0a2a",
    color: "#fff",
    fontSize: "1.1rem",
    padding: "4px 8px",
    marginBottom: "2px",
    fontFamily: "serif",
    width: "fit-content",
    textAlign: "center",
  },
};

export default function StartMsg() {
  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.headline,
          fontSize: "clamp(1rem, 6vw, 2rem)", // ✅ scales with viewport
        }}
      >
        VOTRE VOYAGE COMMENCE ICI.
      </div>

      <div style={styles.subline}>
        Explorez, observez, ressentez — l’art se dévoile
      </div>
      <div style={styles.subline}>
        à votre rythme. au fil d’une visite qui vous ressemble.
      </div>
    </div>
  );
}
