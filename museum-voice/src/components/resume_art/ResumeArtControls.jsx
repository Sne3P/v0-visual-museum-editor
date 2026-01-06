import React from "react";
import { FaPlay, FaStepBackward, FaStepForward } from "react-icons/fa";

const ResumeArtControls = () => {
  return (
    <div className="resume-art-controls">
      <FaStepBackward className="icon control" />
      <FaPlay className="icon control play-btn" />
      <FaStepForward className="icon control" />
    </div>
  );
};

export default ResumeArtControls;
