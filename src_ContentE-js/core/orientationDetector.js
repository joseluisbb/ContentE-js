/**
 * ContentE Web — Detector de Orientação de Imagens
 * Suporta leitura de metadados EXIF (JPEG) e análise heurística de gradientes (Canvas)
 */

export class OrientationDetector {
  /**
   * Deteta a orientação provável de um ficheiro de imagem.
   * @param {File} file - Ficheiro de imagem
   * @param {HTMLImageElement|null} imgElement - Elemento <img> opcional para análise em canvas
   * @returns {Promise<{suggestedRotation: number, confidence: number, method: string, message: string}>}
   */
  static async detect(file, imgElement = null) {
    if (!file || !file.type.startsWith('image/')) {
      return { suggestedRotation: 0, confidence: 0, method: 'None', message: 'Ficheiro não é imagem' };
    }

    // 1. Tentar leitura de tags EXIF (100% fiável para JPEGs com metadados de câmara/scanner)
    try {
      const buffer = await file.arrayBuffer();
      const exifRotation = this.parseExifOrientation(buffer);
      if (exifRotation !== null) {
        if (exifRotation === 0) {
          return { suggestedRotation: 0, confidence: 100, method: 'EXIF', message: 'Orientação EXIF normal (0°)' };
        }
        return {
          suggestedRotation: exifRotation,
          confidence: 99,
          method: 'EXIF',
          message: `Detetado EXIF: Rodar ${exifRotation}°`
        };
      }
    } catch (err) {
      console.warn('Falha na leitura EXIF:', err);
    }

    // 2. Análise por Canvas & Gradientes (para imagens sem EXIF / digitalizações)
    if (imgElement && imgElement.complete && imgElement.naturalWidth > 0) {
      return this.analyzeGradients(imgElement);
    } else {
      // Se não temos o <img> pronto, carregar temporariamente
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const tempImg = new Image();
        tempImg.onload = () => {
          const res = this.analyzeGradients(tempImg);
          URL.revokeObjectURL(url);
          resolve(res);
        };
        tempImg.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ suggestedRotation: 0, confidence: 0, method: 'None', message: 'Erro a carregar imagem' });
        };
        tempImg.src = url;
      });
    }
  }

  /**
   * Extrai a rotação necessária a partir das tags EXIF Orientation (1, 3, 6, 8)
   */
  static parseExifOrientation(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xFFD8) return null; // Não é JPEG

    const length = view.byteLength;
    let offset = 2;

    while (offset < length - 4) {
      const marker = view.getUint16(offset, false);
      if (marker === 0xFFE1) {
        // Encontrado APP1 (Exif)
        const exifHeader = view.getUint32(offset + 4, false);
        if (exifHeader !== 0x45786966) return null; // 'Exif'

        const tiffOffset = offset + 10;
        const littleEndian = view.getUint16(tiffOffset, false) === 0x4949; // 'II'

        if (view.getUint16(tiffOffset + 2, littleEndian) !== 0x002A) return null; // Magic 42

        const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
        if (firstIfdOffset < 8) return null;

        const dirStart = tiffOffset + firstIfdOffset;
        const entries = view.getUint16(dirStart, littleEndian);

        for (let i = 0; i < entries; i++) {
          const entryOffset = dirStart + 2 + (i * 12);
          if (entryOffset + 10 > length) break;
          const tag = view.getUint16(entryOffset, littleEndian);

          if (tag === 0x0112) { // Orientation Tag
            const val = view.getUint16(entryOffset + 8, littleEndian);
            switch (val) {
              case 1: return 0;
              case 3: return 180;
              case 6: return 90;   // Rodar 90° CW
              case 8: return 270;  // Rodar 270° CW (ou 90° CCW)
              default: return 0;
            }
          }
        }
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      const blockLength = view.getUint16(offset + 2, false);
      offset += 2 + blockLength;
    }
    return null;
  }

  /**
   * Analisa a variação de gradientes de intensidade de linhas de texto numa canvas reduzida.
   */
  static analyzeGradients(img) {
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return { suggestedRotation: 0, confidence: 0, method: 'None', message: 'Sem dimensões' };

    const targetSize = 240;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, targetSize, targetSize);
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    const data = imgData.data;

    // Converter para Grayscale Luminance
    const gray = new Float32Array(targetSize * targetSize);
    for (let i = 0; i < data.length; i += 4) {
      gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    let gradXTotal = 0;
    let gradYTotal = 0;

    // Sobel / Diferenças finitas para acumular gradientes X e Y
    for (let y = 1; y < targetSize - 1; y++) {
      for (let x = 1; x < targetSize - 1; x++) {
        const idx = y * targetSize + x;

        const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
        const gy = Math.abs(gray[idx + targetSize] - gray[idx - targetSize]);

        gradXTotal += gx;
        gradYTotal += gy;
      }
    }

    // Em texto horizontal normal, as linhas de texto causam transições verticais acentuadas (Gy alto).
    // Se a imagem estiver rodada 90° ou 270°, as linhas ficam verticais, fazendo o gradiente X (Gx) sobressair.
    const ratio = gradXTotal / (gradYTotal || 1);

    // Verificação de distribuição de luz nas margens (Topo vs Baixo / Esquerda vs Direita)
    let topLum = 0, botLum = 0, leftLum = 0, rightLum = 0;
    const margin = Math.floor(targetSize * 0.2);

    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const val = gray[y * targetSize + x];
        if (y < margin) topLum += val;
        if (y > targetSize - margin) botLum += val;
        if (x < margin) leftLum += val;
        if (x > targetSize - margin) rightLum += val;
      }
    }

    // Ajuste de sensibilidade com base no Aspect Ratio natural da imagem
    const aspectRatio = nw / nh;
    let rotation = 0;
    let confidence = 0;
    let reason = '';

    // Se as linhas de texto verticais dominarem (ratio > 1.18) ou se for uma página na horizontal com forte gradiente X
    if (ratio > 1.18 || (aspectRatio > 1.25 && ratio > 1.05)) {
      if (topLum < botLum) {
        rotation = 90;
      } else {
        rotation = 270;
      }
      confidence = Math.min(98, Math.round(60 + ratio * 20));
      reason = 'Linhas de texto na vertical / digitalização de lado';
    } else if (ratio < 0.82) {
      if (topLum < botLum * 0.75) {
        rotation = 180;
        confidence = 75;
        reason = 'Margem superior escura / imagem invertida (180°)';
      } else {
        rotation = 0;
        confidence = 90;
        reason = 'Orientação horizontal padrão (0°)';
      }
    } else {
      rotation = 0;
      confidence = 60;
      reason = 'Gradientes neutros / imagem na horizontal correta';
    }

    return {
      suggestedRotation: rotation,
      confidence,
      method: 'TextGradientAnalysis',
      message: `${reason} (${rotation}°)`
    };
  }
}
