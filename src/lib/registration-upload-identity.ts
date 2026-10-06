export async function registrationUploadIdentity(file: File, stage: string, requirementKey: string | null): Promise<string> {
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("File tidak dapat dibaca."));
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsArrayBuffer(file);
  });
  const metadata = new TextEncoder().encode(JSON.stringify([file.name, file.type, stage, requirementKey]));
  const input = new Uint8Array(metadata.length + bytes.byteLength);
  input.set(metadata); input.set(new Uint8Array(bytes), metadata.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
