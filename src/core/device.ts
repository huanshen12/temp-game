export function isMobileGameplayDevice(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const byUa = /android|iphone|ipad|ipod|windows phone|mobile|harmony/.test(ua);
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  const smallScreen = shortEdge <= 900;
  return byUa || (touch && smallScreen);
}
