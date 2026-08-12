import { useEffect, useState } from "react";
import { searchStations } from "./api";

export default function StationPicker({ placeholder, value, onSelect, searchFn = searchStations }) {
  const [query, setQuery] = useState(value ? `${value.name} (${value.line})` : "");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!query.trim() || (value && query === `${value.name} (${value.line})`)) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      searchFn(query.trim())
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, value, searchFn]);

  function handlePick(station) {
    onSelect(station);
    setQuery(`${station.name} (${station.line})`);
    setSuggestions([]);
  }

  return (
    <div className="search-box">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null);
        }}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li key={`${s.line}-${s.name}`}>
              <button onClick={() => handlePick(s)}>
                {s.name} <span className="line-tag">{s.line}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
