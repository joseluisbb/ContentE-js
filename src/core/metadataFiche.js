/**
 * ContentE Web — Ficha Compacta de Metadados
 * Lista ordenada de campos de metadados a mostrar sob cada imagem no HTML e no PDF
 */

export const FICHE_LANGUAGE_NAMES = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', lat: 'Latim' };

/**
 * Devolve a lista ordenada de pares {label, value} com todos os metadados
 * preenchidos de um nó, prontos a apresentar numa ficha compacta.
 */
export function getMetadataFicheEntries(node) {
  const m = node.metadata || {};
  const entries = [];

  const push = (label, value) => {
    if (value === undefined || value === null) return;
    const str = String(value).trim();
    if (str !== '') entries.push({ label, value: str });
  };

  push('Título', m.title || node.label);
  push('Identificador', m.identifier);
  push('Autor / Origem', m.creator);
  push('Data', m.date);
  push('Língua', FICHE_LANGUAGE_NAMES[m.language] || m.language);
  push('Assunto', m.subject);
  push('Cobertura', m.coverage);
  push('Notas', m.notes);
  push('Direitos', m.rights);

  return entries;
}
