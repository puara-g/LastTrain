// 서울교통공사 공식 노선색.
export const LINE_COLORS = {
  "1호선": "#0052A4",
  "2호선": "#00A84D",
  "3호선": "#EF7C1C",
  "4호선": "#00A5DE",
  "5호선": "#996CAC",
  "6호선": "#CD7C2F",
  "7호선": "#747F00",
  "8호선": "#E6186C",
  "9호선": "#BDB092",
};

// leg.line은 "6호선 응암순환(단방향)"처럼 지선이 붙어있을 수 있어서 본선 이름만 뗀다.
export function baseLine(line) {
  return line.split(" ")[0];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function getLineColor(line) {
  return LINE_COLORS[baseLine(line)] || "#888888";
}

export function getLineTint(line, alpha = 0.08) {
  const { r, g, b } = hexToRgb(getLineColor(line));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// "2호선" -> "2", "6호선 응암순환(단방향)" -> "6" (실제 노선도 원형 배지에 쓰는 숫자만).
export function getLineNumber(line) {
  const match = baseLine(line).match(/\d+/);
  return match ? match[0] : "?";
}
