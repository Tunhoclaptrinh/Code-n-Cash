import { ApiClient } from "@codecash/api-client";
export const platform = new ApiClient({
  baseUrl: "/api/v1",
  getToken: () => localStorage.getItem("codecash.accessToken"),
  onUnauthorized: () => {
    localStorage.removeItem("codecash.accessToken");
    window.dispatchEvent(new Event("codecash:unauthorized"));
  },
});
