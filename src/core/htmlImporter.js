/**
 * ContentE Web — Standalone HTML Package Importer
 * Reabre um Objeto HTML já gerado (ficheiro .ZIP exportado ou pasta onde esse ZIP foi descomprimido),
 * reconstruindo a árvore documental e associando novamente as imagens como fileRef.
 */

export class HtmlImporter {
  /**
   * Abre um Objeto HTML a partir de um ficheiro .zip exportado pela aplicação
   */
  static async loadFromZipFile(file) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('JSZip não está disponível.');
    }
    const zip = await window.JSZip.loadAsync(file);
    return HtmlImporter.loadFromZipObject(zip);
  }

  /**
   * Reconstrói a árvore a partir de um objeto JSZip já carregado (evita reanalisar o binário do ZIP)
   */
  static async loadFromZipObject(zip) {
    const indexEntry = HtmlImporter.findIndexEntry(zip);
    if (!indexEntry) {
      throw new Error('Não foi encontrado nenhum ficheiro index.html válido dentro do ZIP.');
    }

    const htmlText = await indexEntry.async('text');
    const { tree, imgMap } = HtmlImporter.parseEmbeddedData(htmlText);
    const basePath = HtmlImporter.dirname(indexEntry.name);

    return HtmlImporter.rebuildTree(tree, imgMap, basePath, async (fullPath) => {
      const entry = zip.file(fullPath);
      if (!entry) return null;
      return entry.async('blob');
    });
  }

  /**
   * Abre um Objeto HTML a partir de uma pasta local já descomprimida (File System Access API)
   */
  static async loadFromDirectoryHandle(rootDirHandle) {
    const fileMap = new Map();
    let indexInfo = null;

    const walk = async (dirHandle, prefix) => {
      for await (const entry of dirHandle.values()) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          fileMap.set(relPath, entry);
          if (entry.name.toLowerCase() === 'index.html') {
            if (!indexInfo || prefix.split('/').length < indexInfo.basePath.split('/').length) {
              indexInfo = { handle: entry, basePath: prefix };
            }
          }
        } else if (entry.kind === 'directory') {
          await walk(entry, relPath);
        }
      }
    };

    await walk(rootDirHandle, '');

    if (!indexInfo) {
      throw new Error('Não foi encontrada nenhuma pasta com index.html válido.');
    }

    const indexFile = await indexInfo.handle.getFile();
    const htmlText = await indexFile.text();
    const { tree, imgMap } = HtmlImporter.parseEmbeddedData(htmlText);

    return HtmlImporter.rebuildTree(tree, imgMap, indexInfo.basePath, async (fullPath) => {
      const fileHandle = fileMap.get(fullPath);
      if (!fileHandle) return null;
      return fileHandle.getFile();
    });
  }

  /**
   * Abre um Objeto HTML a partir de uma FileList (fallback <input webkitdirectory>)
   */
  static async loadFromFileInputList(fileList) {
    const fileMap = new Map();
    let indexFile = null;
    let indexBasePath = '';

    for (const file of fileList) {
      const relPath = file.webkitRelativePath || file.name;
      fileMap.set(relPath, file);
      if (file.name.toLowerCase() === 'index.html') {
        const dirPath = HtmlImporter.dirname(relPath);
        if (!indexFile || dirPath.split('/').length < indexBasePath.split('/').length) {
          indexFile = file;
          indexBasePath = dirPath;
        }
      }
    }

    if (!indexFile) {
      throw new Error('Não foi encontrado nenhum ficheiro index.html válido na pasta selecionada.');
    }

    const htmlText = await indexFile.text();
    const { tree, imgMap } = HtmlImporter.parseEmbeddedData(htmlText);

    return HtmlImporter.rebuildTree(tree, imgMap, indexBasePath, async (fullPath) => {
      return fileMap.get(fullPath) || null;
    });
  }

  static findIndexEntry(zip) {
    const matches = zip.file(/(^|\/)index\.html$/i);
    if (!matches || matches.length === 0) return null;
    matches.sort((a, b) => a.name.split('/').length - b.name.split('/').length);
    return matches[0];
  }

  static dirname(path) {
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.substring(0, idx) : '';
  }

  static parseEmbeddedData(htmlText) {
    const treeJson = HtmlImporter.extractJsonAfterMarker(htmlText, 'const tree = ');
    if (!treeJson) {
      throw new Error('Não foi possível ler a estrutura do objeto a partir do index.html.');
    }
    const imgMapJson = HtmlImporter.extractJsonAfterMarker(htmlText, 'const imgMap = ');
    return {
      tree: JSON.parse(treeJson),
      imgMap: imgMapJson ? JSON.parse(imgMapJson) : {}
    };
  }

  /**
   * Extrai um objeto JSON embutido no script a seguir a um marcador de texto,
   * fazendo a contagem de chavetas respeitando strings para não quebrar em ";" ou "}" internos.
   */
  static extractJsonAfterMarker(text, marker) {
    const markerIdx = text.indexOf(marker);
    if (markerIdx === -1) return null;

    let i = markerIdx + marker.length;
    while (i < text.length && text[i] !== '{') i++;
    if (i >= text.length) return null;

    const start = i;
    let depth = 0;
    let inString = false;
    let quoteChar = '';
    let escaped = false;

    for (; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return text.substring(start, i + 1);
        }
      }
    }
    return null;
  }

  /**
   * Reconstrói recursivamente a árvore de nós, reassociando as imagens como fileRef
   * através do resolvedor fornecido (Blob/File resolver por caminho relativo).
   * A rotação é reposta a 0 porque a imagem exportada já foi fisicamente rodada.
   */
  static async rebuildTree(node, imgMap, basePath, blobResolver) {
    const rebuilt = {
      id: node.id,
      type: node.type,
      label: node.label,
      metadata: { ...node.metadata, rotation: 0 },
      fileRef: null,
      children: [],
      expanded: node.expanded !== undefined ? node.expanded : true
    };

    const imgRelPath = imgMap[node.id];
    if (imgRelPath) {
      const fullPath = basePath ? `${basePath}/${imgRelPath}` : imgRelPath;
      const blob = await blobResolver(fullPath);
      if (blob) {
        const name = imgRelPath.split('/').pop();
        const type = blob.type || HtmlImporter.inferMimeType(name);
        const file = blob instanceof File ? blob : new File([blob], name, { type });
        rebuilt.fileRef = { name, relPath: imgRelPath, file, size: file.size, type };
      }
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        rebuilt.children.push(await HtmlImporter.rebuildTree(child, imgMap, basePath, blobResolver));
      }
    }

    return rebuilt;
  }

  static inferMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      tif: 'image/tiff',
      tiff: 'image/tiff',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      bmp: 'image/bmp',
      gif: 'image/gif',
      svg: 'image/svg+xml'
    };
    return map[ext] || 'application/octet-stream';
  }
}
