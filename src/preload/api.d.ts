import type { SeedApi } from "@shared/ipc";

declare global {
  interface Window {
    seed: SeedApi;
  }
}
