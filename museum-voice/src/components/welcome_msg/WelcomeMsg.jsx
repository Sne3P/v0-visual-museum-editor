import React from 'react';
import './WelcomeMsg.css';

const WelcomeMsg = () => {
  return (
    <div className="welcome-container">
      <div className="welcome-section">
        <h1>
          Bienvenue au Louvre-Lens !
          <br />
          Votre expérience commence ici !
          <br />
          Laissez-vous guider !
        </h1>
      </div>
    </div>
  );
};

export default WelcomeMsg;