/**
 * ContentE Web — Exportador do Objeto (HTML navegável e/ou PDF paginado)
 * Gera o Objeto HTML com suporte a Página de Entrada em Matriz (Grelha de Miniaturas Opcional)
 * e/ou um PDF único, guardando como .ZIP/ficheiro descarregado ou diretamente numa pasta local
 */

import { MetsExporter } from './metsExporter.js';
import { PdfExporter } from './pdfExporter.js';

export class HtmlExporter {
  /**
   * Gera o(s) formato(s) pedidos (HTML e/ou PDF) a partir da árvore do ContentE
   */
  static async exportObject(treeRoot, options = {}) {
    if (!treeRoot) {
      alert('Não existe nenhum objeto documental para exportar.');
      return;
    }

    const generateHtml = !!options.generateHtml;
    const generatePdf = !!options.generatePdf;

    if (!generateHtml && !generatePdf) {
      alert('Selecione pelo menos uma opção: Gerar HTML ou Gerar PDF.');
      return;
    }

    const destination = options.destination === 'folder' ? 'folder' : 'zip';

    if (destination === 'zip' && generateHtml && typeof window.JSZip === 'undefined') {
      alert('JSZip não está disponível.');
      return;
    }

    const matrixOpts = {
      enabled: options.matrixEnabled !== undefined ? options.matrixEnabled : true,
      maxWidthPx: options.matrixMaxPx || 220
    };

    const cleanFolderName = treeRoot.label.replace(/[^a-z0-9_-]/gi, '_');

    // 1. Gerar (e rodar fisicamente) os ficheiros de imagem — reaproveitados pelo HTML e pelo PDF
    const pageNodes = [];
    HtmlExporter.collectPageNodes(treeRoot, pageNodes);

    const imageMap = new Map();
    const imageFiles = new Map(); // 'images/xxx.ext' -> Blob
    const orderedBlobs = [];
    const orderedFicheNodes = []; // nós alinhados 1:1 com orderedBlobs, para as fichas de metadados do PDF

    for (let i = 0; i < pageNodes.length; i++) {
      const p = pageNodes[i];
      if (p.fileRef && p.fileRef.file) {
        const ext = p.fileRef.name.split('.').pop();
        const cleanName = `image_${(i + 1).toString().padStart(3, '0')}.${ext}`;

        const rotation = p.metadata?.rotation || 0;
        let finalBlob = p.fileRef.file;

        if (rotation !== 0) {
          try {
            finalBlob = await HtmlExporter.rotateImageBlob(p.fileRef.file, rotation);
          } catch (err) {
            console.warn(`Erro ao rodar imagem ${cleanName}:`, err);
          }
        }

        imageFiles.set(`images/${cleanName}`, finalBlob);
        imageMap.set(p.id, `images/${cleanName}`);
        orderedBlobs.push(finalBlob);
        orderedFicheNodes.push(p);
      }
    }

    // 2. Preparar os ficheiros extra pedidos (atualmente apenas o PDF)
    const extraFiles = new Map(); // nome do ficheiro na raiz do objeto -> Blob

    if (generatePdf) {
      try {
        const pdfBlob = await PdfExporter.buildPdfBlob(orderedFicheNodes, orderedBlobs, {
          title: treeRoot.label,
          includeMatrix: matrixOpts.enabled,
          matrixMaxPx: matrixOpts.maxWidthPx
        });
        extraFiles.set(`${cleanFolderName}.pdf`, pdfBlob);
      } catch (err) {
        alert(`Falha ao gerar o PDF: ${err.message}`);
        return null;
      }
    }

    // 3. Preparar o pacote HTML (METS.xml + index.html + imagens), se pedido
    let htmlPayload = null;
    if (generateHtml) {
      htmlPayload = {
        imageFiles,
        metsXml: MetsExporter.exportMetsXml(treeRoot),
        htmlContent: HtmlExporter.generateStandaloneHtml(treeRoot, imageMap, matrixOpts)
      };
    }

    if (destination === 'folder') {
      return HtmlExporter.writeToLocalFolder(cleanFolderName, htmlPayload, extraFiles);
    }

    // Apenas PDF: descarregar diretamente o ficheiro, sem o empacotar num .ZIP
    if (!generateHtml && generatePdf) {
      HtmlExporter.triggerDownload(extraFiles.get(`${cleanFolderName}.pdf`), `${cleanFolderName}.pdf`);
      return { destination: 'zip', folderName: cleanFolderName };
    }

    return HtmlExporter.downloadAsZip(cleanFolderName, htmlPayload, extraFiles);
  }

