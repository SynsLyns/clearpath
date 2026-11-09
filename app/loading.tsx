export default function Loading() {
  return (
    <main className="page-container" aria-label="Loading page">
      <div className="loading-heading">
        <span className="loading-line loading-eyebrow" />
        <span className="loading-line loading-title" />
        <span className="loading-line loading-description" />
      </div>
      <div className="loading-card">
        <span className="loading-line" />
        <span className="loading-line" />
        <span className="loading-line loading-line-short" />
        <span className="loading-line loading-row" />
        <span className="loading-line loading-row" />
      </div>
    </main>
  );
}
