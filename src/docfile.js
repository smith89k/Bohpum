// One way to turn LibreOffice's flat ODF into a Bohpum document, and a document into .bpum text. The editor
// (open / save) and the Explorer menu's convert window both use it, so they make identical files.
import { importFodg } from './odgImport.js';

export function withDefaults(doc) {
  if (!doc.guides) doc.guides = { v: [], h: [] };
  if (!doc.master) doc.master = { objects: [] };
  return doc;
}

// → { doc, warnings }: warnings are the importer's notes (pictures it can't show, simplified shapes…)
export function docFromFodg(xml, base) {
  const doc = importFodg(xml, base);
  const warnings = doc.importWarnings || [];
  delete doc.importWarnings;
  return { doc: withDefaults(doc), warnings };
}

// The publication's name is the file's name
export function bpumText(doc, filePath) {
  doc.name = String(filePath).split(/[\\/]/).pop().replace(/\.bpum$/i, '');
  return JSON.stringify(doc);
}