  static triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Empacota o objeto num ficheiro .ZIP e inicia o descarregamento
   */
  static async downloadAsZip(cleanFolderName, htmlPayload, extraFiles) {
    const zip = new window.JSZip();
    const objectFolder = zip.folder(cleanFolderName);

    if (htmlPayload) {
      const imgFolder = objectFolder.folder('images');
      htmlPayload.imageFiles.forEach((blob, relPath) => {
        const name = relPath.replace(/^images\//, '');
        imgFolder.file(name, blob);
      });
      objectFolder.file('METS.xml', htmlPayload.metsXml);
      objectFolder.file('index.html', htmlPayload.htmlContent);
    }

    extraFiles.forEach((blob, name) => {
      objectFolder.file(name, blob);
    });

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    HtmlExporter.triggerDownload(zipBlob, `${cleanFolderName}_ObjetoHTML.zip`);

    return { destination: 'zip', folderName: cleanFolderName };
  }

  /**
   * Escreve o objeto diretamente numa pasta local escolhida pelo utilizador (File System Access API)
   */
  static async writeToLocalFolder(cleanFolderName, htmlPayload, extraFiles) {
    if (!('showDirectoryPicker' in window) || window.location.protocol === 'file:') {
      alert('O seu navegador não suporta guardar diretamente numa pasta local. Utilize a opção de descarregar.');
      return null;
    }

    let parentHandle;
    try {
      parentHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err.name === 'AbortError') return null;
      throw err;
    }

    let objectDirHandle;
    try {
      objectDirHandle = await parentHandle.getDirectoryHandle(cleanFolderName, { create: false });
    } catch (err) {
      if (err.name !== 'NotFoundError' && err.name !== 'TypeMismatchError') throw err;

      const shouldCreate = confirm(`A pasta "${cleanFolderName}" não existe dentro de "${parentHandle.name}".\n\nDeseja criá-la agora?`);
      if (!shouldCreate) return null;

      objectDirHandle = await parentHandle.getDirectoryHandle(cleanFolderName, { create: true });
    }

    if (htmlPayload) {
      const imagesDirHandle = await objectDirHandle.getDirectoryHandle('images', { create: true });

      for (const [relPath, blob] of htmlPayload.imageFiles) {
        const name = relPath.replace(/^images\//, '');
        const fileHandle = await imagesDirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      }

      const metsHandle = await objectDirHandle.getFileHandle('METS.xml', { create: true });
      const metsWritable = await metsHandle.createWritable();
      await metsWritable.write(htmlPayload.metsXml);
      await metsWritable.close();

      const indexHandle = await objectDirHandle.getFileHandle('index.html', { create: true });
      const indexWritable = await indexHandle.createWritable();
      await indexWritable.write(htmlPayload.htmlContent);
      await indexWritable.close();
    }

    for (const [name, blob] of extraFiles) {
      const fileHandle = await objectDirHandle.getFileHandle(name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    }

    return { destination: 'folder', folderName: cleanFolderName, dirName: parentHandle.name };
  }

  static async rotateImageBlob(file, degrees) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const rads = (degrees * Math.PI) / 180;
        const is90 = Math.abs(degrees) === 90 || Math.abs(degrees) === 270;

        canvas.width = is90 ? img.height : img.width;
        canvas.height = is90 ? img.width : img.height;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rads);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob falhou'));
        }, file.type || 'image/jpeg', 0.92);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    });
  }

  static collectPageNodes(node, list) {
    if (node.fileRef || node.type === 'PAGE') {
      list.push(node);
    }
    if (node.children) {
      node.children.forEach(c => HtmlExporter.collectPageNodes(c, list));
    }
  }

  /**
   * Gera o código HTML/CSS/JS autónomo para navegação com Matriz de Entrada opcional
   */
  static generateStandaloneHtml(treeRoot, imageMap, matrixOpts) {
    const jsonTree = JSON.stringify(treeRoot, (key, value) => {
      if (key === 'fileRef') return undefined;
      return value;
    });

    const jsonMap = JSON.stringify(Object.fromEntries(imageMap));

    return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${HtmlExporter.escape(treeRoot.label)} — Objeto Digital ContentE</title>
  <style>
    :root {
      --bg-main: #0f172a;
      --bg-side: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #3b82f6;
      --border: #334155;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg-main); color: var(--text); height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
    header { height: 52px; background: rgba(15,23,42,0.95); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 1.25rem; }
    .brand { font-weight: 700; font-size: 1.1rem; }
    .nav-tabs { display: flex; gap: 0.5rem; }
    .btn-tab { padding: 0.4rem 0.8rem; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 500; }
    .btn-tab.active { background: var(--accent); }
    main { flex: 1; display: grid; grid-template-columns: 300px 1fr 340px; overflow: hidden; position: relative; }
    .panel { background: var(--bg-side); border-right: 1px solid var(--border); overflow-y: auto; padding: 1rem; }
    .panel-right { border-right: none; border-left: 1px solid var(--border); }
    .tree-item { padding: 0.4rem 0.6rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem; margin-bottom: 0.2rem; }
    .tree-item:hover { background: rgba(255,255,255,0.05); }
    .tree-item.active { background: rgba(59,130,246,0.2); color: #60a5fa; font-weight: 600; }
    .viewport { background: #090d16; display: flex; align-items: center; justify-content: center; position: relative; padding: 1rem; overflow: auto; }
    .viewport img { max-width: 100%; max-height: 65vh; object-fit: contain; border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    /* Estilos da Matriz / Grelha de Entrada */
    .matrix-view { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-main); z-index: 20; padding: 1.5rem; overflow-y: auto; }
    .matrix-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${matrixOpts.maxWidthPx}px, 1fr)); gap: 1.25rem; justify-items: stretch; }
    .matrix-card { background: var(--bg-side); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.15s, border-color 0.15s; width: 100%; display: flex; flex-direction: column; }
    .matrix-card:hover { transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 8px 16px rgba(0,0,0,0.4); }
    .matrix-img-box { height: 180px; width: 100%; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .matrix-img-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .matrix-info { padding: 0.75rem; font-size: 0.82rem; }
    .matrix-title { font-weight: 600; color: var(--text); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

    /* Ficha compacta de metadados, mostrada sob cada imagem */
    .meta-fiche { display: flex; flex-direction: column; gap: 0.15rem; }
    .meta-fiche-row { font-size: 0.7rem; line-height: 1.35; color: var(--text-muted); word-break: break-word; }
    .meta-fiche-label { color: var(--text); font-weight: 600; }
    .matrix-info .meta-fiche { margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px solid var(--border); }

    .viewport-fiche-wrap { max-width: 900px; width: 100%; margin: 0 auto; background: var(--bg-side); border: 1px solid var(--border); border-radius: 8px; padding: 0.85rem 1rem; flex-shrink: 0; }
    .viewport-fiche-wrap .meta-fiche-row { font-size: 0.8rem; }
  </style>
</head>
<body>
  <header>
    <div class="brand">📖 ${HtmlExporter.escape(treeRoot.label)}</div>
    <div class="nav-tabs">
      ${matrixOpts.enabled ? '<button id="btnTabMatrix" class="btn-tab active" onclick="switchView(\'matrix\')">🖼️ Matriz / Entrada</button>' : ''}
      <button id="btnTabViewer" class="btn-tab ${!matrixOpts.enabled ? 'active' : ''}" onclick="switchView(\'viewer\')">📄 Leitor Individual</button>
    </div>
  </header>

  <main>
    <!-- Vista em Matriz (Página de Entrada) -->
    <div id="matrixContainer" class="matrix-view" style="display: ${matrixOpts.enabled ? 'block' : 'none'};">
      <div style="max-width: 1400px; margin: 0 auto 1.25rem auto; display: flex; align-items: center; justify-content: space-between;">
        <h2 style="font-size: 1.2rem; font-weight: 600;">Visão Geral da Obra</h2>
        <span style="font-size: 0.85rem; color: var(--text-muted);">Clique em qualquer imagem para abrir no leitor</span>
      </div>
      <div id="matrixGrid" class="matrix-grid"></div>
    </div>

    <!-- Vista Principal de Leitura -->
    <section class="panel">
      <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.75rem;">Estrutura</h4>
      <div id="treeView"></div>
    </section>

    <section class="viewport">
      <div id="imageContainer" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.85rem;">
        <p style="color: var(--text-muted);">Selecione uma imagem na árvore para visualizar</p>
      </div>
    </section>

    <section class="panel panel-right">
      <h4 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.75rem;">Metadados</h4>
      <div id="metaView"></div>
    </section>
  </main>

  <script>
    const tree = ${jsonTree};
    const imgMap = ${jsonMap};
    let activeNode = tree;

    function init() {
      buildMatrix();
      renderTree(tree, document.getElementById('treeView'));
      const pageNodes = [];
      collectPages(tree, pageNodes);
      if (pageNodes.length > 0) {
        selectNode(pageNodes[0]);
      }
    }

    function collectPages(node, list) {
      if (node.fileRef || node.type === 'PAGE') list.push(node);
      if (node.children) node.children.forEach(c => collectPages(c, list));
    }

    const LANGUAGE_NAMES = { por: 'Português', eng: 'Inglês', spa: 'Espanhol', lat: 'Latim' };

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Ficha compacta: lista todos os metadados preenchidos de um nó
    function getFicheEntries(node) {
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
      push('Língua', LANGUAGE_NAMES[m.language] || m.language);
      push('Assunto', m.subject);
      push('Cobertura', m.coverage);
      push('Notas', m.notes);
      push('Direitos', m.rights);
      return entries;
    }

    function renderFicheHtml(node, skipTitle) {
      let entries = getFicheEntries(node);
      if (skipTitle) entries = entries.filter(e => e.label !== 'Título');
      if (entries.length === 0) return '';
      return '<div class="meta-fiche">' + entries.map(e =>
        '<div class="meta-fiche-row"><span class="meta-fiche-label">' + escapeHtml(e.label) + ':</span> ' + escapeHtml(e.value) + '</div>'
      ).join('') + '</div>';
    }

    function buildMatrix() {
      const grid = document.getElementById('matrixGrid');
      if (!grid) return;

      const pageNodes = [];
      collectPages(tree, pageNodes);

      grid.innerHTML = '';
      pageNodes.forEach(p => {
        const imgPath = imgMap[p.id];
        const card = document.createElement('div');
        card.className = 'matrix-card';
        card.onclick = () => {
          selectNode(p);
          switchView('viewer');
        };

        const titleText = p.label || p.metadata?.title || 'Página';

        card.innerHTML = \`
          <div class="matrix-img-box">
            \${imgPath ? '<img src="' + imgPath + '" alt="' + titleText + '">' : '<span style="color:#64748b;">Sem Imagem</span>'}
          </div>
          <div class="matrix-info">
            <div class="matrix-title">\${titleText}</div>
            \${renderFicheHtml(p, true)}
          </div>
        \`;
        grid.appendChild(card);
      });
    }

    function switchView(viewMode) {
      const matrixView = document.getElementById('matrixContainer');
      const btnMatrix = document.getElementById('btnTabMatrix');
      const btnViewer = document.getElementById('btnTabViewer');

      if (viewMode === 'matrix' && matrixView) {
        matrixView.style.display = 'block';
        if (btnMatrix) btnMatrix.classList.add('active');
        if (btnViewer) btnViewer.classList.remove('active');
      } else {
        if (matrixView) matrixView.style.display = 'none';
        if (btnMatrix) btnMatrix.classList.remove('active');
        if (btnViewer) btnViewer.classList.add('active');
      }
    }

    function renderTree(node, container, depth = 0) {
      const div = document.createElement('div');
      div.className = 'tree-item' + (node.id === activeNode.id ? ' active' : '');
      div.style.paddingLeft = (depth * 1.2 + 0.6) + 'rem';
      div.textContent = (node.type === 'PAGE' ? '📄 ' : '📁 ') + (node.label || node.type);
      div.onclick = () => selectNode(node);
      container.appendChild(div);

      if (node.children) {
        node.children.forEach(c => renderTree(c, container, depth + 1));
      }
    }

    function selectNode(node) {
      activeNode = node;
      document.getElementById('treeView').innerHTML = '';
      renderTree(tree, document.getElementById('treeView'));

      const container = document.getElementById('imageContainer');
      const imgPath = imgMap[node.id];
      if (imgPath) {
        container.innerHTML = '<img src="' + imgPath + '" alt="' + (node.label || '') + '">'
          + '<div class="viewport-fiche-wrap">' + renderFicheHtml(node) + '</div>';
      } else {
        container.innerHTML = '<p style="color: var(--text-muted);">Estrutura: ' + (node.label || node.type) + '</p>';
      }

      const metaView = document.getElementById('metaView');
      metaView.innerHTML = renderFicheHtml(node) || '<p style="color: var(--text-muted); font-size: 0.85rem;">Sem metadados preenchidos.</p>';
    }

    init();
  </script>
</body>
</html>`;
  }

  static escape(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
