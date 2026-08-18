/**
 * ContentE Web — Schema & Node Types Manager
 * Carrega e gere os tipos de nós hierárquicos e esquemas de metadados
 */

export const DEFAULT_NODE_TYPES = {
  BOOK: { id: 'BOOK', namePt: 'Livro', nameEn: 'Book', icon: 'book', isStructural: true, allowedChildren: ['VOLUME', 'PART', 'CHAPTER', 'COVER', 'FRONTISPIECE', 'ROSTO', 'INDEX', 'PAGE', 'COLOPHON'] },
  VOLUME: { id: 'VOLUME', namePt: 'Volume', nameEn: 'Volume', icon: 'layers', isStructural: true, allowedChildren: ['PART', 'CHAPTER', 'PAGE', 'INDEX'] },
  PART: { id: 'PART', namePt: 'Parte', nameEn: 'Part', icon: 'bookmark', isStructural: true, allowedChildren: ['CHAPTER', 'PAGE'] },
  CHAPTER: { id: 'CHAPTER', namePt: 'Capítulo', nameEn: 'Chapter', icon: 'file-text', isStructural: true, allowedChildren: ['SUBCHAPTER', 'PARAGRAPH', 'PAGE'] },
  SUBCHAPTER: { id: 'SUBCHAPTER', namePt: 'Subcapítulo', nameEn: 'Subchapter', icon: 'file-minus', isStructural: true, allowedChildren: ['PAGE'] },
  COVER: { id: 'COVER', namePt: 'Capa', nameEn: 'Cover', icon: 'shield', isStructural: true, allowedChildren: ['PAGE'] },
  INDEX: { id: 'INDEX', namePt: 'Índice', nameEn: 'Index', icon: 'list', isStructural: true, allowedChildren: ['PAGE'] },
  FRONTISPIECE: { id: 'FRONTISPIECE', namePt: 'Anterrosto', nameEn: 'Frontispiece', icon: 'image', isStructural: true, allowedChildren: ['PAGE'] },
  ROSTO: { id: 'ROSTO', namePt: 'Rosto', nameEn: 'Rosto', icon: 'file', isStructural: true, allowedChildren: ['PAGE'] },
  COLOPHON: { id: 'COLOPHON', namePt: 'Colofão', nameEn: 'Colophon', icon: 'tag', isStructural: true, allowedChildren: ['PAGE'] },
  PAGE: { id: 'PAGE', namePt: 'Página', nameEn: 'Page', icon: 'file-digit', isStructural: false, allowedChildren: [] },
  
  /* Arquivos Históricos (EAD / ISAD-G) */
  FONDS: { id: 'FONDS', namePt: 'Fundo', nameEn: 'Fonds', icon: 'archive', isStructural: true, allowedChildren: ['SUBFONDS', 'SECTION', 'SERIES', 'ITEM'] },
  SUBFONDS: { id: 'SUBFONDS', namePt: 'SubFundo', nameEn: 'SubFonds', icon: 'folder', isStructural: true, allowedChildren: ['SECTION', 'SERIES', 'ITEM'] },
  SECTION: { id: 'SECTION', namePt: 'Seção', nameEn: 'Section', icon: 'folder-plus', isStructural: true, allowedChildren: ['SUBSECTION', 'SERIES', 'ITEM'] },
  SERIES: { id: 'SERIES', namePt: 'Série', nameEn: 'Series', icon: 'folder-minus', isStructural: true, allowedChildren: ['SUBSERIES', 'ITEM'] },
  ITEM: { id: 'ITEM', namePt: 'Documento Simples', nameEn: 'Document', icon: 'file-check', isStructural: true, allowedChildren: ['PAGE'] }
};

export class SchemaManager {
  constructor() {
    this.nodeTypes = { ...DEFAULT_NODE_TYPES };
  }

  getNodeType(typeId) {
    return this.nodeTypes[typeId] || { id: typeId, namePt: typeId, nameEn: typeId, icon: 'file', isStructural: true, allowedChildren: [] };
  }

  getAllTypes() {
    return Object.values(this.nodeTypes);
  }

  /**
   * Importa definições personalizadas de nodeTypes.xml
   */
  parseNodeTypesXml(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const types = xmlDoc.querySelectorAll('type');
    
    types.forEach(t => {
      const id = t.getAttribute('ID');
      const designationPt = t.querySelector('designation[LANG="PT"]')?.textContent || id;
      const designationEn = t.querySelector('designation[LANG="EN"]')?.textContent || id;
      
      this.nodeTypes[id] = {
        id,
        namePt: designationPt,
        nameEn: designationEn,
        icon: 'folder',
        isStructural: id !== 'PAGE',
        allowedChildren: DEFAULT_NODE_TYPES[id]?.allowedChildren || []
      };
    });

    return this.nodeTypes;
  }
}
