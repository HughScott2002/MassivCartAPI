import { createHash } from "crypto";

export function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export function md5Buffer(input: string): Buffer {
  return createHash("md5").update(input).digest();
}
