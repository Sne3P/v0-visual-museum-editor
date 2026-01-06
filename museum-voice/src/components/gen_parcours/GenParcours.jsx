import React from 'react';

const GenParcours = ({ onClick }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      height: '10vh',
      width: '100vw',
    }}
  >
    <button
      style={{
        background: 'white',
        color: '#16163F',
        border: '1px solid #16163F',
        borderRadius: '6px',
        padding: '10px 32px',
        fontSize: '1.2rem',
        fontWeight: 700,
        fontFamily: 'serif',
        cursor: 'pointer',
        boxShadow: 'none',
        outline: 'none',
      }}
      onClick={onClick}
    >
      Générer mon parcours
    </button>
  </div>
);

export default GenParcours;