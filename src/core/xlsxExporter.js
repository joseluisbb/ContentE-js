/**
 * ContentE Web — Exportador de Objeto para XLSX
 * Gera uma tabela de metadados (uma linha por página), sem imagens incorporadas
 * (limitação da biblioteca SheetJS gratuita usada por esta app) — as imagens são
 * incluídas como ficheiros separados na pasta images/ do pacote gerado.
 */

const HEADER = [
  'Identificador', 'Título', 'Autor / Origem', 'Data', 'Língua',
  'Assunto', 'Cobertura', 'Notas', 'Direitos', 'Ficheiro de Imagem'
];

export class XlsxExporter {
  /**
   * @param {Array} orderedFicheNodes - nós de página, na ordem final
   * @param {Map} imageMap - node.id -> caminho relativo da imagem no pacote (ex: 'images/image_001.jpg')
   */
  static buildXlsxBlob(orderedFicheNodes, imageMap) {
    if (typeof window.XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) não está disponível.');
    }

    const rows = orderedFicheNodes.map(node => {
      const m = node.metadata || {};
      return [
        m.identifier || '',
        m.title || node.label || '',
        m.creator || '',
        m.date || '',
        m.language || '',
        m.subject || '',
        m.coverage || '',
        m.notes || '',
        m.rights || '',
        imageMap.get(node.id) || ''
      ];
    });

    const worksheet = window.XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Metadados');

    const wbArray = window.XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    return new Blob([wbArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
}
