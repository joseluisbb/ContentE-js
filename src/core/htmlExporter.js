/**
 * ContentE Web — Standalone HTML Package Exporter
 * Gera o Objeto HTML com suporte a Página de Entrada em Matriz (Grelha de Miniaturas Opcional)
 */

import { MetsExporter } from './metsExporter.js';

export class HtmlExporter {
  /**
   * Exporta a árvore do ContentE como um pacote ZIP contendo index.html, imagens rodadas, METS.xml e Página de Entrada em Matriz
   */
  static async exportHtmlPackage(treeRoot, options = {}) {
    if (!treeRoot) {
      alert('Não existe nenhum objeto documental para exportar.');
      return;
    }

    if (typeof window.JSZip === 'undefined') {
      alert('JSZip não está disponível.');
      return;
    }

    const matrixOpts = {
      enabled: options.matrixEnabled !== undefined ? options.matrixEnabled : true,
      columns: options.matrixCols || 4,
      maxWidthPx: options.matrixMaxPx || 220
    };

    const zip = new window.JSZip();
    const cleanFolderName = treeRoot.label.replace(/[^a-z0-9_-]/gi, '_');
    const objectFolder = zip.folder(cleanFolderName);

    // 1. Criar pasta de imagens e adicionar os ficheiros
    const imgFolder = objectFolder.folder('images');
    const pageNodes = [];
    HtmlExporter.collectPageNodes(treeRoot, pageNodes);

    const imageMap = new Map();

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

        imgFolder.file(cleanName, finalBlob);
        imageMap.set(p.id, `images/${cleanName}`);
      }
    }

    // 2. Gerar METS XML
    const metsXml = MetsExporter.exportMetsXml(treeRoot);
    objectFolder.file('METS.xml', metsXml);

    // 3. Gerar index.html para Navegação em Browser com Matriz de Entrada
    const htmlContent = HtmlExporter.generateStandaloneHtml(treeRoot, imageMap, matrixOpts);
    objectFolder.file('index.html', htmlContent);

    // 4. Descarregar o ficheiro ZIP
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanFolderName}_ObjetoHTML.zip`;
    a.click();
    URL.revokeObjectURL(url);
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
    .viewport img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .meta-row { margin-bottom: 0.8rem; }
    .meta-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 0.2rem; }
    .meta-val { font-size: 0.9rem; word-break: break-word; }

    /* Estilos da Matriz / Grelha de Entrada */
    .matrix-view { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-main); z-index: 20; padding: 1.5rem; overflow-y: auto; }
    .matrix-grid { display: grid; grid-template-columns: repeat(${matrixOpts.columns}, 1fr); gap: 1.25rem; justify-items: center; max-width: 1400px; margin: 0 auto; }
    .matrix-card { background: var(--bg-side); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; cursor: pointer; transition: transform 0.15s, border-color 0.15s; width: 100%; max-width: ${matrixOpts.maxWidthPx}px; display: flex; flex-direction: column; }
    .matrix-card:hover { transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 8px 16px rgba(0,0,0,0.4); }
    .matrix-img-box { height: 180px; width: 100%; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .matrix-img-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .matrix-info { padding: 0.75rem; font-size: 0.82rem; }
    .matrix-title { font-weight: 600; color: var(--text); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .matrix-sub { font-size: 0.75rem; color: var(--text-muted); }
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
        <h2 style="font-size: 1.2rem; font-weight: 600;">Visão Geral da Obra (${matrixOpts.columns} Colunas)</h2>
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
      <div id="imageContainer" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
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
        const subText = p.metadata?.creator || p.metadata?.date || '';

        card.innerHTML = \`
          <div class="matrix-img-box">
            \${imgPath ? '<img src="' + imgPath + '" alt="' + titleText + '">' : '<span style="color:#64748b;">Sem Imagem</span>'}
          </div>
          <div class="matrix-info">
            <div class="matrix-title">\${titleText}</div>
            <div class="matrix-sub">\${subText}</div>
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
        container.innerHTML = '<img src="' + imgPath + '" alt="' + (node.label || '') + '">';
      } else {
        container.innerHTML = '<p style="color: var(--text-muted);">Estrutura: ' + (node.label || node.type) + '</p>';
      }

      const metaView = document.getElementById('metaView');
      const m = node.metadata || {};
      metaView.innerHTML = \`
        <div class="meta-row"><div class="meta-label">Título / Rótulo</div><div class="meta-val">\${m.title || node.label || '-'}</div></div>
        <div class="meta-row"><div class="meta-label">Autor / Criador</div><div class="meta-val">\${m.creator || '-'}</div></div>
        <div class="meta-row"><div class="meta-label">Data</div><div class="meta-val">\${m.date || '-'}</div></div>
        <div class="meta-row"><div class="meta-label">Assunto / Cobertura</div><div class="meta-val">\${m.subject || m.coverage || '-'}</div></div>
        <div class="meta-row"><div class="meta-label">Notas / Direitos</div><div class="meta-val">\${m.rights || '-'}</div></div>
      \`;
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
