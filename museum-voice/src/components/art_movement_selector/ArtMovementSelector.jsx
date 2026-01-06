// ArtMovementSelector.jsx
import React, { useState, useEffect } from 'react';
import './ArtMovementSelector.css';
import SelectorGridItem from '../common/SelectorGridItem';

const initialArtMovements = [
  { id: 'roman1', title: 'roman', style: 'roman', imageUrl: 'assets/images/testmuseum.png' }, 
  { id: 'gothique', title: 'gothique', style: 'gothique', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'renaissance', title: 'renaissance', style: 'renaissance', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'roman2', title: 'roman', style: 'roman', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_1', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_2', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_3', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_4', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_5', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_6', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_7', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_8', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
  { id: 'classicisme_9', title: 'classicisme', style: 'classicisme', imageUrl: '/assets/images/testmuseum.png' },
];

const ArtMovementSelector = ({ onSelectionChange }) => {
  // Default: first movement selected
  const [selectedMovements, setSelectedMovements] = useState([initialArtMovements[0].id]);

  const handleMovementClick = (movementId) => {
    setSelectedMovements(prevSelected => {
      if (prevSelected.includes(movementId)) {
        // Prevent deselecting the last one
        if (prevSelected.length > 1) {
          return prevSelected.filter(id => id !== movementId);
        } else {
          return prevSelected;
        }
      } else {
        return [...prevSelected, movementId];
      }
    });
  };

  // Notify parent automatically on selection change
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedMovements);
    }
  }, [selectedMovements, onSelectionChange]);

  return (
    <div className="movement-selector-container">
      <div className="movement-selector-header">
        Vos mouvements préférés ?
      </div>
      
      <div className="movement-selector-grid">
        {initialArtMovements.map((movement) => (
          <SelectorGridItem
            key={movement.id}
            id={movement.id}
            title={movement.title}
            imageUrl={movement.imageUrl}
            textOverlay={movement.textOverlay}
            isSelected={selectedMovements.includes(movement.id)}
            onClick={() => handleMovementClick(movement.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default ArtMovementSelector;
