/** Splits one line of CSV into its fields. A field in double quotes may contain commas. */
export function parseCsvLine(line: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);

  return fields.map((value) => value.trim());
}

/** The number a field holds, or NaN for an empty field, which `Number` would read as zero. */
export function fieldNumber(field: string) {
  return field === "" ? Number.NaN : Number(field);
}
