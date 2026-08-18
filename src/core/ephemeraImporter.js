/**
 * ContentE Web — Importador Ephemera (XLSX & Apple Numbers)
 * Inclui identificadores nos rótulos de navegação [ID] Descrição e alinhamento sem desfasamento
 */

export class EphemeraImporter {
  constructor(treeManager) {
    this.treeManager = treeManager;
  }

  /**
   * Importa um ficheiro .xlsx ou .numbers (Blob/File)
   */
  async importFile(file) {
    const filename = file.name;
    const isXlsx = filename.endsWith('.xlsx');
    const isNumbers = filename.endsWith('.numbers');

    if (!isXlsx && !isNumbers) {
      throw new Error('Formato não suportado. Por favor selecione um ficheiro .xlsx ou .numbers');
    }

    if (typeof window.JSZip === 'undefined') {
      throw new Error('Biblioteca JSZip não carregada.');
    }

    const zip = new window.JSZip();
    const zipContent = await zip.loadAsync(file);

    let images = [];
    let rowsData = [];

    if (isXlsx) {
      const result = await this.parseXlsx(zipContent, file);
      images = result.images;
      rowsData = result.rowsData;
    } else if (isNumbers) {
      const result = await this.parseNumbers(zipContent, file);
      images = result.images;
      rowsData = result.rowsData;
    }

    const albumTitle = filename.replace(/\.(xlsx|numbers)$/i, '');
    const rootNode = this.treeManager.createRoot('BOOK', albumTitle);

    const count = Math.max(images.length, rowsData.length);
    for (let i = 0; i < count; i++) {
      const imgObj = images[i] || null;
      const row = rowsData[i] || {};

      const mappedMeta = this.bestEffortMetadataMapping(row, imgObj, i + 1);
      
      // Rótulo de Navegação: [Identificador] Descrição
      let pageTitle = mappedMeta.title;
      if (mappedMeta.identifier) {
        pageTitle = `[${mappedMeta.identifier}] ${mappedMeta.title}`;
      }

      const pageNode = {
        id: 'node_' + Date.now() + '_' + i,
        type: 'PAGE',
        label: pageTitle,
        metadata: {
          ...mappedMeta,
          rotation: 0
        },
        fileRef: imgObj,
        children: [],
        expanded: false
      };

      rootNode.children.push(pageNode);
    }

    this.treeManager.notify();
    return {
      success: true,
      title: albumTitle,
      totalPages: rootNode.children.length,
      imageCount: images.length
    };
  }

