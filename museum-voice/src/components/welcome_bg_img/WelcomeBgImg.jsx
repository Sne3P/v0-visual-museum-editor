import React from 'react';
import styles from './WelcomeBgImg.module.css';

const WelcomeBgImg = ({ imageUrl, altText }) => {
  return (
    <div className={styles.imageContainer}>
      <img 
        src={imageUrl} 
        alt={altText || 'Welcome background'} 
        className={styles.backgroundImage}
      />
    </div>
  );
};

export default WelcomeBgImg;