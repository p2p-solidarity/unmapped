export interface DataKeyWrappingRecord {
  formatVersion: 1;
  id: string;
  method: "prf" | "keychain";
  credentialId: string | null;
  iv: string;
  wrappedKey: string;
  createdAt: string;
}
