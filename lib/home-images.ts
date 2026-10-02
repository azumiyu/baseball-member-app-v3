export const HOME_IMAGE_MAX_BYTES = 768 * 1024;
export const HOME_IMAGE_PATH = "/api/home-content/images/";
export const HOME_IMAGE_ID = /^[a-f0-9]{64}$/;
export const HOME_IMAGE_MAX_COUNT = 200;
export const HOME_IMAGE_MAX_STORAGE = 64 * 1024 * 1024;

export function isHomeImagePath(value: string): boolean {
  return value.startsWith(HOME_IMAGE_PATH) && HOME_IMAGE_ID.test(value.slice(HOME_IMAGE_PATH.length));
}

export function matchesHomeImageType(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
    && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (type === "image/png") return bytes.length >= 45
    && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8) === 13
    && String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR"
    && String.fromCharCode(...bytes.subarray(-8, -4)) === "IEND";
  if (type === "image/webp") return bytes.length >= 20
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    && ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.subarray(12, 16)))
    && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.length - 8;
  return false;
}
