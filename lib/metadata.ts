const METADATA_BLOCK_REGEX = /<metadata>[\s\S]*?<\/metadata>/gi;
const METADATA_TAIL_REGEX = /(metadados?|metadata|hidden metadata block|bloco oculto de metadados|json metadata)\s*:?\s*/gi;

export function removeMetadataNoise(text: string): string {
  if (!text) {
    return '';
  }

  let cleaned = text.replace(METADATA_BLOCK_REGEX, '').trim();

  // Remove any trailing sections that start with common metadata prefixes
  cleaned = cleaned.replace(
    /(metadados?|metadata|hidden metadata block|bloco oculto de metadados|json metadata)\s*:?\s*[\s\S]*$/gi,
    '',
  );

  // Remove standalone prefixes that might appear inline
  cleaned = cleaned.replace(METADATA_TAIL_REGEX, '');

  return cleaned.trim();
}


