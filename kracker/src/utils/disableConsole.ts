// 디버그 로그(log/info/debug)는 기본으로 끈다. warn/error 는 항상 남긴다.
// 켜기: 브라우저 콘솔에서 localStorage.debug = "1" 후 새로고침
let debugOn = false;
try {
  debugOn = !!localStorage.getItem("debug");
} catch {}

if (!debugOn) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

export {};
