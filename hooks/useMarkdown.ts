export function extractCodeBlocks(
  text: string
): Array<{ language: string; code: string }> {
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ language: string; code: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const language = match[1] || "text";
    const code = match[2]?.trimEnd() || "";
    blocks.push({ language, code });
  }
  return blocks;
}

export function stripMarkdown(md: string): string {
  // Remove code blocks first
  let plain = md.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[\s\S]*?\n/, "").replace(/```$/, "")
  );
  // Remove inline code
  plain = plain.replace(/`([^`]+)`/g, "$1");
  // Remove common markdown syntax
  plain = plain
    .replace(/(^|\s)[#>*_~`-]+/g, " ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1");
  return plain;
}
