/**
 * ContentE Web — Exportador de Objeto para PDF
 * Gera um PDF a partir das imagens (já fisicamente rodadas) da obra:
 * - opcionalmente, páginas de Matriz (Visão Geral em Grelha) a partir da primeira página
 * - uma página por imagem, com uma ficha compacta de metadados sob cada imagem
 */

import { getMetadataFicheEntries } from './metadataFiche.js';

const A4_PX = [794, 1123]; // Página A4 a ~96dpi, em pixéis

const MATRIX_MARGIN = 28;
const MATRIX_GAP = 14;
const MATRIX_CAPTION_LINES = 4;
const MATRIX_LINE_H = 9;
const MATRIX_FONT_SIZE = 7;
const MATRIX_CAPTION_MAX_CHARS = 34;

const IMAGE_FOOTER_PADDING = 18;
const IMAGE_LINE_H = 17;
const IMAGE_FONT_SIZE = 11;

export class PdfExporter {
  /**
   * @param {Array} pageNodes - nós de página, na ordem final, alinhados 1:1 com orderedBlobs
   * @param {Array<Blob>} orderedBlobs - imagens já rodadas fisicamente, na mesma ordem
   * @param {Object} options - { title, includeMatrix, matrixMaxPx }
   */
  static async buildPdfBlob(pageNodes, orderedBlobs, options = {}) {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      throw new Error('jsPDF não está disponível.');
    }
    if (!pageNodes || pageNodes.length === 0 || !orderedBlobs || orderedBlobs.length === 0) {
      throw new Error('Não existem imagens associadas para gerar o PDF.');
    }

    const { jsPDF } = window.jspdf;
    const includeMatrix = !!options.includeMatrix;
    const matrixMaxPx = options.matrixMaxPx || 220;

    const images = [];
    for (let i = 0; i < pageNodes.length; i++) {
      const info = await PdfExporter.blobToJpegDataUrl(orderedBlobs[i]);
      images.push({ node: pageNodes[i], ...info });
    }

    let doc = null;
    const addPage = (format, orientation) => {
      if (!doc) {
        doc = new jsPDF({ unit: 'px', format, orientation, compress: true });
      } else {
        doc.addPage(format, orientation);
      }
      return doc;
    };

    // 1. Páginas de Matriz (Visão Geral em Grelha), sempre a partir da primeira página
    if (includeMatrix) {
      PdfExporter.renderMatrixPages(addPage, images, matrixMaxPx);
    }

    // 2. Uma página por imagem, com ficha compacta de metadados sob cada uma
    images.forEach(img => PdfExporter.renderImagePage(addPage, img));

    if (options.title && doc.setProperties) {
      doc.setProperties({ title: options.title });
    }

    return doc.output('blob');
  }

  static renderMatrixPages(addPage, images, matrixMaxPx) {
    const [pageW, pageH] = A4_PX;
    const cellW = Math.min(matrixMaxPx, pageW - MATRIX_MARGIN * 2);
    const thumbH = Math.round(cellW * 0.72);
    const captionH = MATRIX_CAPTION_LINES * MATRIX_LINE_H + 8;
    const cellH = thumbH + captionH;

    const cols = Math.max(1, Math.floor((pageW - MATRIX_MARGIN * 2 + MATRIX_GAP) / (cellW + MATRIX_GAP)));
    const rows = Math.max(1, Math.floor((pageH - MATRIX_MARGIN * 2 + MATRIX_GAP) / (cellH + MATRIX_GAP)));
    const perPage = cols * rows;

    for (let start = 0; start < images.length; start += perPage) {
      const doc = addPage(A4_PX, 'portrait');
      const pageImages = images.slice(start, start + perPage);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(MATRIX_FONT_SIZE);
      doc.setTextColor(70, 70, 70);

      pageImages.forEach((img, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellX = MATRIX_MARGIN + col * (cellW + MATRIX_GAP);
        const cellY = MATRIX_MARGIN + row * (cellH + MATRIX_GAP);

        const scale = Math.min(cellW / img.width, thumbH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const drawX = cellX + (cellW - drawW) / 2;
        const drawY = cellY + (thumbH - drawH);

        doc.addImage(img.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);

        const entries = getMetadataFicheEntries(img.node).slice(0, MATRIX_CAPTION_LINES);
        let textY = cellY + thumbH + MATRIX_LINE_H;
        entries.forEach(entry => {
          const line = PdfExporter.truncate(`${entry.label}: ${entry.value}`, MATRIX_CAPTION_MAX_CHARS);
          doc.text(line, cellX, textY);
          textY += MATRIX_LINE_H;
        });
      });
    }
  }

  static renderImagePage(addPage, img) {
    const entries = getMetadataFicheEntries(img.node);
    const footerHeight = entries.length > 0
      ? IMAGE_FOOTER_PADDING * 2 + entries.length * IMAGE_LINE_H
      : 0;

    const pageW = img.width;
    const pageH = img.height + footerHeight;
    const orientation = pageW >= pageH ? 'landscape' : 'portrait';

    const doc = addPage([pageW, pageH], orientation);
    doc.addImage(img.dataUrl, 'JPEG', 0, 0, img.width, img.height);

    if (entries.length > 0) {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, img.height, pageW, footerHeight, 'F');
      doc.setDrawColor(210, 210, 210);
      doc.line(0, img.height, pageW, img.height);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(IMAGE_FONT_SIZE);
      doc.setTextColor(40, 40, 40);

      const maxChars = Math.max(20, Math.round(pageW / 6.2));
      let textY = img.height + IMAGE_FOOTER_PADDING + IMAGE_LINE_H * 0.6;
      entries.forEach(entry => {
        const line = PdfExporter.truncate(`${entry.label}: ${entry.value}`, maxChars);
        doc.text(line, IMAGE_FOOTER_PADDING, textY);
        textY += IMAGE_LINE_H;
      });
    }
  }

  static truncate(text, maxChars) {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }

  /**
   * Desenha a imagem num canvas (com fundo branco, para evitar transparência a preto em JPEG)
   * e devolve a dataURL JPEG resultante e as suas dimensões em pixéis
   */
  static blobToJpegDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        URL.revokeObjectURL(url);
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.92),
          width: canvas.width,
          height: canvas.height
        });
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    });
  }
}
