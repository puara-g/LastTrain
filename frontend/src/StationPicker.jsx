import { useEffect, useState } from "react";
import { searchStations } from "./api";
import LineBadge from "./LineBadge";

export default function StationPicker({ placeholder, value, onSelect, searchFn = searchStations }) {
  const [query, setQuery] = useState(value ? `${value.name} (${value.line})` : "");
  const [suggestions, setSuggestions] = useState([]);

  // value가 바깥(부모)에서 직접 바뀌는 경우(예: 이전/다음역 클릭)도 입력창 텍스트를
  // 맞춰준다. value가 null이 되는 건 입력 중일 때라 여기서는 건드리지 않는다.
  useEffect(() => {
    if (value) {
      const expected = `${value.name} (${value.line})`;
      setQuery((prev) => (prev === expected ? prev : expected));
    }
  }, [value]);

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
                <LineBadge line={s.line} />
                {s.name} <span className="line-tag">{s.line}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
