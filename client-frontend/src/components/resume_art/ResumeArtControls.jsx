import React from "react";
import { FaPlay, FaPause, FaBackward, FaForward } from "react-icons/fa";

const ResumeArtControls = ({ isPlaying, onTogglePlay, hasAudio, onSkipBackward, onSkipForward }) => {
  return (
    <div className="resume-art-controls">
      <FaBackward 
        className="icon control" 
        onClick={onSkipBackward}
        style={{ opacity: hasAudio ? 1 : 0.3, cursor: hasAudio ? 'pointer' : 'not-allowed' }}
        title="Reculer de 10 secondes"
      />
      {isPlaying ? (
        <FaPause 
          className="icon control play-btn" 
          onClick={onTogglePlay}
          style={{ opacity: hasAudio ? 1 : 0.3, cursor: hasAudio ? 'pointer' : 'not-allowed' }}
        />
      ) : (
        <FaPlay 
          className="icon control play-btn" 
          onClick={onTogglePlay}
          style={{ opacity: hasAudio ? 1 : 0.3, cursor: hasAudio ? 'pointer' : 'not-allowed' }}
        />
      )}
      <FaForward 
        className="icon control" 
        onClick={onSkipForward}
        style={{ opacity: hasAudio ? 1 : 0.3, cursor: hasAudio ? 'pointer' : 'not-allowed' }}
        title="Avancer de 10 secondes"
      />
    </div>
  );
};

export default ResumeArtControls;
