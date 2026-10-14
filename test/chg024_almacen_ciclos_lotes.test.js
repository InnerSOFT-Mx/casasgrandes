const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { normalizeMovementItems, aggregateProductLotsStock } = require('../utils/almacen');

test('TDD-TC-107: normalizeMovementItems extrae y normaliza el campo manual ciclo/ciclo_agricola', () => {
  // 1. Multi-item payload con ciclo manual
  const multiItemBody = {
    tipo: 'Salida',
    items: [
      { producto_id: 1, lote: 'LOT-A', cantidad: 50, precio_venta: 100, ciclo: '  O-I 2026  ' },
      { producto_id: 2, lote: 'LOT-B', cantidad: 20, precio_venta: 200, ciclo_agricola: 'P-V 2026' },
      { producto_id: 3, lote: 'LOT-C', cantidad: 10, precio_venta: 300, ciclo: '' }
    ]
  };

  const normalized = normalizeMovementItems(multiItemBody);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].ciclo_agricola, 'O-I 2026');
  assert.equal(normalized[1].ciclo_agricola, 'P-V 2026');
  assert.equal(normalized[2].ciclo_agricola, null);

  // 2. Formato legado con 1 solo producto en raíz
  const legacyBody = {
    tipo: 'Salida',
    producto_id: 5,
    lote: 'LOT-LEGACY',
    cantidad: 15,
    ciclo: 'Ciclo Especial 2026'
  };

  const legacyNormalized = normalizeMovementItems(legacyBody);
  assert.equal(legacyNormalized.length, 1);
  assert.equal(legacyNormalized[0].ciclo_agricola, 'Ciclo Especial 2026');
});

test('TDD-TC-108: aggregateProductLotsStock desglosa existencias por lotes activos para cada producto', () => {
  const products = [
    { id: 1, producto: 'Hipopótamo', tipo_categoria: 'Semilla', activo: 1 },
    { id: 2, producto: 'A-7573 PONCHO', tipo_categoria: 'Híbrido', activo: 1 },
    { id: 3, producto: 'A-7573 ACCELERON', tipo_categoria: 'Híbrido', activo: 1 }
  ];

  const movements = [
    // Hipopótamo: Lote X (100 - 10 = 90), Lote Y (20 - 0 = 20), Lote Z (50 - 10 = 40), Lote Agotado (15 - 15 = 0)
    { producto_id: 1, lote: 'Lote X', tamano: 'PT1', cantidad_entrante: 100, cantidad_saliente: 10 },
    { producto_id: 1, lote: 'Lote Y', tamano: 'PT2', cantidad_entrante: 20, cantidad_saliente: 0 },
    { producto_id: 1, lote: 'Lote Z', tamano: 'PT1', cantidad_entrante: 50, cantidad_saliente: 10 },
    { producto_id: 1, lote: 'Lote Agotado', tamano: 'PT1', cantidad_entrante: 15, cantidad_saliente: 15 },

    // A-7573 PONCHO: Lote P1 (312 - 0 = 312)
    { producto_id: 2, lote: 'Lote P1', tamano: 'BT1', cantidad_entrante: 312, cantidad_saliente: 0 }

    // A-7573 ACCELERON: Sin movimientos (stock 0)
  ];

  const result = aggregateProductLotsStock(products, movements);
  assert.equal(result.length, 3);

  // Hipopótamo
  const hipo = result.find(p => p.id === 1);
  assert.ok(hipo);
  assert.equal(hipo.existencias, 150);
  assert.equal(hipo.lotes.length, 3);
  assert.equal(hipo.lotes[0].lote, 'Lote X');
  assert.equal(hipo.lotes[0].stock, 90);
  assert.equal(hipo.lotes[1].lote, 'Lote Y');
  assert.equal(hipo.lotes[1].stock, 20);
  assert.equal(hipo.lotes[2].lote, 'Lote Z');
  assert.equal(hipo.lotes[2].stock, 40);

  // A-7573 PONCHO
  const poncho = result.find(p => p.id === 2);
  assert.ok(poncho);
  assert.equal(poncho.existencias, 312);
  assert.equal(poncho.lotes.length, 1);
  assert.equal(poncho.lotes[0].lote, 'Lote P1');
  assert.equal(poncho.lotes[0].stock, 312);

  // A-7573 ACCELERON (sin stock)
  const accel = result.find(p => p.id === 3);
  assert.ok(accel);
  assert.equal(accel.existencias, 0);
  assert.equal(accel.lotes.length, 0);
});

test('TDD-TC-109: exportKardexToCSV y frontend incorporan Ciclo y fila de desglose de lotes', () => {
  const appJsPath = path.join(__dirname, '..', 'public', 'js', 'app.js');
  const appJsContent = fs.readFileSync(appJsPath, 'utf8');

  // 1. Debe incluir input manual .move-item-ciclo en las partidas
  assert.match(appJsContent, /move-item-ciclo/, 'app.js debe contener la clase move-item-ciclo');

  // 2. exportKardexToCSV debe contener la columna Ciclo en su cabecera y en los datos
  assert.match(appJsContent, /Ciclo/, 'exportKardexToCSV debe incluir la columna Ciclo');
  assert.match(appJsContent, /ciclo_agricola/, 'exportKardexToCSV debe mapear ciclo_agricola');

  // 3. Renderizado de desglose de lotes en la tabla de inventario
  assert.match(appJsContent, /lot-breakdown-row|lotes-breakdown/, 'app.js debe renderizar el desglose de lotes');
});
