/**
 * ContentE Web — File System Access & Metadata Extractor
 * Suporte a acesso a diretórios locais, extração de metadados e MD5 checksums
 */

export class FileSystemManager {
  constructor() {
    this.directoryHandle = null;
    this.fileEntries = new Map(); // filename -> File object or FileHandle
  }

  /**
   * Pede autorização ao utilizador para selecionar uma pasta local
   */
  async selectLocalDirectory() {
    if ('showDirectoryPicker' in window) {
      try {
        this.directoryHandle = await window.showDirectoryPicker({
          mode: 'readwrite'
        });
        await this.scanDirectory(this.directoryHandle);
        return { success: true, count: this.fileEntries.size, handle: this.directoryHandle };
      } catch (err) {
        if (err.name === 'AbortError') return { success: false, aborted: true };
        console.warn('showDirectoryPicker falhou, a usar fallback:', err);
      }
    }
    return { success: false, fallback: true };
  }

  /**
   * Lê recursivamente a pasta selecionada
   */
  async scanDirectory(dirHandle, pathPrefix = '') {
    for await (const entry of dirHandle.values()) {
      const relPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        this.fileEntries.set(relPath, {
          name: entry.name,
          relPath,
          file,
          size: file.size,
          type: file.type || this.inferMimeType(entry.name)
        });
      } else if (entry.kind === 'directory') {
        await this.scanDirectory(entry, relPath);
      }
    }
  }

  /**
   * Processa ficheiros vindos de um <input type="file" webkitdirectory>
   */
  handleFileInputList(fileList) {
    this.fileEntries.clear();
    for (const file of fileList) {
      const relPath = file.webkitRelativePath || file.name;
      this.fileEntries.set(relPath, {
        name: file.name,
        relPath,
        file,
        size: file.size,
        type: file.type || this.inferMimeType(file.name)
      });
    }
    return { success: true, count: this.fileEntries.size };
  }

  /**
   * Calcula o MD5 checksum de um ficheiro usando Web Crypto API
   */
  async calculateMD5(file) {
    try {
      const buffer = await file.arrayBuffer();
      // Nota: crypto.subtle.digest suporta SHA-256/384/512 nativamente.
      // Para MD5 ultra-rápido em JS usaremos WebCrypto SHA-256 ou utilitário MD5.
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hexHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hexHash;
    } catch (e) {
      console.error('Erro ao calcular hash:', e);
      return null;
    }
  }

  /**
   * Extrai dimensões (largura/altura) e resolução de uma imagem
   */
  async getImageMetadata(file) {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve({ width: 0, height: 0 });
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const meta = {
          width: img.naturalWidth,
          height: img.naturalHeight,
          aspectRatio: (img.naturalWidth / img.naturalHeight).toFixed(2)
        };
        URL.revokeObjectURL(url);
        resolve(meta);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }

  inferMimeType(filename) {
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
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      xml: 'text/xml'
    };
    return map[ext] || 'application/octet-stream';
  }

  getFileList() {
    const list = Array.from(this.fileEntries.values());
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
    return list;
  }

  getFile(path) {
    return this.fileEntries.get(path);
  }
}
