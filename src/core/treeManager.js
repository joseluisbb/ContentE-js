/**
 * ContentE Web — Document Tree State Manager
 * Gere o estado hierárquico dos documentos, capítulos, páginas e associação de ficheiros
 */

export class TreeManager {
  constructor(schemaManager) {
    this.schemaManager = schemaManager;
    this.root = null;
    this.selectedNodeId = null;
    this.listeners = [];
  }

  /**
   * Inicializa uma nova árvore com um nó raiz (ex: BOOK ou FONDS)
   */
  createRoot(typeId = 'BOOK', title = 'Novo Documento Digital') {
    const typeDef = this.schemaManager.getNodeType(typeId);
    this.root = {
      id: 'node_' + Date.now(),
      type: typeId,
      label: title,
      metadata: {
        title: title,
        creator: '',
        date: new Date().getFullYear().toString(),
        language: 'por',
        rights: 'Domínio Público / Protegido',
        description: ''
      },
      fileRef: null,
      children: [],
      expanded: true
    };
    this.selectedNodeId = this.root.id;
    this.notify();
    return this.root;
  }

  /**
   * Adiciona um nó filho ao nó pai selecionado
   */
  addChild(parentId, typeId, label = '') {
    const parentNode = this.findNode(this.root, parentId);
    if (!parentNode) return null;

    const typeDef = this.schemaManager.getNodeType(typeId);
    const childId = 'node_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    
    const newNode = {
      id: childId,
      type: typeId,
      label: label || `${typeDef.namePt} ${parentNode.children.length + 1}`,
      metadata: {
        title: label || `${typeDef.namePt} ${parentNode.children.length + 1}`
      },
      fileRef: null,
      children: [],
      expanded: true
    };

    parentNode.children.push(newNode);
    parentNode.expanded = true;
    this.selectedNodeId = childId;
    this.notify();
    return newNode;
  }

  /**
   * Assegura que ficheiros importados criam nós de página automaticamente
   */
  addFilesAsPages(parentId, fileList) {
    const parentNode = this.findNode(this.root, parentId);
    if (!parentNode) return;

    // Ordenação alfanumérica natural por nome do ficheiro (ex: img1, img2, img10)
    fileList.sort((a, b) => (a.name || a.label || '').localeCompare(b.name || b.label || '', undefined, { numeric: true, sensitivity: 'base' }));

    fileList.forEach((fileObj, idx) => {
      const childId = 'node_' + Date.now() + '_' + idx;
      const label = fileObj.name.replace(/\.[^/.]+$/, '');
      
      parentNode.children.push({
        id: childId,
        type: 'PAGE',
        label: label,
        metadata: {
          title: label,
          filename: fileObj.name,
          mimeType: fileObj.type,
          size: fileObj.size
        },
        fileRef: fileObj,
        children: [],
        expanded: false
      });
    });

    // Ordenar os filhos do nó pai de forma consistente
    parentNode.children.sort((a, b) => (a.label || a.metadata?.filename || '').localeCompare(b.label || b.metadata?.filename || '', undefined, { numeric: true, sensitivity: 'base' }));

    this.notify();
  }

  removeNode(nodeId) {
    if (this.root && this.root.id === nodeId) {
      this.root = null;
      this.selectedNodeId = null;
      this.notify();
      return true;
    }
    
    const parent = this.findParentNode(this.root, nodeId);
    if (parent) {
      parent.children = parent.children.filter(child => child.id !== nodeId);
      if (this.selectedNodeId === nodeId) {
        this.selectedNodeId = parent.id;
      }
      this.notify();
      return true;
    }
    return false;
  }

  moveNodeUp(nodeId) {
    const parent = this.findParentNode(this.root, nodeId);
    if (!parent) return;
    const idx = parent.children.findIndex(c => c.id === nodeId);
    if (idx > 0) {
      const temp = parent.children[idx];
      parent.children[idx] = parent.children[idx - 1];
      parent.children[idx - 1] = temp;
      this.notify();
    }
  }

  moveNodeDown(nodeId) {
    const parent = this.findParentNode(this.root, nodeId);
    if (!parent) return;
    const idx = parent.children.findIndex(c => c.id === nodeId);
    if (idx >= 0 && idx < parent.children.length - 1) {
      const temp = parent.children[idx];
      parent.children[idx] = parent.children[idx + 1];
      parent.children[idx + 1] = temp;
      this.notify();
    }
  }

  updateNodeMetadata(nodeId, newMetadata) {
    const node = this.findNode(this.root, nodeId);
    if (node) {
      node.metadata = { ...node.metadata, ...newMetadata };
      if (newMetadata.title) {
        node.label = newMetadata.title;
      }
      this.notify();
    }
  }

  findNode(current, id) {
    if (!current) return null;
    if (current.id === id) return current;
    for (const child of current.children) {
      const found = this.findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  findParentNode(current, childId) {
    if (!current) return null;
    for (const child of current.children) {
      if (child.id === childId) return current;
      const found = this.findParentNode(child, childId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Substitui a árvore atual por uma árvore reconstruída (ex: a partir de um Objeto HTML já criado)
   */
  loadTree(rootNode, selectedNodeId = null) {
    this.root = rootNode;
    this.selectedNodeId = selectedNodeId || rootNode?.id || null;
    this.notify();
  }

  getSelectedNode() {
    return this.findNode(this.root, this.selectedNodeId);
  }

  selectNode(id) {
    this.selectedNodeId = id;
    this.notify();
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.root));
  }
}
