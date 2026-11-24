import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COTAFACIL_NO_AUTOSTART = '1';

const { extractPackQuantityFromDesc, parseQuotationTextLocally } = await import(
  '../dist-server/server.mjs'
);

test('extractPackQuantityFromDesc handles PT/CX/DZ/RL and C6 notation', () => {
  assert.equal(extractPackQuantityFromDesc('ABRACADEIRA TIPO U FERA 1 C/100', 'PT', 1), 100);
  assert.equal(extractPackQuantityFromDesc('AEROFLEX TINTA SPRAY UG 400 BCO BRILH C6', 'PT', 1), 6);
  assert.equal(extractPackQuantityFromDesc('CORTAG DISCO CORTE INOX 41/2 C/25', 'CX', 30), 25);
  assert.equal(extractPackQuantityFromDesc('SODA CAUSTICA PURIATICO 250G C/12', 'DZ', 1), 12);
  assert.equal(extractPackQuantityFromDesc('FORTLEV MANGUEIRA CORRUGADA 3/4 AMA C50M', 'RL', 6), 1);
  assert.equal(extractPackQuantityFromDesc('NITROLUX LAMPADA LED BULBO 20W T60', 'UN', 30), 1);
  assert.equal(extractPackQuantityFromDesc('1 10929 ABRACADEIRA TIPO U FERA 1 C/100 PT 1', '', 1), 100);
});

test('parseQuotationTextLocally extracts unitPrice accurately in ION Sistemas ($) visual order', () => {
  const sample = `
Processado por ION Sistemas - www.ionsistemas.com.br
Filial: 1 - J.F. COMERCIO DE MATERIAIS DE CONSTRUCAO
# IMAGEM COD. DESCRIÇÃO UNID. COD. BARRAS QTDE. PREÇO UN. PREÇO
1 10929 ABRACADEIRA TIPO U FERA 1 C/100 PT 7898962539033 1 $46.30
$46.30
99 60380 AEROFLEX TINTA SPRAY UG 400 BCO BRILH C6 PT 17898907527351 1 $82.68
$82.68
41 65608 CORTAG DISCO CORTE INOX 41/2 C/25 CX 17897451418252 30 $45.96
$1,378.80
56 65598 CORTAG ESPAC NIVELADOR SLIM 1,5MM C/100 PT 7897451415353 12 $9.97
$119.64
97 31525 FORTLEV TE SOLD 20MM C/50 PT 17898543590382 50 $31.00
$1,550.00
82 20997 FORTLEV MANGUEIRA CORRUGADA 3/4 AMA C50M RL 7898911729997 6 $74.50
$447.00
94 62150 SODA CAUSTICA PURIATICO 250G C/12 DZ 2548162594145 1 $83.73
$83.73
71 64401 NITROLUX LAMPADA LED BULBO 20W T60 UN 7896688231088 30 $10.90
$327.00
Total 131 $4,035.15
`;

  const parsed = parseQuotationTextLocally(sample);
  assert.equal(parsed.isVerifiedStructured, true);
  assert.equal(parsed.items.length, 8);

  const byName = Object.fromEntries(parsed.items.map((it) => [it.productName, it]));
  assert.equal(byName['ABRACADEIRA TIPO U FERA 1 C/100'].unitPrice, 0.46);
  assert.equal(byName['ABRACADEIRA TIPO U FERA 1 C/100'].brand, 'FERA');
  assert.equal(byName['AEROFLEX TINTA SPRAY UG 400 BCO BRILH C6'].unitPrice, 13.78);
  assert.equal(byName['AEROFLEX TINTA SPRAY UG 400 BCO BRILH C6'].brand, 'AEROFLEX');
  assert.equal(byName['CORTAG DISCO CORTE INOX 41/2 C/25'].unitPrice, 1.84);
  assert.equal(byName['CORTAG ESPAC NIVELADOR SLIM 1,5MM C/100'].unitPrice, 9.97);
  assert.equal(byName['FORTLEV TE SOLD 20MM C/50'].unitPrice, 0.62);
  assert.equal(byName['FORTLEV MANGUEIRA CORRUGADA 3/4 AMA C50M'].unitPrice, 74.5);
  assert.equal(byName['SODA CAUSTICA PURIATICO 250G C/12'].unitPrice, 6.98);
  assert.equal(byName['NITROLUX LAMPADA LED BULBO 20W T60'].unitPrice, 10.9);
  assert.equal(byName['NITROLUX LAMPADA LED BULBO 20W T60'].brand, 'NITROLUX');
});

test('parseQuotationTextLocally extracts unitPrice accurately in ION Sistemas ($) stream order', () => {
  const sample = `
Processado por ION Sistemas - www.ionsistemas.com.br
1 10929 ABRACADEIRA TIPO U FERA 1 C/100 PT 1 $46.30\t7898962539033
$46.30
97 31525 FORTLEV TE SOLD 20MM C/50 PT 50 $31.00\t17898543590382
$1,550.00
Total 51 $1,596.30
`;

  const parsed = parseQuotationTextLocally(sample);
  assert.equal(parsed.isVerifiedStructured, true);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].unitPrice, 0.46);
  assert.equal(parsed.items[1].unitPrice, 0.62);
});

test('parseQuotationTextLocally extracts ION Sistemas ($) rows even without header footer', () => {
  const sample = `
1 10929 ABRACADEIRA TIPO U FERA 1 C/100 PT 1 $46.30\t7898962539033 $46.30
2 31477 FORTLEV ADAPTADOR LR CURTO 20X1/2 C/50 PT 1 $29.40\t17898543591402 $29.40
`;

  const parsed = parseQuotationTextLocally(sample);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].unit, 'PT');
  assert.equal(parsed.items[0].packQuantity, 100);
  assert.equal(parsed.items[0].unitPrice, 0.46);
  assert.equal(parsed.items[1].unit, 'PT');
  assert.equal(parsed.items[1].packQuantity, 50);
  assert.equal(parsed.items[1].unitPrice, 0.59);
});
