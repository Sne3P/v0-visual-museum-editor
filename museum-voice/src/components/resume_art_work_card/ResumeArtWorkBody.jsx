import React from "react";

export default function ResumeArtWorkBody({ description }) {
  return (
    <div className="resume-card-body">
      {description.split("\n\n").map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