  /**
   * Processa ficheiros .xlsx extraindo ancoragem de desenhos para alinhar por linha
   */
  async parseXlsx(zip, file) {
    const images = [];
    const rowsData = [];

    const drawingRelsPath = Object.keys(zip.files).find(p => p.startsWith('xl/drawings/_rels/drawing') && p.endsWith('.rels'));
    const drawingXmlPath = Object.keys(zip.files).find(p => p.startsWith('xl/drawings/drawing') && p.endsWith('.xml') && !p.includes('_rels'));

    const rowToImageMap = new Map();

    if (drawingXmlPath && drawingRelsPath) {
      try {
        const relsXml = await zip.files[drawingRelsPath].async('string');
        const drawingXml = await zip.files[drawingXmlPath].async('string');
        const parser = new DOMParser();

        const relsDoc = parser.parseFromString(relsXml, 'text/xml');
        const relMap = {};
        relsDoc.querySelectorAll('Relationship').forEach(r => {
          const id = r.getAttribute('Id');
          const target = r.getAttribute('Target').replace('../media/', '');
          relMap[id] = target;
        });

        const drawingDoc = parser.parseFromString(drawingXml, 'text/xml');
        const anchors = drawingDoc.querySelectorAll('twoCellAnchor, oneCellAnchor');
        
        anchors.forEach(anchor => {
          const fromRowElem = anchor.querySelector('from > row');
          const blipElem = anchor.querySelector('blip');
          if (fromRowElem && blipElem) {
            const excelRow = parseInt(fromRowElem.textContent, 10) + 1;
            const embedId = blipElem.getAttribute('r:embed') || blipElem.getAttribute('embed');
            const imgName = relMap[embedId];
            if (imgName) {
              rowToImageMap.set(excelRow, imgName);
            }
          }
        });
      } catch (err) {
        console.warn('Erro ao processar ancoragem de imagens XLSX:', err);
      }
    }

    const mediaFiles = Object.keys(zip.files).filter(path => path.startsWith('xl/media/'));
    const imageMap = new Map();

    for (const path of mediaFiles) {
      const entry = zip.files[path];
      const blob = await entry.async('blob');
      const imgName = path.split('/').pop();
      const mimeType = this.inferMime(imgName);

      imageMap.set(imgName, {
        name: imgName,
        file: new File([blob], imgName, { type: mimeType }),
        size: blob.size,
        type: mimeType
      });
    }

    if (typeof window.XLSX !== 'undefined') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonRows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
        rowsData.push(...jsonRows);
      } catch (err) {
        console.warn('Erro ao ler tabela XLSX via SheetJS:', err);
      }
    }

    if (rowToImageMap.size > 0) {
      const sortedRows = Array.from(rowToImageMap.keys()).sort((a, b) => a - b);
      sortedRows.forEach(excelRow => {
        const imgName = rowToImageMap.get(excelRow);
        if (imageMap.has(imgName)) {
          images.push(imageMap.get(imgName));
          imageMap.delete(imgName);
        }
      });
    }

    imageMap.forEach(img => images.push(img));

    return { images, rowsData };
  }

  async parseNumbers(zip, file) {
    const images = [];
    const rowsData = [];

    const validImagePaths = Object.keys(zip.files).filter(p => 
      p.startsWith('Data/') && 
      /\.(jpe?g|png|tiff?|webp)$/i.test(p) && 
      !p.includes('-small-') && 
      !p.includes('PresetImage')
    );

    validImagePaths.sort();

    for (const path of validImagePaths) {
      const entry = zip.files[path];
      const blob = await entry.async('blob');
      const imgName = path.replace('Data/', '');
      const mimeType = this.inferMime(imgName);

      images.push({
        name: imgName,
        file: new File([blob], imgName, { type: mimeType }),
        size: blob.size,
        type: mimeType
      });
    }

    const iwaFiles = Object.keys(zip.files).filter(p => p.endsWith('.iwa'));
    let extractedStrings = [];

    for (const path of iwaFiles) {
      const content = await zip.files[path].async('string');
      const matches = content.match(/[\x20-\x7e\xc0-\xff]{3,}/g) || [];
      const clean = matches.filter(s => s.length > 3 && !s.startsWith('NS') && !s.startsWith('TST'));
      extractedStrings.push(...clean);
    }

    if (extractedStrings.length > 0) {
      extractedStrings.forEach((str) => {
        rowsData.push({ 'Descrição': str });
      });
    }

    return { images, rowsData };
  }

  /**
   * Mapeamento Heurístico Best-Effort com deteção de identificadores
   */
  bestEffortMetadataMapping(row, imgObj, index) {
    const keys = Object.keys(row);
    const getVal = (patterns) => {
      for (const pattern of patterns) {
        const foundKey = keys.find(k => k.toLowerCase().includes(pattern.toLowerCase()));
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
          const val = String(row[foundKey]).trim();
          if (val && val !== '-') return val;
        }
      }
      return '';
    };

    // Procurar campos de Identificador (Nº, Cota, Código, ID, Referência, F .01...)
    const identifier = getVal(['nº', 'num', 'cota', 'código', 'codigo', 'id', 'ref', 'identificador']);
    const title = getVal(['descri', 'título', 'titulo', 'nome', 'legenda']) || (imgObj ? imgObj.name : `Documento ${index}`);
    const creator = getVal(['autor', 'origem', 'biografia', 'criador']);
    const date = getVal(['data', 'year', 'ano']);
    const coverage = getVal(['geo', 'local', 'país', 'cidade']);
    const subject = getVal(['tema', 'evento', 'assunto', 'categoria']);
    const rights = getVal(['verso', 'texto no verso', 'notas', 'observa', 'pb/c', 'p/np']);

    return {
      identifier: identifier || '',
      title,
      creator: creator || 'Coleção Ephemera',
      date: date || '',
      coverage: coverage || '',
      subject: subject || '',
      language: 'por',
      rights: rights || 'Coleção Ephemera / Uso Cultural',
      filename: imgObj ? imgObj.name : ''
    };
  }

  inferMime(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', tif: 'image/tiff', tiff: 'image/tiff' };
    return map[ext] || 'image/jpeg';
  }
}
