// Screenshots attached to a message, shared by every function that can take
// one. Three functions accept them now and each was about to grow its own copy
// of the same three limits, which is how they drift apart.
//
// Why images matter here at all: the numbers a creator wants explained are
// often only on their screen. YouTube shows the Shorts swipe-away rate in
// Studio and exposes nothing like it in any API, so for a whole class of
// question the picture IS the data.
export interface AttachedImage {
  mimeType: string;
  base64: string;
}

// What every provider in llm.ts accepts, and what Gemini accepts inline. GIF is
// left out deliberately: it is nobody's screenshot format and animated frames
// cost tokens for nothing.
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_COUNT = 4;

// Takes whatever the client sent and returns either a clean list or the message
// to show them. A single object is accepted as well as an array so that a
// client deployed before the array existed keeps working through the gap
// between the two deploys.
export function parseImages(raw: unknown): { images: AttachedImage[]; error: string } {
  if (!raw) return { images: [], error: '' };
  const list = Array.isArray(raw) ? raw : [raw];

  if (list.length > MAX_COUNT) {
    return { images: [], error: `That is too many images. Send up to ${MAX_COUNT} at a time.` };
  }

  const images: AttachedImage[] = [];
  for (const item of list) {
    const mimeType = (item as AttachedImage)?.mimeType;
    const base64 = (item as AttachedImage)?.base64;
    if (!mimeType || !base64) continue;

    if (!ALLOWED.has(mimeType)) {
      return { images: [], error: 'That image format is not supported. Send a PNG, JPG or WebP.' };
    }
    // base64 runs about 4/3 the size of the bytes it encodes, so this is the
    // 5MB ceiling every provider imposes, measured on the wire.
    if (base64.length > MAX_BYTES * 1.37) {
      return { images: [], error: 'One of those images is too large. Keep each under 5MB.' };
    }
    images.push({ mimeType, base64 });
  }

  return { images, error: '' };
}
