import React from "react";
import "./InterestNotice.css";

const InterestNotice = () => {
  return (
    <div className="interest-notice">
      <h3 className="interest-title">
        Sélectionnez au moins un centre d'intérêt
      </h3>
      <p className="interest-description">
        Votre parcours sera entièrement personnalisé selon vos choix : durée,
        style, intérêts, langue et type de contenu
      </p>
    </div>
  );
};

export default InterestNotice;
