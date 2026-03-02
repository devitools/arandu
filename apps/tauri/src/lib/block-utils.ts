const PREFIX_MAP: Record<string, string> = {
  heading: "H",
  para: "P",
  list: "Li",
  code: "Code",
  quote: "Q",
};

export function blockLabel(blockId: string): string {
  const match = blockId.match(/^mkw-(\w+?)-(\d+)$/);
  if (!match) return blockId;
  return `${PREFIX_MAP[match[1]] || match[1]}${match[2]}`;
}

export function scrollToBlock(blockId: string): void {
  const el = document.getElementById(blockId);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
}
