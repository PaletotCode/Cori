import { createAuthApiClient } from "../api/authApiClient";
import { authSessionStorage } from "../storage/authSessionStorage";
import { createAuthStore } from "./createAuthStore";

export const authStore = createAuthStore({
  apiClient: createAuthApiClient(),
  storage: authSessionStorage,
});
