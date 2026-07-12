// src/download-capture.ts
function isTakeoverURL(value) {
  return /^https?:\/\//i.test(value);
}
function serializeCookies(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
export {
  isTakeoverURL,
  serializeCookies
};
