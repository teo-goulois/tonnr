/** Whether a text holds a control character. The database refuses some, and none belongs in a name. */
export function hasControlCharacter(text: string) {
  return Array.from(text).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  });
}
