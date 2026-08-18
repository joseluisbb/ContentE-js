/**
 * ContentE Web — METS & Dublin Core XML Exporter
 * Gera os ficheiros XML estandardizados METS v1.8 e Dublin Core em conformidade com repositórios digitais (BNP)
 */

export class MetsExporter {
  static exportMetsXml(treeRoot) {
    if (!treeRoot) return '';

    const now = new Date().toISOString();
    const docTitle = treeRoot.metadata?.title || 'Objeto Digital';
    const creator = treeRoot.metadata?.creator || 'Autor Desconhecido';
    const date = treeRoot.metadata?.date || '';
    const rights = treeRoot.metadata?.rights || 'Direitos Reservados';

    // Lista plana de ficheiros associados para a fileSec
    const files = [];
    MetsExporter.collectFiles(treeRoot, files);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mets xmlns="http://www.loc.gov/METS/" 
      xmlns:dc="http://purl.org/dc/elements/1.1/" 
      xmlns:xlink="http://www.w3.org/1999/xlink" 
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
      OBJID="${treeRoot.id}" 
      TYPE="text" 
      xsi:schemaLocation="http://www.loc.gov/METS/ http://www.loc.gov/standards/mets/mets.xsd">

  <metsHdr CREATEDATE="${now}" LASTMODDATE="${now}" RECORDSTATUS="COMPLETE">
    <agent ROLE="CREATOR" TYPE="INDIVIDUAL">
      <name>${creator}</name>
    </agent>
    <agent ROLE="ARCHIVIST" TYPE="ORGANIZATION">
      <name>ContentE Web App</name>
    </agent>
  </metsHdr>

  <dmdSec ID="DMD_1">
    <mdWrap MDTYPE="DC">
      <xmlData>
        <dc:title>${MetsExporter.escapeXml(docTitle)}</dc:title>
        <dc:creator>${MetsExporter.escapeXml(creator)}</dc:creator>
        <dc:date>${MetsExporter.escapeXml(date)}</dc:date>
        <dc:rights>${MetsExporter.escapeXml(rights)}</dc:rights>
        <dc:language>${treeRoot.metadata?.language || 'por'}</dc:language>
        <dc:format>image/tiff</dc:format>
      </xmlData>
    </mdWrap>
  </dmdSec>

  <fileSec>
    <fileGrp USE="archive">
${files.map((f, i) => `      <file ID="FILE_${i + 1}" MIMETYPE="${f.metadata?.mimeType || 'image/jpeg'}" SIZE="${f.metadata?.size || 0}" ROTATION="${f.metadata?.rotation || 0}">
        <FLocat LOCTYPE="URL" xlink:href="${MetsExporter.escapeXml(f.metadata?.filename || f.label)}"/>
      </file>`).join('\n')}
    </fileGrp>
  </fileSec>

  <structMap TYPE="LOGICAL">
${MetsExporter.renderStructDiv(treeRoot, '    ', files)}
  </structMap>

</mets>`;

    return xml;
  }

  static collectFiles(node, filesList) {
    if (node.fileRef || node.metadata?.filename) {
      filesList.push(node);
    }
    if (node.children) {
      node.children.forEach(c => MetsExporter.collectFiles(c, filesList));
    }
  }

  static renderStructDiv(node, indent, filesList) {
    const type = node.type || 'PAGE';
    const label = MetsExporter.escapeXml(node.label || '');
    
    // Procura se este nó está associado a um ficheiro
    const fileIdx = filesList.findIndex(f => f.id === node.id);
    const fptr = fileIdx >= 0 ? `\n${indent}  <fptr FILEID="FILE_${fileIdx + 1}"/>` : '';

    if (!node.children || node.children.length === 0) {
      return `${indent}<div TYPE="${type}" LABEL="${label}"${fptr}/>`;
    }

    const childrenXml = node.children
      .map(c => MetsExporter.renderStructDiv(c, indent + '  ', filesList))
      .join('\n');

    return `${indent}<div TYPE="${type}" LABEL="${label}" DMDID="DMD_1">${fptr}
${childrenXml}
${indent}</div>`;
  }

  static escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
