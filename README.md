# ContentE Web (ContentE-js)

**ContentE Web** é uma aplicação moderna em JavaScript / Web para edição de metadados estruturais, organização de coleções digitais e exportação documental (METS XML e Pacotes Web Autónomos).

---

## 🚀 Funcionalidades Principais

- 🌳 **Árvore Estrutural Flexível**: Criação e gestão hierárquica de nós documentais (Álbum, Coleção, Capítulo, Secção, Página, etc.).
- 🖼️ **Visualização em Matriz / Grelha (Visão Geral)**:
  - Navegação e rotação interativa de miniaturas a 60fps sem recarregar a janela (*in-place updates*).
  - Seleção individual, múltipla (Shift+Clique) ou em lote de páginas.
  - Rotações instantâneas (↺ 90° / ↻ 90°) com animação fluida.
- 🪄 **Deteção Inteligente de Orientação**:
  - Algoritmo de análise de orientação de imagens com deteção de horizonte e sugestões automáticas de rotação.
  - Aplicação de rotações sugeridas em lote.
- 📊 **Importador Ephemera**: Suporte direto para importação de folhas de cálculo `.xlsx` e `.numbers` com extração e alinhamento de identificadores de páginas.
- 📦 **Exportações Avançadas**:
  - **METS XML**: Geração de esquemas normalizados METS com metadados Dublin Core e referências de ficheiros.
  - **Objeto HTML Autónomo (.ZIP)**: Pacote web auto-contido com visualizador interativo e página de entrada em matriz configurável.

---

## 💻 Como Executar Localmente

### Opção 1: Quick Start (Windows)
Basta fazer duplo clique em `start.bat` ou executar no terminal PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\server.ps1
```
A aplicação será aberta automaticamente em `http://localhost:8080/`.

### Opção 2: Qualquer Servidor HTTP Local
Como a aplicação utiliza módulos ES nativos (`type="module"`), pode ser servida por qualquer servidor HTTP estático (ex: `npx serve`, `python -m http.server`, ou Live Server).

---

## 📁 Estrutura do Projeto

```
├── index.html               # Ponto de entrada e interface principal
├── server.ps1               # Servidor HTTP local leve em PowerShell
├── start.bat                # Inicializador rápido
├── src/
│   ├── app.js               # Controlador principal e eventos da UI
│   ├── core/
│   │   ├── ephemeraImporter.js     # Importador XLSX e Numbers
│   │   ├── fileSystem.js           # Gestão de ficheiros e cálculo de hashes
│   │   ├── htmlExporter.js         # Gerador de pacotes Web/HTML autónomos
│   │   ├── metsExporter.js         # Exportador METS XML
│   │   ├── orientationDetector.js  # Análise e deteção de orientação de imagens
│   │   ├── schemaManager.js        # Definições de tipos e esquemas documentais
│   │   └── treeManager.js          # Gestão do estado da árvore documental
│   └── styles/
│       └── main.css         # Estilos da aplicação e componentes
├── _ephemera/                # (local, não versionado) Dados de exemplo para testar a app
│   ├── ephemera-originais/         # Folhas .xlsx / .numbers de origem
│   └── ephemera_objects_output/    # Objetos HTML exportados a partir delas
└── .gitignore
```

> `_ephemera/` é uma pasta apenas local: contém ficheiros de exemplo (alguns excedem o limite de 100MB do GitHub) usados para testar a importação Ephemera e as exportações. É ignorada pelo `.gitignore`.
