import React, { useState, useEffect } from 'react';
import './WelcomeMsg.css';

const WelcomeMsg = () => {
  const [museumTitle, setMuseumTitle] = useState('Bienvenue au Louvre-Lens !\nVotre expérience commence ici !\nLaissez-vous guider !');

  useEffect(() => {
    const fetchMuseumTitle = async () => {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/api/museum-settings?setting_key=museum_title`);
        const data = await response.json();
        
        if (data && data.setting_value) {
          setMuseumTitle(data.setting_value);
        }
      } catch (error) {
        console.error('Erreur chargement titre musée:', error);
      }
    };

    fetchMuseumTitle();
  }, []);

  // Convertir les \n en <br />
  const titleLines = museumTitle.split('\n').map((line, index) => (
    <React.Fragment key={index}>
      {line}
      {index < museumTitle.split('\n').length - 1 && <br />}
    </React.Fragment>
  ));

  return (
    <div className="welcome-container">
      <div className="welcome-section">
        <h1>
          {titleLines}
        </h1>
      </div>
    </div>
  );
};

export default WelcomeMsg;