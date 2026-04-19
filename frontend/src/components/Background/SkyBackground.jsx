import "./sky-background.css";
import cloudImage from "../../assets/sky-cloud.png";

const clouds = [
  { id: 1, top: "2.5%", width: "15rem", duration: "72s", delay: "-18s", opacity: 0.68 },
  { id: 2, top: "7%", width: "11rem", duration: "58s", delay: "-44s", opacity: 0.6 },
  { id: 3, top: "11.5%", width: "17rem", duration: "80s", delay: "-8s", opacity: 0.66 },
  { id: 4, top: "16%", width: "13rem", duration: "66s", delay: "-30s", opacity: 0.54 },
  { id: 5, top: "21%", width: "19rem", duration: "92s", delay: "-54s", opacity: 0.62 },
  { id: 6, top: "26%", width: "12rem", duration: "76s", delay: "-22s", opacity: 0.48 },
];

function SkyBackground({ children, className = "" }) {
  return (
    <div className={`sky-screen ${className}`.trim()}>
      <div className="sky-background" aria-hidden="true">
        <div className="sky-glow sky-glow-left" />
        <div className="sky-glow sky-glow-right" />
        {clouds.map((cloud) => (
          <img
            key={cloud.id}
            className="sky-cloud"
            src={cloudImage}
            alt=""
            style={{
              top: cloud.top,
              width: cloud.width,
              animationDuration: cloud.duration,
              animationDelay: cloud.delay,
              opacity: cloud.opacity,
            }}
          />
        ))}
      </div>

      <div className="sky-content">{children}</div>
    </div>
  );
}

export default SkyBackground;
