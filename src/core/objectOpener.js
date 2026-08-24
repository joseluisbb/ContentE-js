/**
 * ContentE Web — Abertura Unificada de Objetos
 * Deteta automaticamente o conteúdo de um ZIP ou de uma pasta selecionada:
 * - uma obra HTML previamente gerada (contém index.html)
 * - uma coleção simples de imagens
 * e devolve uma árvore de nós pronta a instalar no TreeManager.
 */

import { HtmlImporter } from './htmlImporter.js';

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|bmp|webp|tiff?|svg)$/i;

export class ObjectOpener {
  static isImageFile(name) {
    return IMAGE_EXT_RE.test(name);
  }

  /**
   * Abre um ficheiro .zip: pode ser uma obra previamente gerada ou apenas imagens
   */
  static async openZipFile(file) {
    if (typeof window.JSZip === 'undefined') {
      throw new Error('JSZip não está disponível.');
    }

    const zip = await window.JSZip.loadAsync(file);
    const indexEntry = HtmlImporter.findIndexEntry(zip);

    if (indexEntry) {
      const root = await HtmlImporter.loadFromZipObject(zip);
      return { kind: 'object', root };
    }

    const imageEntries = [];
    zip.forEach((relPath, entry) => {
      if (!entry.dir && ObjectOpener.isImageFile(entry.name)) imageEntries.push(entry);
    });

    if (imageEntries.length === 0) {
      throw new Error('O ficheiro ZIP não contém imagens nem uma obra previamente gerada.');
    }

    imageEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const imageFiles = [];
    for (const entry of imageEntries) {
      const blob = await entry.async('blob');
      const name = entry.name.split('/').pop();
      const type = blob.type || HtmlImporter.inferMimeType(name);
      imageFiles.push({ name, relPath: entry.name, file: new File([blob], name, { type }), size: blob.size, type });
    }

    const label = file.name.replace(/\.zip$/i, '');
    const root = ObjectOpener.buildImagesRoot(label, imageFiles);
    return { kind: 'images', root };
  }

  /**
   * Abre uma pasta local via File System Access API: pode ser uma obra previamente gerada ou apenas imagens
   */
  static async openDirectoryHandle(dirHandle) {
    const imageEntries = [];
    let hasIndex = false;

    const walk = async (handle, prefix) => {
      for await (const entry of handle.values()) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          if (entry.name.toLowerCase() === 'index.html') hasIndex = true;
          if (ObjectOpener.isImageFile(entry.name)) imageEntries.push({ handle: entry, relPath });
        } else if (entry.kind === 'directory') {
          await walk(entry, relPath);
        }
      }
    };
    await walk(dirHandle, '');

    if (hasIndex) {
      const root = await HtmlImporter.loadFromDirectoryHandle(dirHandle);
      return { kind: 'object', root };
    }

    if (imageEntries.length === 0) {
      throw new Error('A pasta selecionada não contém imagens nem uma obra previamente gerada.');
    }

    imageEntries.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true, sensitivity: 'base' }));

    const imageFiles = [];
    for (const { handle, relPath } of imageEntries) {
      const file = await handle.getFile();
      imageFiles.push({ name: file.name, relPath, file, size: file.size, type: file.type || HtmlImporter.inferMimeType(file.name) });
    }

    const root = ObjectOpener.buildImagesRoot(dirHandle.name, imageFiles);
    return { kind: 'images', root };
  }

  /**
   * Abre uma pasta local via <input webkitdirectory> (fallback para navegadores sem File System Access API)
   */
  static async openFolderFileList(fileList, folderLabel) {
    const files = Array.from(fileList);
    const hasIndex = files.some(f => f.name.toLowerCase() === 'index.html');

    if (hasIndex) {
      const root = await HtmlImporter.loadFromFileInputList(files);
      return { kind: 'object', root };
    }

    const imageFiles = files
      .filter(f => ObjectOpener.isImageFile(f.name))
      .map(f => ({
        name: f.name,
        relPath: f.webkitRelativePath || f.name,
        file: f,
        size: f.size,
        type: f.type || HtmlImporter.inferMimeType(f.name)
      }));

    if (imageFiles.length === 0) {
      throw new Error('A pasta selecionada não contém imagens nem uma obra previamente gerada.');
    }

    const root = ObjectOpener.buildImagesRoot(folderLabel, imageFiles);
    return { kind: 'images', root };
  }

  static buildImagesRoot(label, imageFiles) {
    imageFiles.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));

    const rootId = 'node_' + Date.now();
    return {
      id: rootId,
      type: 'BOOK',
      label,
      metadata: {
        title: label,
        creator: '',
        date: new Date().getFullYear().toString(),
        language: 'por',
        rights: '',
        description: ''
      },
      fileRef: null,
      expanded: true,
      children: imageFiles.map((f, idx) => ({
        id: `${rootId}_${idx}`,
        type: 'PAGE',
        label: f.name.replace(/\.[^/.]+$/, ''),
        metadata: { title: f.name.replace(/\.[^/.]+$/, ''), filename: f.name, mimeType: f.type, size: f.size, naturalOrderIndex: idx },
        fileRef: f,
        children: [],
        expanded: false
      }))
    };
  }

  static countPages(node) {
    let count = node.fileRef ? 1 : 0;
    if (node.children) node.children.forEach(c => { count += ObjectOpener.countPages(c); });
    return count;
  }

  /**
   * Constrói uma mensagem de estado clara sobre o que acabou de ser aberto
   */
  static describeResult(result, sourceLabel) {
    if (result.kind === 'object') {
      const count = ObjectOpener.countPages(result.root);
      return `Obra previamente gerada aberta a partir de ${sourceLabel}: "${result.root.label}" (${count} páginas).`;
    }
    const count = result.root.children.length;
    return `${count} imagens abertas a partir de ${sourceLabel} (novo objeto "${result.root.label}").`;
  }
}
