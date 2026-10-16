import { api, getAccessToken } from "./api.js";
const API_URL = api.base.replace(/\/api$/, "");
export const resolveAvatar = (u) => (!u ? null : /^https?:|^data:|^blob:/.test(u) ? u : `${API_URL}${u}`);
export const profileApi = {
  me: () => api.get("/users/me"),
  update: (b) => api.patch("/users/me", b),
  prefs: (preferences) => api.patch("/users/me/preferences", { preferences }),
  activity: (p = 1) => api.get(`/users/me/activity?page=${p}&limit=20`),
  purchases: (p = 1) => api.get(`/users/me/purchases?page=${p}&limit=10`),
  subscription: () => api.get("/users/me/subscription"),
  exportData: () => api.get("/users/me/export"),
  deleteAvatar: () => api.del("/users/me/avatar"),
  uploadAvatar(file, onProgress) {
    const token = getAccessToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${api.base}/users/me/avatar`);
      xhr.withCredentials = true;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => { try { const j = JSON.parse(xhr.responseText); if (xhr.status < 300) resolve(j.data ?? j); else reject(j); } catch { reject({ message: "Upload failed" }); } };
      xhr.onerror = () => reject({ message: "Upload failed" });
      const fd = new FormData(); fd.append("avatar", file); xhr.send(fd);
    });
  },
};
