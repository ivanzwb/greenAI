import { API_BASE_URL, TOKEN_STORAGE_KEY } from "./config";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface RequestOptions {
  path: string;
  method?: Method;
  data?: unknown;
}

export function getToken(): string {
  try {
    return uni.getStorageSync(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  uni.setStorageSync(TOKEN_STORAGE_KEY, token || "");
}

export function request<T = unknown>(opts: RequestOptions): Promise<T> {
  const { path, method = "GET", data } = opts;
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const token = getToken();

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      data: data as Record<string, unknown> | undefined,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(res) {
        const sc = res.statusCode || 0;
        if (sc >= 200 && sc < 300) {
          resolve(res.data as T);
        } else {
          reject({ statusCode: sc, data: res.data });
        }
      },
      fail(err) {
        reject(err);
      },
    });
  });
}
