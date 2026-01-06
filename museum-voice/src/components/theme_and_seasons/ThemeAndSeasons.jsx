// ThemeAndSeasonsSelector.jsx
import React, { useState, useEffect } from 'react';
import './ThemeAndSeasons.css';
import SelectorGridItem from '../common/SelectorGridItem';

const initialArtMovements = [
  { id: 'roman1', title: 'roman', style: 'roman', imageUrl: 'assets/images/testmuseum.png' }, 
  { id: 'gothique', title: 'gothique', style: 'gothique', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'renaissance', title: 'renaissance', style: 'renaissance', imageUrl: '/assets/images/testmuseum.png' },
];

const ThemeAndSeasonsSelector = ({ onSelectionChange }) => {
  // Default to first movement
  const [selectedMovement, setSelectedMovement] = useState(initialArtMovements[0].id);

  const handleMovementClick = (movementId) => {
    setSelectedMovement(movementId);
  };

  // Notify parent whenever selection changes
  useEffect(() => {
    if (onSelectionChange) onSelectionChange([selectedMovement]);
  }, [selectedMovement, onSelectionChange]);

  return (
    <div className="movement-selector-container">
      <div className="movement-selector-header">
        Thèmes & saisons
      </div>
      
      <div className="movement-selector-grid">
        {initialArtMovements.map((movement) => (
          <SelectorGridItem
            key={movement.id}
            id={movement.id}
            title={movement.title}
            imageUrl={movement.imageUrl}
            textOverlay={movement.textOverlay}
            isSelected={selectedMovement === movement.id}
            onClick={() => handleMovementClick(movement.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ThemeAndSeasonsSelector;
