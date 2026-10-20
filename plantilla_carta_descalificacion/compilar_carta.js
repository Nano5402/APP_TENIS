const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseDir = __dirname;
const rootDir = path.resolve(baseDir, '..');
const jsonPath = path.join(baseDir, 'datos_carta.json');
const htmlVertTemplatePath = path.join(baseDir, 'PLANTILLA_CARTA_DESCALIFICACION.html');
const htmlHorizTemplatePath = path.join(baseDir, 'PLANTILLA_CARTA_DESCALIFICACION_HORIZONTAL.html');

if (!fs.existsSync(jsonPath)) {
  console.error('No se encontró el archivo datos_carta.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function injectData(html, isHoriz = false) {
  let res = html;

  // Inyección de expediente
  if (data.expediente && data.expediente.trim()) {
    const expVal = data.expediente.trim().replace(/^DESC-2026-?/i, '');
    res = res.replace(/DESC-2026-________/, `DESC-2026-<span style="color:#0f172a; text-decoration: underline; font-weight:800;">${expVal}</span>`);
  }

  // Inyección de fecha
  if (data.dia || data.mes || data.anio) {
    const diaStr = data.dia ? `<strong style="color:#0f172a;">${data.dia}</strong>` : '_______';
    const mesStr = data.mes ? `<strong style="color:#0f172a; text-transform: capitalize;">${data.mes}</strong>` : '_____________________';
    const anioStr = data.anio ? `<strong style="color:#0f172a;">${data.anio}</strong>` : '2026';
    const fechaPattern = /_______ de _____________________ de 2026/;
    res = res.replace(fechaPattern, `${diaStr} de ${mesStr} de ${anioStr}`);
  }

  if (!isHoriz) {
    // VERTICAL: Deportista 1
    if (data.deportista1 && data.deportista1.nombre && data.deportista1.nombre.trim()) {
      const d1NombreHtml = `<div style="font-weight: 800; color: #064e3b; margin-top: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px;">${data.deportista1.nombre.trim()}</div>`;
      res = res.replace(/(<div style="color: #64748b; font-size: 9.5px; text-transform: uppercase; font-weight: 700;">Deportista Titular 1:<\/div>\s*)<div style="font-weight: 700; color: #0f172a; margin-top: 2px;">_______________________________<\/div>/, `$1${d1NombreHtml}`);
    }
    if (data.deportista1 && data.deportista1.cc && data.deportista1.cc.trim()) {
      res = res.replace(/(C\.C\. N°: <span style="font-weight: 600; color: #0f172a;">)_________________________<\/span>/, `$1<strong style="color:#064e3b; font-size:10.5px;">${data.deportista1.cc.trim()}</strong></span>`);
    }

    // VERTICAL: Deportista 2
    if (data.deportista2 && data.deportista2.nombre && data.deportista2.nombre.trim()) {
      const d2NombreHtml = `<div style="font-weight: 800; color: #064e3b; margin-top: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px;">${data.deportista2.nombre.trim()}</div>`;
      res = res.replace(/(<div style="color: #64748b; font-size: 9.5px; text-transform: uppercase; font-weight: 700;">Deportista Titular 2:<\/div>\s*)<div style="font-weight: 700; color: #0f172a; margin-top: 2px;">_______________________________<\/div>/, `$1${d2NombreHtml}`);
    }
    if (data.deportista2 && data.deportista2.cc && data.deportista2.cc.trim()) {
      res = res.replace(/(C\.C\. N°: <span style="font-weight: 600; color: #0f172a;">)_________________________<\/span>/, `$1<strong style="color:#064e3b; font-size:10.5px;">${data.deportista2.cc.trim()}</strong></span>`);
    }

    // VERTICAL: Categorías
    if (data.categoriaFormalizada && data.categoriaFormalizada.trim()) {
      res = res.replace(/(Categoría Formalizada:<\/div>\s*)<div style="font-weight: 800; color: #0f172a; font-size: 10px;">___________________<\/div>/, `$1<div style="font-weight: 800; color: #0f172a; font-size: 10.5px; text-transform: uppercase;">${data.categoriaFormalizada.trim()}</div>`);
    }
    if (data.categoriaRealDictaminada && data.categoriaRealDictaminada.trim()) {
      res = res.replace(/(Categoría Real Dictaminada:<\/div>\s*)<div style="font-weight: 800; color: #064e3b; font-size: 10px;">___________________<\/div>/, `$1<div style="font-weight: 800; color: #991b1b; font-size: 10.5px; text-transform: uppercase;">${data.categoriaRealDictaminada.trim()}</div>`);
    }
  } else {
    // HORIZONTAL: Deportista 1
    if (data.deportista1 && data.deportista1.nombre && data.deportista1.nombre.trim()) {
      res = res.replace(/(DEPORTISTA 1:<\/span>\s*<span style="font-weight: 700; display: inline-block; width: 62%;">)_________________________<\/span>/, `$1<strong style="color:#064e3b; font-size:10.5px; text-transform:uppercase;">${data.deportista1.nombre.trim()}</strong></span>`);
    }
    if (data.deportista1 && data.deportista1.cc && data.deportista1.cc.trim()) {
      res = res.replace(/(C\.C\. N°: <span style="color: #0f172a;">)______________________<\/span>/, `$1<strong style="color:#064e3b;">${data.deportista1.cc.trim()}</strong></span>`);
    }

    // HORIZONTAL: Deportista 2
    if (data.deportista2 && data.deportista2.nombre && data.deportista2.nombre.trim()) {
      res = res.replace(/(DEPORTISTA 2:<\/span>\s*<span style="font-weight: 700; display: inline-block; width: 62%;">)_________________________<\/span>/, `$1<strong style="color:#064e3b; font-size:10.5px; text-transform:uppercase;">${data.deportista2.nombre.trim()}</strong></span>`);
    }
    if (data.deportista2 && data.deportista2.cc && data.deportista2.cc.trim()) {
      res = res.replace(/(C\.C\. N°: <span style="color: #0f172a;">)______________________<\/span>/, `$1<strong style="color:#064e3b;">${data.deportista2.cc.trim()}</strong></span>`);
    }

    // HORIZONTAL: Categorías
    if (data.categoriaFormalizada && data.categoriaFormalizada.trim()) {
      res = res.replace(/(CATEGORÍA FORMALIZADA:<\/div>\s*<div style="font-size: 9\.5px; font-weight: 800;">)__________<\/div>/, `$1<span style="color:#0f172a; text-transform:uppercase;">${data.categoriaFormalizada.trim()}</span></div>`);
    }
    if (data.categoriaRealDictaminada && data.categoriaRealDictaminada.trim()) {
      res = res.replace(/(CATEGORÍA REAL:<\/div>\s*<div style="font-size: 9\.5px; font-weight: 800; color: #064e3b;">)__________<\/div>/, `$1<span style="color:#991b1b; text-transform:uppercase;">${data.categoriaRealDictaminada.trim()}</span></div>`);
    }
  }

  return res;
}

// Generar HTML Vertical
const htmlVert = injectData(fs.readFileSync(htmlVertTemplatePath, 'utf8'), false);
const outVertHtml = path.join(baseDir, 'CARTA_DESCALIFICACION_LLENADA_VERTICAL.html');
fs.writeFileSync(outVertHtml, htmlVert, 'utf8');

// Generar HTML Horizontal
const htmlHoriz = injectData(fs.readFileSync(htmlHorizTemplatePath, 'utf8'), true);
const outHorizHtml = path.join(baseDir, 'CARTA_DESCALIFICACION_LLENADA_HORIZONTAL.html');
fs.writeFileSync(outHorizHtml, htmlHoriz, 'utf8');

// Archivos de salida
const pdfVert = path.join(rootDir, 'CARTA_DESCALIFICACION_CORNEJO_ARIZA_VERTICAL.pdf');
const pngVert = path.join(rootDir, 'carta_descalificacion_cornejo_ariza_vertical.png');

const pdfHoriz = path.join(rootDir, 'CARTA_DESCALIFICACION_CORNEJO_ARIZA_HORIZONTAL.pdf');
const pngHoriz = path.join(rootDir, 'carta_descalificacion_cornejo_ariza_horizontal.png');

console.log('Compilando Carta Vertical (PDF y PNG)...');
spawnSync(edgePath, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfVert}`, `file:///${outVertHtml.replace(/\\/g, '/')}`]);
spawnSync(edgePath, ['--headless', '--disable-gpu', '--window-size=816,1056', '--hide-scrollbars', `--screenshot=${pngVert}`, `file:///${outVertHtml.replace(/\\/g, '/')}`]);

console.log('Compilando Carta Horizontal (PDF y PNG)...');
spawnSync(edgePath, ['--headless', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfHoriz}`, `file:///${outHorizHtml.replace(/\\/g, '/')}`]);
spawnSync(edgePath, ['--headless', '--disable-gpu', '--window-size=1056,816', '--hide-scrollbars', `--screenshot=${pngHoriz}`, `file:///${outHorizHtml.replace(/\\/g, '/')}`]);

// También guardar copia dentro de plantilla_carta_descalificacion
fs.copyFileSync(pdfVert, path.join(baseDir, 'CARTA_DESCALIFICACION_LLENADA.pdf'));
fs.copyFileSync(pngVert, path.join(baseDir, 'CARTA_DESCALIFICACION_LLENADA.png'));

console.log('✅ Documentos compilados exitosamente:');
console.log('   Vertical PDF:', pdfVert);
console.log('   Horizontal PDF:', pdfHoriz);
