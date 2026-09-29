import { gunzipSync, inflateSync } from "node:zlib";

const MAX_DECODE_PASSES = 4;

const isGzip = (buffer: Buffer): boolean =>
  buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

const isZlib = (buffer: Buffer): boolean =>
  buffer.length >= 2 && buffer[0] === 0x78;

const parseJson = (value: string): unknown => JSON.parse(value);

const tryDecodeBuffer = (buffer: Buffer): unknown => {
  if (buffer.length === 0) {
    throw new Error("Empty response body");
  }

  const text = buffer.toString("utf8").trim();
  if (!text) {
    throw new Error("Empty response body");
  }

  try {
    return parseJson(text);
  } catch {
    return text;
  }
};

const byteCandidates = (value: unknown): Buffer[] => {
  if (Buffer.isBuffer(value)) {
    return [value, Buffer.from(value.toString("utf8"), "latin1")];
  }

  if (value instanceof Uint8Array) {
    const buffer = Buffer.from(value);
    return [buffer, Buffer.from(buffer.toString("utf8"), "latin1")];
  }

  if (typeof value === "string") {
    const candidates = [Buffer.from(value, "latin1")];
    const compact = value.replace(/\s/g, "");
    if (compact.length >= 8 && /^[A-Za-z0-9+/]+=*$/.test(compact)) {
      candidates.push(Buffer.from(compact, "base64"));
    }
    return candidates;
  }

  throw new Error(`Unsupported payload type: ${typeof value}`);
};

const decodeBuffer = (input: Buffer): unknown => {
  let current = input;
  const seen = new Set<string>();

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    const fingerprint = `${current.length}:${current.subarray(0, 8).toString("hex")}`;
    if (seen.has(fingerprint)) {
      break;
    }
    seen.add(fingerprint);

    const direct = tryDecodeBuffer(current);
    if (typeof direct !== "string") {
      return direct;
    }

    try {
      if (isGzip(current)) {
        current = gunzipSync(current);
        continue;
      }

      if (isZlib(current)) {
        current = inflateSync(current);
        continue;
      }
    } catch {
      return direct;
    }

    return direct;
  }

  return tryDecodeBuffer(current);
};

export const decodePayload = (value: unknown): unknown => {
  if (
    value !== null &&
    typeof value === "object" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array)
  ) {
    return value;
  }

  const candidates = byteCandidates(value);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const decoded = decodeBuffer(candidate);
      if (typeof decoded !== "string") {
        return decoded;
      }

      try {
        return parseJson(decoded);
      } catch {
        lastError = new Error("Decoded payload is not JSON");
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to decode official payload");
};

export const decodeResponse = async (response: Response): Promise<unknown> => {
  if (!response.ok) {
    throw new Error(
      `Official results request failed with ${response.status} ${response.statusText}`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return decodePayload(bytes);
};
