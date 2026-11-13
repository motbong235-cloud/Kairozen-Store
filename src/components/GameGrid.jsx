export default function GameGrid({ games, onSelect }) {
  return (
    <section className="sec" id="games">
      <div className="wrap">
        <div className="sec-top">
          <h2>Popular</h2>
        </div>
        <div className="games">
          {(games || []).map((g) => (
            <button
              key={g.id}
              type="button"
              className="gcard"
              onClick={() => onSelect(g)}
            >
              <div className="gthumb">{g.name.slice(0, 2).toUpperCase()}</div>
              <div className="gmeta">
                <strong>{g.name}</strong>
                <span>{g.tag || ""}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
