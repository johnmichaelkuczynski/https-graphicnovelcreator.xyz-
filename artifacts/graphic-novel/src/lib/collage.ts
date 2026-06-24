// Shared collage layout used by both the on-screen ImageCollage (DOM) and the
// PDF/video export (canvas), so a panel's multiple images are arranged
// identically everywhere. Returns the number of tiles per row, top to bottom.
export function collageRows(count: number): number[] {
  switch (count) {
    case 0:
      return [];
    case 1:
      return [1];
    case 2:
      return [2];
    case 3:
      return [2, 1];
    case 4:
      return [2, 2];
    case 5:
      return [2, 3];
    case 6:
      return [3, 3];
    case 7:
      return [3, 4];
    case 8:
      return [4, 4];
    default: {
      // Generic ~square fallback for any other count.
      const cols = Math.ceil(Math.sqrt(count));
      const rows: number[] = [];
      let remaining = count;
      while (remaining > 0) {
        const n = Math.min(cols, remaining);
        rows.push(n);
        remaining -= n;
      }
      return rows;
    }
  }
}
