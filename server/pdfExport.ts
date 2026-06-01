export type PdfSection = {
  heading?: string;
  rows: Array<string | string[]>;
};

function asciiText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(value: string, maxLength: number) {
  const text = asciiText(value);
  if (text.length <= maxLength) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxLength) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function sectionRows(section: PdfSection) {
  const rows: string[] = [];
  if (section.heading) {
    rows.push("");
    rows.push(asciiText(section.heading).toUpperCase());
  }
  for (const row of section.rows) {
    rows.push(Array.isArray(row) ? row.map(asciiText).join(" | ") : asciiText(row));
  }
  return rows;
}

export function createSimplePdfBase64(title: string, sections: PdfSection[]) {
  const maxChars = 92;
  const lines = [
    asciiText(title),
    `Generated ${new Date().toISOString()}`,
    ...sections.flatMap(sectionRows),
  ].flatMap((line) => line ? wrapLine(line, maxChars) : [""]);

  const linesPerPage = 52;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) {
    pages.push(lines.slice(index, index + linesPerPage));
  }
  if (!pages.length) pages.push([asciiText(title)]);

  const objects: string[] = [
    "",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageObjectIds: number[] = [];

  for (const pageLines of pages) {
    const contentLines = ["BT", "/F1 10 Tf", "50 760 Td"];
    pageLines.forEach((line, index) => {
      if (index > 0) contentLines.push("0 -14 Td");
      contentLines.push(`(${escapePdfText(line)}) Tj`);
    });
    contentLines.push("ET");
    const stream = contentLines.join("\n");
    const contentObjectId = objects.length + 1;
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageObjectId = objects.length + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    pageObjectIds.push(pageObjectId);
  }

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "latin1");
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1").toString("base64");
}
