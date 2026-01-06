// InterestSelector.jsx
import React, { useState, useEffect } from 'react';
import './Interest.css';
import SelectorGridItem from '../common/SelectorGridItem';

const initialArtMovements = [
  { id: 'roman1', title: 'roman', style: 'roman', imageUrl: 'assets/images/testmuseum.png' },
  { id: 'gothique', title: 'gothique', style: 'gothique', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'renaissance', title: 'renaissance', style: 'renaissance', imageUrl: '/assets/images/testmuseum.png' },
];

const InterestSelector = ({ onSelectionChange }) => {
  // ✅ Start with the first movement selected by default
  const [selectedMovements, setSelectedMovements] = useState([initialArtMovements[0].id]);

  const handleMovementClick = (movementId) => {
    setSelectedMovements((prevSelected) => {
      // If clicked item is already selected, prevent deselecting the last one
      if (prevSelected.includes(movementId)) {
        // Only allow deselecting if there's more than one selected
        if (prevSelected.length > 1) {
          return prevSelected.filter((id) => id !== movementId);
        } else {
          return prevSelected; // ❌ Don’t deselect the only selected item
        }
      } else {
        // Otherwise, add the new selection
        return [...prevSelected, movementId];
      }
    });
  };

  // 🔁 Notify parent whenever selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedMovements);
    }
  }, [selectedMovements, onSelectionChange]);

  return (
    <div className="movement-selector-container">
      <div className="movement-selector-header">
        Quels sont vos centres d’intérêts ?
      </div>

      <div className="movement-selector-grid">
        {initialArtMovements.map((movement) => (
          <SelectorGridItem
            key={movement.id}
            id={movement.id}
            title={movement.title}
            imageUrl={movement.imageUrl}
            isSelected={selectedMovements.includes(movement.id)}
            onClick={() => handleMovementClick(movement.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default InterestSelector;
