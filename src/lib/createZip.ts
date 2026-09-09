type ZipEntry = { name: string; data: Blob | ArrayBuffer | Uint8Array | string };

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let result = value;
  for (let bit = 0; bit < 8; bit += 1) result = (result & 1) ? 0xedb88320 ^ (result >>> 1) : result >>> 1;
  return result >>> 0;
});

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const bytesFor = async (data: ZipEntry["data"]) => {
  if (typeof data === "string") return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return new Uint8Array(data);
};

const header = (length: number) => new Uint8Array(length);
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// Produces a standards-compliant, uncompressed ZIP. Evidence files are already
// compressed formats (JPEG, PNG and PDF), so STORE avoids wasted CPU and memory.
export async function createZip(entries: ZipEntry[]) {
  const localParts: ArrayBuffer[] = [];
  const centralParts: ArrayBuffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = await bytesFor(entry.data);
    const checksum = crc32(data);
    const local = header(30);
    const localView = view(local);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localParts.push(Uint8Array.from(local).buffer, Uint8Array.from(name).buffer, Uint8Array.from(data).buffer);

    const central = header(46);
    const centralView = view(central);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    centralParts.push(Uint8Array.from(central).buffer, Uint8Array.from(name).buffer);
    offset += local.length + name.length + data.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const end = header(22);
  const endView = view(end);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...centralParts, Uint8Array.from(end).buffer], { type: "application/zip" });
}
