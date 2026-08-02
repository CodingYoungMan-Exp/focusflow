const DEVICE_ID_KEY = "focusflow:deviceId";

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${value};expires=${expires};path=/;SameSite=Lax`;
  } catch (e) {}
}

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? match[2] : null;
  } catch (e) {
    return null;
  }
}

export function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVICE_ID_KEY) || getCookie(DEVICE_ID_KEY);
  } catch (e) {}
  if (!id) {
    id = crypto.randomUUID();
  }
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch (e) {}
  setCookie(DEVICE_ID_KEY, id, 365);
  return id;
}
