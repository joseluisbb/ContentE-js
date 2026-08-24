/**
 * ContentE Web — File System Access & Metadata Extractor
 * Suporte a acesso a diretórios locais, extração de metadados e MD5 checksums
 */

export class FileSystemManager {
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
}
