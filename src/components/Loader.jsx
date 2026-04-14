import "./loader.css";

function Loader({ message = "Loading...", compact = false }) {
  return (
    <div
      className={`loader-wrap ${compact ? "loader-wrap-compact" : ""}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="loader" />
      <p className="loader-message">{message}</p>
    </div>
  );
}

export default Loader;
