import React from "react";
import "./ResumeArt.css";
import ResumeArtImage from "./ResumeArtImage";
import ResumeArtTopIcons from "./ResumeArtTopIcons";
import ResumeArtControls from "./ResumeArtControls";
import ResumeArtProgress from "./ResumeArtProgress";

const ResumeArt = () => {
  return (
    <div className="resume-art">
      <div className="resume-art-image-wrapper">
        <ResumeArtImage />
        <ResumeArtTopIcons />

        {/* 🎵 Overlay that includes controls (then progress bar below) */}
        <div className="resume-art-controls-overlay">
          <ResumeArtControls />

          <div className="resume-art-progress">
            <div className="resume-progress-fill" style={{ width: "45%" }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeArt;
