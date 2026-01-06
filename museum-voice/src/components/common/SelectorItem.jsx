// SelectorItem.jsx
import React from 'react';
import './SelectorItem.css'; 

const SelectorItem = ({ icon, title, description, isSelected, onClick }) => {
  return (
    <div
      className={`style-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="style-icon">{icon}</div>
      <div className="style-details">
        <div className="style-title">{title}</div>
        <div className="style-description">{description}</div>
      </div>
    </div>
  );
};

export default SelectorItem;
