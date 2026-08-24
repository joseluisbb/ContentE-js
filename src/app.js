/**
 * ContentE Web — Main Application Logic
 * Suporte a identificadores nos rótulos [ID], rotação e vista em Matriz / Grelha de Entrada
 */

import { SchemaManager } from './core/schemaManager.js';
import { FileSystemManager } from './core/fileSystem.js';
import { TreeManager } from './core/treeManager.js';
import { MetsExporter } from './core/metsExporter.js';
import { EphemeraImporter } from './core/ephemeraImporter.js';
import { HtmlExporter } from './core/htmlExporter.js';
import { ObjectOpener } from './core/objectOpener.js';
import { OrientationDetector } from './core/orientationDetector.js';

class App {
  constructor() {
    this.schemaManager = new SchemaManager();
    this.fileSystem = new FileSystemManager();
    this.treeManager = new TreeManager(this.schemaManager);
    this.ephemeraImporter = new EphemeraImporter(this.treeManager);

    this.zoomLevel = 1.0;
    this.isMatrixViewActive = false;
    this.lastOrientationSuggestion = null;
    this.selectedMatrixNodeIds = new Set();
    this.lastMatrixClickedIndex = null;
    this.matrixSuggestionsMap = new Map();
    this.fileUrlCache = new WeakMap();

    this.initUI();
  }

  getFileUrl(file) {
    if (!file) return '';
    if (!this.fileUrlCache.has(file)) {
      this.fileUrlCache.set(file, URL.createObjectURL(file));
    }
    return this.fileUrlCache.get(file);
  }

