import React from "react";
import ResumeArtWorkHeader from "./ResumeArtWorkHeader";
import ResumeArtWorkBody from "./ResumeArtWorkBody";
import "./ResumeArtWorkCard.css";

export default function ResumeArtWorkCard({
  title,
  artist,
  date,
  movement,
  location,
  description
}) {
  return (
    <div className="resume-card-container">
      <ResumeArtWorkHeader
        title={title}
        artist={artist}
        date={date}
        movement={movement}
        location={location}
      />

      <ResumeArtWorkBody description={description} />
    </div>
  );
}