  initUI() {
    this.treeManager.createRoot('BOOK', 'Álbum / Coleção Digital');
    this.populateNodeTypeSelects();
    this.bindEvents();

    this.renderTree();
    this.renderSelectedNodeMetadata();

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  populateNodeTypeSelects() {
    const types = this.schemaManager.getAllTypes();
    const selects = [document.getElementById('nodeTypeSelect'), document.getElementById('modalNodeTypeSelect')];

    selects.forEach(select => {
      if (!select) return;
      select.innerHTML = '';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `${t.namePt} (${t.id})`;
        select.appendChild(opt);
      });
    });
  }

  bindEvents() {
    this.treeManager.onChange(() => {
      this.renderTree();
      this.renderSelectedNodeMetadata();
      this.updateXmlPreview();
      this.renderThumbnails();
    });

    // Eventos de Drag & Drop (Arrastar e Largar)
    const overlay = document.getElementById('dragDropOverlay');

    ['dragenter', 'dragover'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (overlay) overlay.style.display = 'flex';
      });
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      window.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === overlay || e.clientX === 0 || e.clientY === 0) {
          if (overlay) overlay.style.display = 'none';
        }
      });
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlay) overlay.style.display = 'none';

      if (e.dataTransfer) {
        await this.handleDroppedData(e.dataTransfer);
      }
    });

    // Abrir Modal de Opções de Gravação (HTML e/ou PDF)
    document.getElementById('btnSaveObject')?.addEventListener('click', () => {
      const modal = document.getElementById('modalSaveOptions');
      if (modal) modal.style.display = 'flex';
    });

    document.getElementById('btnCloseSaveModal')?.addEventListener('click', () => this.closeSaveModal());
    document.getElementById('btnCancelSaveModal')?.addEventListener('click', () => this.closeSaveModal());

    // As opções da Matriz aplicam-se ao HTML e/ou ao PDF — só se ocultam se nenhum dos dois estiver selecionado
    document.getElementById('genHtmlCheck')?.addEventListener('change', () => this.updateMatrixOptionsVisibility());
    document.getElementById('genPdfCheck')?.addEventListener('change', () => this.updateMatrixOptionsVisibility());

    // Confirmar Gravação: gerar HTML e/ou PDF (Matriz e Destino aplicam-se conforme a seleção)
    document.getElementById('btnConfirmSave')?.addEventListener('click', async () => {
      const generateHtml = document.getElementById('genHtmlCheck').checked;
      const generatePdf = document.getElementById('genPdfCheck').checked;

      if (!generateHtml && !generatePdf) {
        alert('Selecione pelo menos uma opção: Gerar HTML ou Gerar PDF.');
        return;
      }

      const enabled = document.getElementById('matrixEnableCheck').checked;
      const maxPx = parseInt(document.getElementById('matrixMaxWidthInput').value, 10) || 220;
      const destination = document.querySelector('input[name="exportDestination"]:checked')?.value || 'zip';

      this.closeSaveModal();
      const formatLabel = generateHtml && generatePdf ? 'HTML e PDF' : (generateHtml ? 'HTML' : 'PDF');
      document.getElementById('statusMessage').textContent = destination === 'folder'
        ? `A guardar ${formatLabel} na pasta local escolhida...`
        : `A gerar ${formatLabel}...`;

      try {
        const result = await HtmlExporter.exportObject(this.treeManager.root, {
          generateHtml,
          generatePdf,
          matrixEnabled: enabled,
          matrixMaxPx: maxPx,
          destination
        });

        if (!result) {
          document.getElementById('statusMessage').textContent = 'Pronto';
          return;
        }

        document.getElementById('statusMessage').textContent = destination === 'folder'
          ? `${formatLabel} guardado com sucesso na pasta local escolhida!`
          : `${formatLabel} gerado com sucesso!`;
      } catch (err) {
        console.error('Erro ao gravar objeto:', err);
        alert(`Falha ao gravar: ${err.message}`);
        document.getElementById('statusMessage').textContent = 'Erro ao gravar.';
      }
    });

    // Abrir Modal "Abrir Objeto"
    document.getElementById('btnOpenObject')?.addEventListener('click', () => {
      const modal = document.getElementById('modalOpenObject');
      if (modal) modal.style.display = 'flex';
    });

    document.getElementById('btnCloseOpenObjectModal')?.addEventListener('click', () => this.closeOpenObjectModal());
    document.getElementById('btnCancelOpenObjectModal')?.addEventListener('click', () => this.closeOpenObjectModal());

    document.getElementById('btnOpenObjectFile')?.addEventListener('click', () => {
      this.closeOpenObjectModal();
      document.getElementById('openObjectFileInput')?.click();
    });

    document.getElementById('openObjectFileInput')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await this.handleOpenObjectFile(file);
    });

    document.getElementById('btnOpenObjectFolder')?.addEventListener('click', async () => {
      this.closeOpenObjectModal();
      if ('showDirectoryPicker' in window && window.location.protocol !== 'file:') {
        try {
          const handle = await window.showDirectoryPicker({ mode: 'read' });
          await this.handleOpenObjectDirectoryHandle(handle);
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('showDirectoryPicker falhou, a usar input fallback:', err);
        }
      }
      document.getElementById('openObjectFolderInput')?.click();
    });

    document.getElementById('openObjectFolderInput')?.addEventListener('change', async (e) => {
      const files = e.target.files;
      e.target.value = '';
      if (files && files.length > 0) {
        await this.handleOpenObjectFileList(files);
      }
    });

    // Alternar Vista em Matriz no Canvas Central da App
    document.getElementById('btnToggleMatrixView')?.addEventListener('click', () => {
      this.isMatrixViewActive = !this.isMatrixViewActive;
      this.updateViewerToolbarUI();
      if (this.isMatrixViewActive) {
        this.renderMatrixGridInCanvas();
      } else {
        const node = this.treeManager.getSelectedNode();
        if (node && node.fileRef) {
          this.displayImageInViewer(node.fileRef);
        }
      }
    });

    document.getElementById('btnAddChild')?.addEventListener('click', () => {
      const modal = document.getElementById('modalAddNode');
      if (modal) modal.style.display = 'flex';
    });

    document.getElementById('btnCloseModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnCancelModal')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnConfirmAddNode')?.addEventListener('click', () => {
      const selectedId = this.treeManager.selectedNodeId;
      const typeId = document.getElementById('modalNodeTypeSelect').value;
      const title = document.getElementById('modalNodeTitleInput').value;

      this.treeManager.addChild(selectedId, typeId, title);
      this.closeModal();
      if (this.isMatrixViewActive) this.renderMatrixGridInCanvas();
    });

    document.getElementById('btnMoveUp')?.addEventListener('click', () => {
      if (this.treeManager.selectedNodeId) {
        this.treeManager.moveNodeUp(this.treeManager.selectedNodeId);
        if (this.isMatrixViewActive) this.renderMatrixGridInCanvas();
      }
    });

    document.getElementById('btnMoveDown')?.addEventListener('click', () => {
      if (this.treeManager.selectedNodeId) {
        this.treeManager.moveNodeDown(this.treeManager.selectedNodeId);
        if (this.isMatrixViewActive) this.renderMatrixGridInCanvas();
      }
    });

    document.getElementById('btnDeleteNode')?.addEventListener('click', () => {
      if (this.treeManager.selectedNodeId) {
        this.treeManager.removeNode(this.treeManager.selectedNodeId);
        if (this.isMatrixViewActive) this.renderMatrixGridInCanvas();
      }
    });

    const metaInputs = ['metaTitle', 'metaCreator', 'metaDate', 'metaLanguage', 'metaNotes', 'metaRights', 'nodeTypeSelect'];
    metaInputs.forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.saveMetadataFromForm());
      document.getElementById(id)?.addEventListener('change', () => this.saveMetadataFromForm());
    });

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        
        e.target.classList.add('active');
        const targetPane = e.target.getAttribute('data-tab');
        document.getElementById(targetPane).style.display = 'block';

        if (targetPane === 'tab-xml') {
          this.updateXmlPreview();
        }
      });
    });

    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      this.zoomLevel += 0.2;
      this.applyImageTransforms();
    });

    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      if (this.zoomLevel > 0.4) this.zoomLevel -= 0.2;
      this.applyImageTransforms();
    });

    document.getElementById('btnRotateCW')?.addEventListener('click', () => {
      this.rotateSelectedNode(90);
    });

    document.getElementById('btnRotateCCW')?.addEventListener('click', () => {
      this.rotateSelectedNode(-90);
    });

    document.getElementById('btnTreeRotateCW')?.addEventListener('click', () => {
      this.rotateSelectedNode(90);
    });

    document.getElementById('btnTreeRotateCCW')?.addEventListener('click', () => {
      this.rotateSelectedNode(-90);
    });

    // Auto-deteção de orientação individual
    document.getElementById('btnAutoDetect')?.addEventListener('click', async () => {
      await this.autoDetectCurrentNodeOrientation();
    });

    // Aplicar sugestão de orientação
    document.getElementById('btnApplyOrientationSuggestion')?.addEventListener('click', () => {
      if (this.lastOrientationSuggestion) {
        this.rotateSelectedNode(this.lastOrientationSuggestion.suggestedRotation);
        document.getElementById('orientationSuggestionContainer').style.display = 'none';
      }
    });

    // Auto-deteção em lote para todas as páginas da coleção
    document.getElementById('btnAutoDetectAll')?.addEventListener('click', async () => {
      await this.autoDetectAllOrientations();
    });

    document.getElementById('btnCalcHash')?.addEventListener('click', async () => {
      const currentNode = this.treeManager.getSelectedNode();
      if (currentNode && currentNode.fileRef?.file) {
        document.getElementById('fileMetaHash').value = 'A calcular MD5...';
        const hash = await this.fileSystem.calculateMD5(currentNode.fileRef.file);
        document.getElementById('fileMetaHash').value = hash || 'Erro no cálculo';
      }
    });
  }

  rotateSelectedNode(deltaDegrees) {
    if (this.isMatrixViewActive) {
      this.rotateSelectedMatrixNodes(deltaDegrees);
      return;
    }

    const node = this.treeManager.getSelectedNode();
    if (!node) return;

    const currentRotation = node.metadata?.rotation || 0;
    const newRotation = (currentRotation + deltaDegrees + 360) % 360;

    node.metadata = {
      ...node.metadata,
      rotation: newRotation
    };

    const badge = document.getElementById('rotationAngleBadge');
    if (badge) badge.textContent = `Rotação: ${newRotation}°`;
    const elRot = document.getElementById('fileMetaRotation');
    if (elRot) elRot.value = newRotation !== 0 ? `${newRotation}° (Rodado)` : '0° (Original)';

    this.applyImageTransforms();
    this.updateThumbnailRotation(node.id, newRotation);
    this.updateTreeRotations();
    this.updateXmlPreview();
  }

  async handleEphemeraImport(file) {
    document.getElementById('statusMessage').textContent = `A importar ${file.name} com identificadores...`;
    try {
      const res = await this.ephemeraImporter.importFile(file);
      document.getElementById('statusMessage').textContent = `Importado "${res.title}": ${res.totalPages} nós criados (${res.imageCount} imagens alinhadas).`;
      document.getElementById('statusFolder').textContent = `Ficheiro: ${file.name}`;
      
      const pageNodes = this.treeManager.root.children.filter(c => c.fileRef);
      if (pageNodes.length > 0) {
        this.renderThumbnails(pageNodes.map(p => p.fileRef));
      }
    } catch (err) {
      console.error('Erro na importação Ephemera:', err);
      alert(`Falha ao importar ${file.name}: ${err.message}`);
      document.getElementById('statusMessage').textContent = `Erro na importação de ${file.name}`;
    }
  }

  closeModal() {
    const modal = document.getElementById('modalAddNode');
    if (modal) modal.style.display = 'none';
  }

  closeSaveModal() {
    const modal = document.getElementById('modalSaveOptions');
    if (modal) modal.style.display = 'none';
  }

  updateMatrixOptionsVisibility() {
    const group = document.getElementById('matrixOptionsGroup');
    if (!group) return;
    const htmlEnabled = document.getElementById('genHtmlCheck')?.checked;
    const pdfEnabled = document.getElementById('genPdfCheck')?.checked;
    group.style.display = (htmlEnabled || pdfEnabled) ? 'block' : 'none';
  }

  closeOpenObjectModal() {
    const modal = document.getElementById('modalOpenObject');
    if (modal) modal.style.display = 'none';
  }

  confirmReplaceCurrentObject() {
    const root = this.treeManager.root;
    const hasContent = root && root.children && root.children.length > 0;
    if (!hasContent) return true;
    return confirm('Já existe um objeto aberto com conteúdo. Abrir um novo objeto irá substituir o trabalho atual não guardado. Deseja continuar?');
  }

  resetViewStateForNewObject() {
    this.fileUrlCache = new WeakMap();
    this.selectedMatrixNodeIds.clear();
    this.matrixSuggestionsMap.clear();
    this.isMatrixViewActive = false;
    this.updateViewerToolbarUI();
  }

  loadImportedRoot(root) {
    this.treeManager.loadTree(root);
    this.resetViewStateForNewObject();

    const pageNodes = [];
    this.collectPagesRecursive(root, pageNodes);
    this.renderThumbnails(true);
    if (pageNodes.length > 0) {
      this.treeManager.selectNode(pageNodes[0].id);
    }
  }

  /**
   * Ponto de entrada único do botão "Abrir Objeto" para ficheiros:
   * deteta automaticamente se é um ficheiro Ephemera (.xlsx/.numbers) ou um .zip
   * (obra previamente gerada ou apenas imagens)
   */
  async handleOpenObjectFile(file) {
    const lower = file.name.toLowerCase();

    if (lower.endsWith('.xlsx') || lower.endsWith('.numbers')) {
      if (!this.confirmReplaceCurrentObject()) return;
      document.getElementById('statusMessage').textContent = `A abrir ficheiro Ephemera "${file.name}" (.xlsx/.numbers)...`;
      await this.handleEphemeraImport(file);
      this.resetViewStateForNewObject();
      return;
    }

    if (lower.endsWith('.zip')) {
      if (!this.confirmReplaceCurrentObject()) return;
      document.getElementById('statusMessage').textContent = `A analisar conteúdo do ZIP "${file.name}"...`;
      try {
        const result = await ObjectOpener.openZipFile(file);
        this.loadImportedRoot(result.root);
        document.getElementById('statusMessage').textContent = ObjectOpener.describeResult(result, `ZIP "${file.name}"`);
        document.getElementById('statusFolder').textContent = `Ficheiro: ${file.name}`;
      } catch (err) {
        console.error('Erro ao abrir ZIP:', err);
        alert(`Falha ao abrir o ficheiro: ${err.message}`);
        document.getElementById('statusMessage').textContent = 'Erro ao abrir objeto.';
      }
      return;
    }

    alert('Formato não suportado. Selecione um ficheiro .zip, .xlsx ou .numbers.');
  }

  /**
   * Ponto de entrada único do botão "Abrir Objeto" para pastas (File System Access API):
   * deteta automaticamente se a pasta contém uma obra previamente gerada ou apenas imagens
   */
  async handleOpenObjectDirectoryHandle(handle) {
    if (!this.confirmReplaceCurrentObject()) return;
    document.getElementById('statusMessage').textContent = `A analisar pasta "${handle.name}"...`;
    try {
      const result = await ObjectOpener.openDirectoryHandle(handle);
      this.loadImportedRoot(result.root);
      document.getElementById('statusMessage').textContent = ObjectOpener.describeResult(result, `pasta "${handle.name}"`);
      document.getElementById('statusFolder').textContent = `Pasta: ${handle.name}`;
    } catch (err) {
      console.error('Erro ao abrir pasta:', err);
      alert(`Falha ao abrir a pasta: ${err.message}`);
      document.getElementById('statusMessage').textContent = 'Erro ao abrir objeto.';
    }
  }

  /**
   * Fallback do botão "Abrir Objeto" para pastas em navegadores sem File System Access API
   */
  async handleOpenObjectFileList(fileList) {
    if (!this.confirmReplaceCurrentObject()) return;
    const folderLabel = fileList[0]?.webkitRelativePath?.split('/')[0] || 'Pasta Selecionada';
    document.getElementById('statusMessage').textContent = `A analisar pasta "${folderLabel}"...`;
    try {
      const result = await ObjectOpener.openFolderFileList(fileList, folderLabel);
      this.loadImportedRoot(result.root);
      document.getElementById('statusMessage').textContent = ObjectOpener.describeResult(result, `pasta "${folderLabel}"`);
      document.getElementById('statusFolder').textContent = `Pasta: ${folderLabel}`;
    } catch (err) {
      console.error('Erro ao abrir pasta:', err);
      alert(`Falha ao abrir a pasta: ${err.message}`);
      document.getElementById('statusMessage').textContent = 'Erro ao abrir objeto.';
    }
  }

  async handleDroppedData(dataTransfer) {
    document.getElementById('statusMessage').textContent = 'A processar elementos arrastados...';
    const files = [];

    const readEntry = async (entry, path = '') => {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((file) => {
            files.push({
              name: file.name,
              relPath: path ? `${path}/${file.name}` : file.name,
              file: file,
              size: file.size,
              type: file.type || this.fileSystem.inferMimeType(file.name)
            });
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise((resolve) => {
          dirReader.readEntries((results) => resolve(results));
        });
        for (const childEntry of entries) {
          await readEntry(childEntry, path ? `${path}/${entry.name}` : entry.name);
        }
      }
    };

    if (dataTransfer.items && dataTransfer.items.length > 0) {
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            await readEntry(entry);
          } else {
            const file = item.getAsFile();
            if (file) {
              files.push({
                name: file.name,
                relPath: file.name,
                file: file,
                size: file.size,
                type: file.type || this.fileSystem.inferMimeType(file.name)
              });
            }
          }
        }
      }
    } else if (dataTransfer.files && dataTransfer.files.length > 0) {
      for (const file of dataTransfer.files) {
        files.push({
          name: file.name,
          relPath: file.name,
          file: file,
          size: file.size,
          type: file.type || this.fileSystem.inferMimeType(file.name)
        });
      }
    }

    if (files.length === 0) return;

    // Verificar se existe alguma folha de cálculo (.xlsx ou .numbers)
    const spreadsheet = files.find(f => f.name.endsWith('.xlsx') || f.name.endsWith('.numbers'));
    if (spreadsheet) {
      await this.handleEphemeraImport(spreadsheet.file);
      return;
    }

    // Filtrar ficheiros de imagem
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      this.treeManager.addFilesAsPages(this.treeManager.root.id, imageFiles);
      document.getElementById('statusMessage').textContent = `${imageFiles.length} imagens importadas com sucesso!`;
      document.getElementById('statusFolder').textContent = `${imageFiles.length} imagens arrastadas`;
      this.renderThumbnails(imageFiles);

      const pageNodes = this.treeManager.root.children.filter(c => c.fileRef);
      if (pageNodes.length > 0) {
        this.treeManager.selectNode(pageNodes[0].id);
      }
    } else {
      alert('Nenhum ficheiro de imagem ou tabela suportada encontrada.');
      document.getElementById('statusMessage').textContent = 'Pronto';
    }
  }

  renderTree() {
    const container = document.getElementById('treeContainer');
    if (!container) return;

    container.innerHTML = '';
    if (!this.treeManager.root) {
      container.innerHTML = '<div style="padding:1rem; color:var(--text-muted);">Sem nó raiz</div>';
      return;
    }

    const count = this.countNodes(this.treeManager.root);
    document.getElementById('nodeCountBadge').textContent = `${count} nós`;

    const treeHtml = this.renderNodeRecursive(this.treeManager.root);
    container.appendChild(treeHtml);

    if (window.lucide) window.lucide.createIcons();
  }

  countNodes(node) {
    let c = 1;
    if (node.children) {
      node.children.forEach(child => c += this.countNodes(child));
    }
    return c;
  }

  toggleNodeExpanded(nodeId) {
    const node = this.treeManager.findNode(this.treeManager.root, nodeId);
    if (!node) return;
    node.expanded = !node.expanded;
    this.renderTree();
  }

  renderNodeRecursive(node) {
    const typeDef = this.schemaManager.getNodeType(node.type);
    const isSelected = node.id === this.treeManager.selectedNodeId;
    const rotation = node.metadata?.rotation || 0;
    const hasChildren = !!(node.children && node.children.length > 0);

    const divNode = document.createElement('div');
    divNode.className = 'tree-node';

    const divContent = document.createElement('div');
    divContent.className = `tree-node-content ${isSelected ? 'selected' : ''}`;
    divContent.onclick = (e) => {
      e.stopPropagation();
      this.isMatrixViewActive = false;
      this.treeManager.selectNode(node.id);
    };

    const rotationBadge = rotation !== 0 ? `<span class="tree-node-badge" style="background:#7c3aed; color:white;">🔄 ${rotation}°</span>` : '';

    const toggleHtml = hasChildren
      ? `<span class="tree-node-toggle" title="${node.expanded ? 'Colapsar' : 'Expandir'}"><i data-lucide="${node.expanded ? 'chevron-down' : 'chevron-right'}"></i></span>`
      : `<span class="tree-node-toggle-spacer"></span>`;

    divContent.innerHTML = `
      ${toggleHtml}
      <span class="tree-node-icon"><i data-lucide="${typeDef.icon || 'file'}"></i></span>
      <span class="tree-node-label">${node.label}</span>
      ${rotationBadge}
      <span class="tree-node-badge">${typeDef.namePt}</span>
    `;

    if (hasChildren) {
      divContent.querySelector('.tree-node-toggle').onclick = (e) => {
        e.stopPropagation();
        this.toggleNodeExpanded(node.id);
      };
    }

    divNode.appendChild(divContent);

    if (hasChildren && node.expanded) {
      const divChildren = document.createElement('div');
      divChildren.className = 'tree-children';
      node.children.forEach(child => {
        divChildren.appendChild(this.renderNodeRecursive(child));
      });
      divNode.appendChild(divChildren);
    }

    return divNode;
  }

  renderMatrixGridInCanvas() {
    const canvas = document.getElementById('viewerCanvas');
    const titleSpan = document.getElementById('viewerTitle');

    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);

    titleSpan.textContent = `Visão Geral em Matriz (${pageNodes.length} páginas)`;

    const refPx = parseInt(document.getElementById('matrixMaxWidthInput')?.value, 10) || 220;
    const selectedCount = this.selectedMatrixNodeIds.size;
    const suggestionsCount = this.matrixSuggestionsMap.size;

    let gridHtml = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column;">
        <!-- Toolbar Superior da Matriz -->
        <div class="matrix-toolbar">
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="btn btn-sm" onclick="window.app.selectAllMatrixNodes()">
              <i data-lucide="check-square" style="width:14px; height:14px;"></i>
              <span>Selecionar Tudo</span>
            </button>
            <button class="btn btn-sm" onclick="window.app.deselectAllMatrixNodes()">
              <i data-lucide="square" style="width:14px; height:14px;"></i>
              <span>Desmarcar Tudo</span>
            </button>
            <span id="matrixSelectionCountBadge" class="tree-node-badge" style="background:var(--accent-indigo); color:white; font-weight:600; padding:0.25rem 0.5rem;">
              ${selectedCount} de ${pageNodes.length} selecionadas
            </span>
          </div>

          <div style="display:flex; gap:0.5rem; align-items:center;">
            <button class="btn btn-sm" onclick="window.app.rotateSelectedMatrixNodes(-90)" title="Rodar Imagens Selecionadas 90° para a Esquerda">
              <i data-lucide="rotate-ccw" style="width:14px; height:14px;"></i>
              <span>Rodar 90° ↺</span>
            </button>
            <button class="btn btn-sm" onclick="window.app.rotateSelectedMatrixNodes(90)" title="Rodar Imagens Selecionadas 90° para a Direita">
              <i data-lucide="rotate-cw" style="width:14px; height:14px;"></i>
              <span>Rodar 90° ↻</span>
            </button>
            <button class="btn btn-sm" onclick="window.app.autoOrientSelectedMatrixNodes()" style="background:var(--bg-hover); border:1px solid var(--accent-indigo);" title="Analisar Sugestões de Orientação">
              <i data-lucide="wand-2" style="width:14px; height:14px; color:var(--accent-indigo);"></i>
              <span>Analisar Orientação</span>
            </button>
            <span id="matrixSuggestionsBtnContainer">
            ${suggestionsCount > 0 ? `
              <button class="btn btn-sm" onclick="window.app.applyMatrixSuggestions()" style="background:#7c3aed; color:white; font-weight:600; box-shadow:0 0 10px rgba(124,58,237,0.5);" title="Aplicar Rotações Sugeridas às Imagens Selecionadas">
                <i data-lucide="sparkles" style="width:14px; height:14px;"></i>
                <span>Aplicar Sugestões (${suggestionsCount})</span>
              </button>
            ` : ''}
            </span>
          </div>
        </div>

        <!-- Grelha de Cartões -->
        <div id="matrixGridScrollContainer" style="flex:1; overflow-y:auto; padding:1.5rem;">
          <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(${refPx}px, 1fr)); gap: 1rem;">
    `;

    pageNodes.forEach((p, idx) => {
      const url = p.fileRef?.file ? this.getFileUrl(p.fileRef.file) : '';
      const rot = p.metadata?.rotation || 0;
      const isSelected = this.selectedMatrixNodeIds.has(p.id);
      const sug = this.matrixSuggestionsMap.get(p.id);

      gridHtml += `
        <div class="matrix-card ${isSelected ? 'selected' : ''}" 
             id="matrix-card-${p.id}"
             data-node-id="${p.id}"
             onclick="window.app.handleMatrixCardClick('${p.id}', event, ${idx})">
          <div class="matrix-checkbox-wrapper">
            <input type="checkbox" class="matrix-checkbox" id="matrix-check-${p.id}" ${isSelected ? 'checked' : ''} 
                   onclick="event.stopPropagation(); window.app.handleMatrixCardClick('${p.id}', event, ${idx})">
          </div>
          <div style="height:160px; display:flex; align-items:center; justify-content:center; background:#000; border-radius:6px; overflow:hidden; margin-top:0.2rem; position:relative;">
            ${url ? `<img id="matrix-img-${p.id}" src="${url}" style="max-width:100%; max-height:100%; object-fit:contain; transform:rotate(${rot}deg);" alt="${p.label}">` : '<span style="color:var(--text-dim)">Sem Ficheiro</span>'}
          </div>
          <div style="margin-top:0.5rem; font-size:0.8rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:var(--text-main);">
            <span>${p.label}</span> <span id="matrix-rot-badge-${p.id}" style="font-size:0.7rem; color:#c084fc;">${rot !== 0 ? `(🔄 ${rot}°)` : ''}</span>
          </div>
          <div id="matrix-sug-badge-${p.id}" style="min-height:22px;">
            ${sug ? `
              <div style="margin-top:0.3rem; font-size:0.7rem; color:#c084fc; background:rgba(124,58,237,0.2); border:1px solid #7c3aed; border-radius:10px; padding:0.15rem 0.4rem; display:inline-flex; align-items:center; gap:0.2rem; justify-content:center;">
                <i data-lucide="sparkles" style="width:12px; height:12px;"></i> Sugestão: ${sug.suggestedRotation}°
              </div>
            ` : ''}
          </div>
          <div class="matrix-card-actions" onclick="event.stopPropagation();">
            <button class="matrix-btn-action" title="Rodar Imagem 90° para a Esquerda" onclick="window.app.rotateSingleMatrixNode('${p.id}', -90, event)">
              <i data-lucide="rotate-ccw" style="width:12px; height:12px;"></i>
              <span>↺ 90°</span>
            </button>
            <button class="matrix-btn-action" title="Rodar Imagem 90° para a Direita" onclick="window.app.rotateSingleMatrixNode('${p.id}', 90, event)">
              <i data-lucide="rotate-cw" style="width:12px; height:12px;"></i>
              <span>↻ 90°</span>
            </button>
            <button class="matrix-btn-action" title="Ver no Leitor Individual" onclick="window.app.openSingleNodeInViewer('${p.id}', event)">
              <i data-lucide="eye" style="width:12px; height:12px;"></i>
              <span>Ver</span>
            </button>
          </div>
        </div>
      `;
    });

    gridHtml += `</div></div></div>`;
    canvas.innerHTML = gridHtml;

    if (window.lucide) window.lucide.createIcons();
  }

  updateMatrixToolbarCounters(totalCount = null) {
    if (!this.isMatrixViewActive) return;
    if (totalCount === null) {
      const pageNodes = [];
      this.collectPagesRecursive(this.treeManager.root, pageNodes);
      totalCount = pageNodes.length;
    }
    const badge = document.getElementById('matrixSelectionCountBadge');
    if (badge) {
      badge.textContent = `${this.selectedMatrixNodeIds.size} de ${totalCount} selecionadas`;
    }
    const sugContainer = document.getElementById('matrixSuggestionsBtnContainer');
    if (sugContainer) {
      const suggestionsCount = this.matrixSuggestionsMap.size;
      if (suggestionsCount > 0) {
        sugContainer.innerHTML = `
          <button class="btn btn-sm" onclick="window.app.applyMatrixSuggestions()" style="background:#7c3aed; color:white; font-weight:600; box-shadow:0 0 10px rgba(124,58,237,0.5);" title="Aplicar Rotações Sugeridas às Imagens Selecionadas">
            <i data-lucide="sparkles" style="width:14px; height:14px;"></i>
            <span>Aplicar Sugestões (${suggestionsCount})</span>
          </button>
        `;
        if (window.lucide) window.lucide.createIcons();
      } else {
        sugContainer.innerHTML = '';
      }
    }
  }

  updateMatrixCardRotation(nodeId, newRotation) {
    const img = document.getElementById(`matrix-img-${nodeId}`);
    if (img) {
      img.style.transform = `rotate(${newRotation}deg)`;
    }
    const rotBadge = document.getElementById(`matrix-rot-badge-${nodeId}`);
    if (rotBadge) {
      rotBadge.textContent = newRotation !== 0 ? `(🔄 ${newRotation}°)` : '';
    }
  }

  updateMatrixCardSuggestion(nodeId, suggestion) {
    const container = document.getElementById(`matrix-sug-badge-${nodeId}`);
    if (container) {
      if (suggestion) {
        container.innerHTML = `
          <div style="margin-top:0.3rem; font-size:0.7rem; color:#c084fc; background:rgba(124,58,237,0.2); border:1px solid #7c3aed; border-radius:10px; padding:0.15rem 0.4rem; display:inline-flex; align-items:center; gap:0.2rem; justify-content:center;">
            <i data-lucide="sparkles" style="width:12px; height:12px;"></i> Sugestão: ${suggestion.suggestedRotation}°
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
      } else {
        container.innerHTML = '';
      }
    }
  }

  updateTreeRotations() {
    this.renderTree();
  }

  updateThumbnailRotation(nodeId, newRotation) {
    const thumbImg = document.getElementById(`thumb-img-${nodeId}`);
    if (thumbImg) {
      thumbImg.style.transform = `rotate(${newRotation}deg)`;
    }
  }

  handleMatrixCardClick(nodeId, event, index) {
    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);

    const previouslySelected = new Set(this.selectedMatrixNodeIds);

    if (event.shiftKey && this.lastMatrixClickedIndex !== null) {
      const start = Math.min(this.lastMatrixClickedIndex, index);
      const end = Math.max(this.lastMatrixClickedIndex, index);

      for (let i = start; i <= end; i++) {
        if (pageNodes[i]) {
          this.selectedMatrixNodeIds.add(pageNodes[i].id);
        }
      }
    } else {
      if (this.selectedMatrixNodeIds.has(nodeId)) {
        this.selectedMatrixNodeIds.delete(nodeId);
      } else {
        this.selectedMatrixNodeIds.add(nodeId);
      }
    }

    this.lastMatrixClickedIndex = index;

    // Fast in-place DOM updates on affected cards
    const allAffected = new Set([...previouslySelected, ...this.selectedMatrixNodeIds]);
    allAffected.forEach(id => {
      const isSel = this.selectedMatrixNodeIds.has(id);
      const card = document.getElementById(`matrix-card-${id}`);
      if (card) {
        card.classList.toggle('selected', isSel);
        const chk = document.getElementById(`matrix-check-${id}`);
        if (chk) chk.checked = isSel;
      }
    });

    this.updateMatrixToolbarCounters(pageNodes.length);
  }

  selectAllMatrixNodes() {
    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);
    pageNodes.forEach(p => {
      this.selectedMatrixNodeIds.add(p.id);
      const card = document.getElementById(`matrix-card-${p.id}`);
      if (card) {
        card.classList.add('selected');
        const chk = document.getElementById(`matrix-check-${p.id}`);
        if (chk) chk.checked = true;
      }
    });
    this.updateMatrixToolbarCounters(pageNodes.length);
  }

  deselectAllMatrixNodes() {
    this.selectedMatrixNodeIds.forEach(id => {
      const card = document.getElementById(`matrix-card-${id}`);
      if (card) {
        card.classList.remove('selected');
        const chk = document.getElementById(`matrix-check-${id}`);
        if (chk) chk.checked = false;
      }
    });
    this.selectedMatrixNodeIds.clear();
    this.matrixSuggestionsMap.clear();
    this.lastMatrixClickedIndex = null;

    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);
    pageNodes.forEach(p => this.updateMatrixCardSuggestion(p.id, null));
    this.updateMatrixToolbarCounters(pageNodes.length);
  }

  rotateSelectedMatrixNodes(deltaDegrees) {
    const targetIds = Array.from(this.selectedMatrixNodeIds);

    if (targetIds.length === 0) {
      const selected = this.treeManager.getSelectedNode();
      if (selected) {
        this.rotateSingleMatrixNode(selected.id, deltaDegrees);
        return;
      }
      alert('Selecione pelo menos uma imagem na matriz ou árvore para rodar.');
      return;
    }

    targetIds.forEach(id => {
      const node = this.treeManager.findNode(this.treeManager.root, id);
      if (node) {
        const currentRotation = node.metadata?.rotation || 0;
        const newRotation = (currentRotation + deltaDegrees + 360) % 360;
        node.metadata = {
          ...node.metadata,
          rotation: newRotation
        };
        this.updateMatrixCardRotation(id, newRotation);
        this.updateThumbnailRotation(id, newRotation);
      }
    });

    this.updateTreeRotations();
    this.updateXmlPreview();

    const selected = this.treeManager.getSelectedNode();
    if (selected && targetIds.includes(selected.id)) {
      const badge = document.getElementById('rotationAngleBadge');
      if (badge) badge.textContent = `Rotação: ${selected.metadata?.rotation || 0}°`;
      const elRot = document.getElementById('fileMetaRotation');
      if (elRot) elRot.value = (selected.metadata?.rotation || 0) !== 0 ? `${selected.metadata?.rotation}° (Rodado)` : '0° (Original)';
    }

    const statusMsg = document.getElementById('statusMessage');
    if (statusMsg) statusMsg.textContent = `${targetIds.length} imagens rodadas com sucesso!`;
  }

  rotateSingleMatrixNode(nodeId, deltaDegrees, event) {
    if (event) event.stopPropagation();

    const node = this.treeManager.findNode(this.treeManager.root, nodeId);
    if (!node) return;

    const currentRotation = node.metadata?.rotation || 0;
    const newRotation = (currentRotation + deltaDegrees + 360) % 360;

    node.metadata = {
      ...node.metadata,
      rotation: newRotation
    };

    this.updateMatrixCardRotation(nodeId, newRotation);
    this.updateThumbnailRotation(nodeId, newRotation);
    this.updateTreeRotations();
    this.updateXmlPreview();

    const selected = this.treeManager.getSelectedNode();
    if (selected && selected.id === nodeId) {
      const badge = document.getElementById('rotationAngleBadge');
      if (badge) badge.textContent = `Rotação: ${newRotation}°`;
      const elRot = document.getElementById('fileMetaRotation');
      if (elRot) elRot.value = newRotation !== 0 ? `${newRotation}° (Rodado)` : '0° (Original)';
      this.applyImageTransforms();
    }

    const statusMsg = document.getElementById('statusMessage');
    if (statusMsg) statusMsg.textContent = `Imagem "${node.label}" rodada para ${newRotation}°.`;
  }

  openSingleNodeInViewer(nodeId, event) {
    if (event) event.stopPropagation();
    this.isMatrixViewActive = false;
    this.updateViewerToolbarUI();
    this.treeManager.selectNode(nodeId);
    const node = this.treeManager.getSelectedNode();
    if (node && node.fileRef) {
      this.displayImageInViewer(node.fileRef, node.metadata?.rotation || 0);
    }
  }

  updateViewerToolbarUI() {
    const indControls = document.getElementById('individualViewerControls');
    const sugContainer = document.getElementById('orientationSuggestionContainer');

    if (indControls) indControls.style.display = 'flex';
    if (this.isMatrixViewActive) {
      if (sugContainer) sugContainer.style.display = 'none';
    }
  }

  async autoOrientSelectedMatrixNodes() {
    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);

    const targets = pageNodes.filter(p => this.selectedMatrixNodeIds.has(p.id));
    const listToProcess = targets.length > 0 ? targets : pageNodes;

    document.getElementById('statusMessage').textContent = `A analisar orientação de ${listToProcess.length} imagens na matriz...`;
    
    this.matrixSuggestionsMap.clear();

    for (const p of listToProcess) {
      if (!p.fileRef?.file) continue;
      const res = await OrientationDetector.detect(p.fileRef.file);
      const currentRot = p.metadata?.rotation || 0;

      if (res.suggestedRotation !== currentRot && res.confidence >= 65) {
        this.matrixSuggestionsMap.set(p.id, res);
        this.selectedMatrixNodeIds.add(p.id);
        this.updateMatrixCardSuggestion(p.id, res);
        const card = document.getElementById(`matrix-card-${p.id}`);
        if (card) {
          card.classList.add('selected');
          const chk = document.getElementById(`matrix-check-${p.id}`);
          if (chk) chk.checked = true;
        }
      } else {
        this.updateMatrixCardSuggestion(p.id, null);
      }
    }

    this.updateMatrixToolbarCounters(pageNodes.length);

    if (this.matrixSuggestionsMap.size > 0) {
      document.getElementById('statusMessage').textContent = `Análise concluída: ${this.matrixSuggestionsMap.size} sugestões sinalizadas. Clique em "Aplicar Sugestões" para efetuar alterações.`;
      alert(`💡 Sugestões de Orientação Encontradas!\n\nForam identificadas ${this.matrixSuggestionsMap.size} imagens com sugestões de rotação.\n\nAs miniaturas foram selecionadas e assinaladas com um badge na matriz.\n\nClique no botão "Aplicar Sugestões (${this.matrixSuggestionsMap.size})" na barra da Matriz se desejar efetuar a alteração.`);
    } else {
      document.getElementById('statusMessage').textContent = 'Todas as imagens analisadas parecem estar na orientação recomendada.';
      alert('ℹ️ Nenhuma alteração sugerida:\n\nTodas as imagens selecionadas na matriz já se encontram na orientação recomendada.');
    }
  }

  applyMatrixSuggestions() {
    const targetIds = Array.from(this.selectedMatrixNodeIds);
    let countApplied = 0;

    targetIds.forEach(id => {
      const sug = this.matrixSuggestionsMap.get(id);
      if (sug) {
        const node = this.treeManager.findNode(this.treeManager.root, id);
        if (node) {
          node.metadata = {
            ...node.metadata,
            rotation: sug.suggestedRotation
          };
          countApplied++;
          this.matrixSuggestionsMap.delete(id);
          this.updateMatrixCardRotation(id, sug.suggestedRotation);
          this.updateMatrixCardSuggestion(id, null);
          this.updateThumbnailRotation(id, sug.suggestedRotation);
        }
      }
    });

    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);
    this.updateMatrixToolbarCounters(pageNodes.length);
    this.updateTreeRotations();
    this.updateXmlPreview();

    if (countApplied > 0) {
      document.getElementById('statusMessage').textContent = `Sugestões aplicadas a ${countApplied} imagens com sucesso!`;
      alert(`✨ Sucesso!\n\nForam aplicadas as rotações sugeridas a ${countApplied} imagens.`);
    } else {
      alert('Selecione os cartões que possuem a etiqueta de sugestão para aplicar a rotação.');
    }
  }

  collectPagesRecursive(node, list) {
    if (node.fileRef || node.type === 'PAGE') list.push(node);
    if (node.children) node.children.forEach(c => this.collectPagesRecursive(c, list));
  }

  selectNodeFromMatrix(nodeId) {
    this.isMatrixViewActive = false;
    this.treeManager.selectNode(nodeId);
  }

  renderSelectedNodeMetadata() {
    const node = this.treeManager.getSelectedNode();
    if (!node) return;

    document.getElementById('nodeTypeSelect').value = node.type;
    document.getElementById('metaTitle').value = node.metadata?.title || node.label || '';
    document.getElementById('metaCreator').value = node.metadata?.creator || '';
    document.getElementById('metaDate').value = node.metadata?.date || '';
    document.getElementById('metaLanguage').value = node.metadata?.language || 'por';
    document.getElementById('metaNotes').value = node.metadata?.notes || '';
    document.getElementById('metaRights').value = node.metadata?.rights || '';

    const rotation = node.metadata?.rotation || 0;
    document.getElementById('rotationAngleBadge').textContent = `Rotação: ${rotation}°`;

    const rotationText = rotation !== 0 ? `${rotation}° (Rodado)` : '0° (Original)';
    const elRotation = document.getElementById('fileMetaRotation');
    if (elRotation) elRotation.value = rotationText;

    if (node.fileRef) {
      const f = node.fileRef;
      document.getElementById('fileMetaName').value = f.name;
      document.getElementById('fileMetaSize').value = `${(f.size / 1024).toFixed(1)} KB`;
      document.getElementById('fileMetaMime').value = f.type;
      
      if (!this.isMatrixViewActive) {
        this.displayImageInViewer(f, rotation);
      }
    } else {
      document.getElementById('fileMetaName').value = 'Nenhum';
      document.getElementById('fileMetaSize').value = '-';
      document.getElementById('fileMetaMime').value = '-';
      document.getElementById('fileMetaDimensions').value = '-';
      if (elRotation) elRotation.value = '0° (Padrão)';
    }
  }

  saveMetadataFromForm() {
    const node = this.treeManager.getSelectedNode();
    if (!node) return;

    const newType = document.getElementById('nodeTypeSelect').value;
    const newTitle = document.getElementById('metaTitle').value;

    node.type = newType;
    node.label = newTitle;
    node.metadata = {
      ...node.metadata,
      title: newTitle,
      creator: document.getElementById('metaCreator').value,
      date: document.getElementById('metaDate').value,
      language: document.getElementById('metaLanguage').value,
      notes: document.getElementById('metaNotes').value,
      rights: document.getElementById('metaRights').value
    };

    if (this.isMatrixViewActive) {
      const cardLabelSpan = document.querySelector(`#matrix-label-${node.id} > span`);
      if (cardLabelSpan) cardLabelSpan.textContent = newTitle;
    }

    this.treeManager.notify();
  }

  async displayImageInViewer(fileObj, rotationAngle = 0) {
    const canvas = document.getElementById('viewerCanvas');
    const titleSpan = document.getElementById('viewerTitle');

    if (!fileObj || !fileObj.file) return;

    titleSpan.textContent = `${fileObj.name} (${(fileObj.size / 1024).toFixed(1)} KB)`;

    const imgMeta = await this.fileSystem.getImageMetadata(fileObj.file);
    const dimEl = document.getElementById('fileMetaDimensions');
    if (dimEl) dimEl.value = `${imgMeta.width} x ${imgMeta.height} px`;

    const url = this.getFileUrl(fileObj.file);
    canvas.innerHTML = `<img id="viewerImg" class="viewer-image" src="${url}" alt="${fileObj.name}">`;
    this.zoomLevel = 1.0;
    this.applyImageTransforms(rotationAngle);

    // Ocultar sugestão anterior e acionar verificação em background
    const sugContainer = document.getElementById('orientationSuggestionContainer');
    if (sugContainer) sugContainer.style.display = 'none';

    const img = document.getElementById('viewerImg');
    if (img) {
      if (img.complete) {
        this.checkAndSuggestOrientation(fileObj, img);
      } else {
        img.onload = () => this.checkAndSuggestOrientation(fileObj, img);
      }
    }
  }

  applyImageTransforms(rotationDeg = null) {
    const node = this.treeManager.getSelectedNode();
    const rotation = rotationDeg !== null ? rotationDeg : (node?.metadata?.rotation || 0);

    const img = document.getElementById('viewerImg');
    if (img) {
      img.style.transform = `scale(${this.zoomLevel}) rotate(${rotation}deg)`;
    }
  }

  renderThumbnails(forceRebuild = false) {
    const ribbon = document.getElementById('thumbRibbon');
    if (!ribbon) return;

    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);

    const selectedNode = this.treeManager.getSelectedNode();
    const existingThumbs = ribbon.querySelectorAll('.thumb-item');

    // In-place update if thumbs already rendered and count matches
    if (!forceRebuild && existingThumbs.length === pageNodes.length && existingThumbs.length > 0) {
      pageNodes.forEach((node, idx) => {
        const thumb = existingThumbs[idx];
        if (!thumb) return;
        const isSelected = selectedNode && selectedNode.id === node.id;
        thumb.classList.toggle('active', isSelected);
        const rot = node.metadata?.rotation || 0;
        const img = thumb.querySelector('img');
        if (img) {
          img.id = `thumb-img-${node.id}`;
          img.style.transform = `rotate(${rot}deg)`;
        }
      });
      return;
    }

    ribbon.innerHTML = '';
    pageNodes.forEach((node, idx) => {
      if (!node.fileRef?.file) return;

      const url = this.getFileUrl(node.fileRef.file);
      const isSelected = selectedNode && selectedNode.id === node.id;
      const rot = node.metadata?.rotation || 0;

      const thumb = document.createElement('div');
      thumb.className = `thumb-item ${isSelected ? 'active' : ''}`;
      thumb.innerHTML = `
        <img id="thumb-img-${node.id}" src="${url}" style="transform: rotate(${rot}deg);" alt="${node.label}">
        <span class="thumb-label">${idx + 1}</span>
      `;
      thumb.onclick = () => {
        this.isMatrixViewActive = false;
        this.treeManager.selectNode(node.id);
      };
      ribbon.appendChild(thumb);
    });
  }

  async checkAndSuggestOrientation(fileObj, imgElement = null) {
    const node = this.treeManager.getSelectedNode();
    if (!node) return;

    const res = await OrientationDetector.detect(fileObj.file, imgElement);
    const currentRot = node.metadata?.rotation || 0;

    if (res.suggestedRotation !== currentRot && res.confidence >= 65) {
      this.lastOrientationSuggestion = res;
      const container = document.getElementById('orientationSuggestionContainer');
      const textSpan = document.getElementById('orientationSuggestionText');
      if (container && textSpan) {
        textSpan.textContent = `Sugestão: Rodar ${res.suggestedRotation}° (${res.message})`;
        container.style.display = 'inline-flex';
      }
    }
  }

  async autoDetectCurrentNodeOrientation() {
    const node = this.treeManager.getSelectedNode();
    if (!node || !node.fileRef?.file) {
      alert('Por favor selecione uma página com imagem no visualizador.');
      return;
    }

    document.getElementById('statusMessage').textContent = 'A analisar orientação da imagem...';
    const img = document.getElementById('viewerImg');
    const res = await OrientationDetector.detect(node.fileRef.file, img);

    const currentRot = node.metadata?.rotation || 0;
    if (res.suggestedRotation === currentRot) {
      document.getElementById('statusMessage').textContent = `Imagem já na orientação recomendada (${currentRot}°). [${res.method}]`;
      alert(`ℹ️ Análise de Orientação:\n\nA imagem "${node.fileRef.name}" já se encontra na orientação recomendada (${currentRot}°).\n\n• Método: ${res.method}\n• Diagnóstico: ${res.message}\n• Confiança: ${res.confidence}%`);
    } else {
      this.lastOrientationSuggestion = res;
      const container = document.getElementById('orientationSuggestionContainer');
      const textSpan = document.getElementById('orientationSuggestionText');
      if (container && textSpan) {
        textSpan.textContent = `Sugestão: Rodar ${res.suggestedRotation}° (${res.message})`;
        container.style.display = 'inline-flex';
      }
      document.getElementById('statusMessage').textContent = `Sugestão encontrada: Rodar ${res.suggestedRotation}° (${res.message})`;
      alert(`💡 Sugestão de Orientação Encontrada!\n\nRecomendação: Rodar ${res.suggestedRotation}°.\n\n• Diagnóstico: ${res.message}\n• Confiança: ${res.confidence}%\n\nClique no botão "Aplicar" na barra do visualizador se desejar efetuar a alteração.`);
    }
  }

  async autoDetectAllOrientations() {
    const pageNodes = [];
    this.collectPagesRecursive(this.treeManager.root, pageNodes);

    if (pageNodes.length === 0) {
      alert('Nenhuma página com ficheiro de imagem encontrada.');
      return;
    }

    document.getElementById('statusMessage').textContent = `A analisar orientação de ${pageNodes.length} páginas...`;
    let countAdjusted = 0;

    for (const node of pageNodes) {
      if (!node.fileRef?.file) continue;
      const res = await OrientationDetector.detect(node.fileRef.file);

      const currentRot = node.metadata?.rotation || 0;
      if (res.suggestedRotation !== currentRot && res.confidence >= 70) {
        node.metadata = {
          ...node.metadata,
          rotation: res.suggestedRotation
        };
        countAdjusted++;
      }
    }

    if (countAdjusted > 0) {
      this.treeManager.notify();
      document.getElementById('statusMessage').textContent = `Orientação automática concluída: ${countAdjusted} páginas ajustadas.`;
    } else {
      document.getElementById('statusMessage').textContent = 'Análise em lote concluída: Todas as páginas parecem estar na orientação correta.';
    }
  }

  updateXmlPreview() {
    const preview = document.getElementById('xmlPreview');
    if (preview) {
      const xml = MetsExporter.exportMetsXml(this.treeManager.root);
      preview.textContent = xml;
    }
  }

}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
