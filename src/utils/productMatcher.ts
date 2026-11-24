export interface MatchCandidate {
  id: string;
  name: string;
  quantity?: number;
}

const BRAND_WORDS = new Set([
  'tigre',
  'fortlev',
  'amanco',
  'krona',
  'plastilit',
  'multilit',
  'vonder',
  'nove54',
  'tekbond',
  'brascola',
  'herc',
  'viqua',
  'cortag',
  'braslider',
  'starrett',
  'soprano',
  'tramontina',
  'maestro',
  'blukit',
  'roco',
  'daneva',
  'taschibra',
  'blumenau',
  'norton',
  'sata',
  'max',
  'thompson',
  'thompso',
  'condor',
  'luconi',
  'pluzie',
  'botafogo',
  'robusfer',
  'rejumassa',
  'quartzolit',
  'universo',
  'luztol',
  'mundialprime',
  'mundialprim',
  'decorlux',
  'ehc',
  'foxlux',
  'egaplast',
  'overtime',
  'garden',
  'unipega',
  'jomarca',
  'taf',
  'minasul',
  'parana',
  'cabos',
  'dismatal',
  'ovd',
  'mercante',
  'opcao',
  'bartofil',
  'evoluir',
  'inca',
  'qualitex',
  'qualite',
  'qualit',
  'firmex',
  'sika',
  'dryko',
  'juntapiso',
  'juntalider',
  'grap',
  'shiva',
  'roma',
  'pacetta',
  'paceta',
  'wertmax',
  'famastil',
  'irwin',
  'ranger',
  'tyrolit',
  'ilumi',
  'metasul',
  'granplast',
  'avan',
  'avant',
  'elgi',
  'elgin',
  'rajix',
  'glight',
  'vox',
  'acquaflex',
  'acqu',
  'sunflex',
  'gitel',
  'ibere',
  'compel',
  'seniors',
  'gerplast',
  'socel',
  'higi',
  'higib',
  'fortaleza',
  'lubfast',
  'unilub',
  'lekat',
  'montana',
  'eucatex',
  'viva',
  'natrielli',
  'puriatico',
  'esfera',
  'maestro',
  'colorgin',
  'colorg',
  'globo',
  'tecnotape',
  'novaflon',
  'force',
  'metalosa',
  'rebound',
  'reboucas',
  'metasil',
  'pulvitec',
  'polytubes',
  'durabem',
  'malinski',
  'cortag',
  'tek',
  'bond',
  'heavy',
  'duty',
  'b01',
  'b07',
  'nv',
  'he',
  'thompsom',
  'sopran',
  'tramontin',
  'fox',
  'paceta',
  'qualit',
  'qualite',
  'four',
  'fera',
  'adelbras',
  'aeroflex',
  'almata',
  'imperial',
  'una',
  'fertak',
  'gol',
  'vucan',
  'mantac',
  'melfi',
  'aguia',
  'nitrolux',
  'ourolux',
  'pratimix',
  'rca',
  'redimax',
  'univ',
  'decorl',
  'decor',
  'deco',
  'pluz',
  'inpl',
  'real',
  'nova',
  'form',
  'peg',
  'uze',
  'peguze',
  'levuze',
  'tr',
  'gard',
]);

const STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'p',
  'com',
  'c',
  'em',
  'e',
  'a',
  'o',
  'sn',
  'eco',
  'std',
  'standard',
  'plus',
  'tipo',
  'linha',
  'un',
  'pc',
  'pcs',
  'pt',
  'pct',
  'cx',
  'fd',
  'dz',
  'la',
  'bd',
  'gl',
  'peca',
  'pecas',
  'pacote',
  'embalagem',
  'display',
  'frasco',
  'bisnaga',
  'rolo',
  'saco',
  'barra',
  'lata',
  'balde',
  'graus',
  'grau',
  'cor',
  'br',
  'ud',
  'b',
  'd',
  'n2',
  'aaj',
  'crv',
  'nova',
  'novo',
  'uso',
  'geral',
  'ug',
  'pro',
  'aju',
  'ud',
  'suporte',
  'prateleira',
  'cerda',
  'grisalha',
  'cart',
  'cartela',
  'granel',
  'lz',
  'pbr',
  'standard',
  'precis',
  'eco',
]);

const PRIMARY_NOUNS = new Set([
  'te',
  'joelho',
  'curva',
  'luva',
  'cap',
  'adaptador',
  'registro',
  'plug',
  'tubo',
  'eletroduto',
  'caixa',
  'fita',
  'adesivo',
  'disco',
  'disjuntor',
  'torneira',
  'sifao',
  'valvula',
  'abracadeira',
  'desempenadeira',
  'trincha',
  'escada',
  'bico',
  'arame',
  'cimento',
  'assento',
  'chuveiro',
  'oleo',
  'lubrificante',
  'nivelador',
  'tomada',
  'interruptor',
  'lampada',
  'fechadura',
  'mecanismo',
  'barramento',
  'espacador',
  'placa',
  'corante',
  'spray',
  'colher',
  'mangueira',
  'broca',
  'lixa',
  'chave',
  'formao',
  'trena',
  'cavadeira',
  'carrinho',
  'painel',
  'soquete',
  'pino',
  'porca',
  'parafuso',
  'terminal',
  'verniz',
  'zarcao',
  'manta',
  'desentupidor',
  'cantoneira',
  'divisor',
  'ducha',
  'prolongador',
  'arco',
  'selante',
  'massa',
]);

const SYNONYM_MAP: Record<string, string> = {
  tee: 'te',
  esg: 'esgoto',
  sold: 'soldavel',
  soldaveis: 'soldavel',
  rosc: 'roscavel',
  rosca: 'roscavel',
  roscaveis: 'roscavel',
  rsc: 'roscavel',
  isol: 'isolante',
  adapt: 'adaptador',
  red: 'reducao',
  desemp: 'desempenadeira',
  desempenad: 'desempenadeira',
  cano: 'tubo',
  tubos: 'tubo',
  cotovelo: 'joelho',
  bch: 'bucha',
  lat: 'latao',
  dagua: 'agua',
  torn: 'torneira',
  reg: 'registro',
  esf: 'esfera',
  comp: 'compacto',
  corrug: 'corrugado',
  cx: 'caixa',
  adesi: 'adesivo',
  cola: 'adesivo',
  mec: 'mecanismo',
  mecan: 'mecanismo',
  acopl: 'acoplada',
  univers: 'universal',
  univ: 'universal',
  nivel: 'nivelador',
  porc: 'porcelanato',
  porcel: 'porcelanato',
  pisos: 'piso',
  porcas: 'porca',
  sext: 'sextavada',
  sex: 'sextavada',
  sextavada: 'sextavada',
  zin: 'zincada',
  zinc: 'zincada',
  abr: 'abracadeira',
  abrac: 'abracadeira',
  eng: 'engate',
  alum: 'aluminio',
  mad: 'madeira',
  enxada: 'enxada',
  electroduto: 'eletroduto',
  eletrod: 'eletroduto',
  eletr: 'eletroduto',
  diam: 'diamantado',
  diaman: 'diamantado',
  amar: 'amarelo',
  amarela: 'amarelo',
  branca: 'branco',
  bran: 'branco',
  branc: 'branco',
  preta: 'preto',
  pret: 'preto',
  pto: 'preto',
  vermelha: 'vermelho',
  verm: 'vermelho',
  vm: 'vermelho',
  cz: 'cinza',
  cza: 'cinza',
  az: 'azul',
  claro: 'claro',
  clar: 'claro',
  fosca: 'fosco',
  fosc: 'fosco',
  brilh: 'brilhante',
  bri: 'brilhante',
  brilho: 'brilhante',
  brilhante: 'brilhante',
  sanf: 'sanfonado',
  duplo: 'duplo',
  valv: 'valvula',
  sifao: 'sifao',
  fech: 'fechadura',
  prolong: 'prolongador',
  disj: 'disjuntor',
  disjunt: 'disjuntor',
  unip: 'unipolar',
  unipol: 'unipolar',
  uni: 'unipolar',
  ducha: 'ducha',
  hig: 'higienica',
  biv: 'bivolt',
  temper: 'temperatura',
  temp: 'temperatura',
  metalica: 'metalico',
  impermeabilizante: 'imp',
  manta: 'manta',
  liquida: 'liquido',
  liquido: 'liquido',
  liq: 'liquido',
  ext: 'externo',
  externa: 'externo',
  int: 'interna',
  interna: 'interna',
  ban: 'banheiro',
  banheiro: 'banheiro',
  ind: 'industrial',
  tom: 'tomada',
  empilha: 'empilhavel',
  mono: 'monofasico',
  monofasico: 'monofasico',
  espac: 'espacador',
  lamp: 'lampada',
  gelad: 'geladeira',
  micr: 'microondas',
  micro: 'microondas',
  pedr: 'pedreiro',
  mang: 'mangueira',
  jard: 'jardim',
  tranc: 'trancada',
  crist: 'cristal',
  transparente: 'cristal',
  carro: 'carrinho',
  cavad: 'cavadeira',
  art: 'articulada',
  cb: 'cabo',
  cab: 'cabo',
  inter: 'interruptor',
  simp: 'simples',
  paraf: 'parafuso',
  franc: 'frances',
  chuv: 'chuveiro',
  brac: 'braco',
  embal: 'embalagem',
  emb: 'embutir',
  redond: 'redondo',
  lav: 'lavatorio',
  lavat: 'lavatorio',
  esmal: 'esmalte',
  alav: 'alavanca',
  crom: 'cromado',
  cr: 'cromado',
  bic: 'bicromatizada',
  ferr: 'ferro',
  concre: 'concreto',
  conc: 'concreto',
  galv: 'galvanizado',
  canton: 'cantoneira',
  fris: 'frisada',
  estriada: 'frisada',
  corrugado: 'corrugado',
  reta: 'reto',
  vivo: 'reto',
  lga: 'longo',
  longa: 'longo',
  curta: 'curto',
  pta: 'preto',
  pluz: 'pluzie',
  desengripante: 'desengripante',
  anticorrosivo: 'desengripante',
  deg: 'degraus',
  alta: 'alta',
  alt: 'alta',
  pot: 'potencia',
  bocal: 'soquete',
  ved: 'veda',
  vedarosc: 'vedarosca',
  bc: 'branco',
  bco: 'branco',
  bi: 'bivolt',
  sx: 'sobrepor',
  sobreplus: 'sobrepor',
  tc: 'tecla',
  tec: 'tecla',
  spl: 'simples',
  simples: 'simples',
  dupla: 'duplo',
  lev: 'leve',
  ref: 'reforcada',
  est: 'ferro',
  cc: 'curvac',
  ca: 'curvaa',
};

const COLOR_TOKENS = new Set([
  'branco',
  'preto',
  'cinza',
  'bege',
  'azul',
  'amarelo',
  'vermelho',
  'verde',
  'laranja',
  'violeta',
  'ocre',
  'marrom',
  'conhaque',
  'cromado',
  'dourado',
  'grafite',
  'tabaco',
  'platina',
]);

function preNormalizeText(raw: string): string {
  let s = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Detach long brand names when glued to numbers/letters in PDF table wraps (e.g. "20X1/2FORTLEV", "50MBARTOFIL")
    .replace(
      /(fortlev|amanco|krona|tigre|plastilit|multilit|vonder|tramontina|brascola|tekbond|botafogo|thompson|thompsom|thompso|condor|pluzie|luconi|bartofil|qualitex)/g,
      ' $1 '
    )
    // Detach common glued ERP/SAP words before tokenization
    .replace(/\bsold(?=curto|curta|cx|bch)/g, 'sold ')
    .replace(/\b(soldavel|esgoto|roscavel|lisa|frisada|corrugado|stylus)(?=\d)/g, '$1 ')
    .replace(/(curto|curta|visita|caixa)(?=esg|sn|dn)/g, '$1 ')
    .replace(/\besg(?=com|sn|dn)/g, 'esg ')
    .replace(/\bsn(?=dn|\d)/g, 'sn ')
    .replace(/\b(90|45)(?=soldavel|esg)/g, '$1 ')
    .replace(/\bbch(?=latao)/g, 'bch ')
    .replace(/\beletroduto(?=corrug)/g, 'eletroduto ')
    .replace(/\bregistro(?=compacto|esf)/g, 'registro ')
    .replace(/\besf(?=sold|rosc)/g, 'esf ')
    .replace(/\bluz(?=empilha)/g, 'luz ')
    .replace(/\benvolvente(?=branc|beg|cz|cinz|pret)/g, 'envolvente ')
    .replace(/\bdn(?=\d)/g, 'dn ')
    .replace(/aaj(?=\d)/g, ' ')
    .replace(/\.?tx(?=\d+(?:kg|g|ml)\b)/g, ' ')
    .replace(/\b(\d+(?:[.,]\d+)?)(mm|cm|ml|kg|gr)(?=[a-z0-9])/g, '$1$2 ')
    .replace(/\bcx\s*(?:d['’]?\s*)?agua\b/g, 'caixa agua')
    .replace(/d['’]agua/g, 'agua')
    .replace(/\bveda[\s-]?ros(?:ca)?\b/g, 'vedarosca')
    .replace(/\bsikadurepoxi\b/g, 'epoxi')
    .replace(/\bdrykopox\b/g, 'epoxi')
    .replace(/\btecbond\s+mf(?:\s+cj)?\b/g, 'adesivo epoxi ferro concreto')
    .replace(/c\/\s*visita/g, 'com visita')
    .replace(/c\/\s*anel/g, 'com anel')
    .replace(/c\/\s*bucha/g, 'com bucha')
    .replace(/c\/\s*rosca/g, 'com rosca')
    .replace(/c\/\s*flange/g, 'com flange')
    .replace(/c\/\s*pincel/g, 'com pincel')
    .replace(/c\/\s*ved\b/g, ' ')
    .replace(/s\/\s*reg\b/g, 'sem registro')
    .replace(/(\d+)\s*[º°]/g, '$1deg')
    .replace(/\bl\/r(?=\d|\b)/g, 'soldavel rosca ')
    .replace(/\blr\b/g, 'soldavel rosca')
    .replace(/\bsds(?:\s*plus)?\b/g, ' sdsplus ')
    .replace(/\bm\.\s*franc(?:es|esa)?\b/g, 'mao francesa')
    .replace(/\bmao\s*franc(?:es|esa)?\b/g, 'mao francesa')
    .replace(/\bc\.\s*vivo\b|\bcanto\s*vivo\b/g, 'reto')
    .replace(/\buni\s+polar\b/g, 'unipolar')
    .replace(/\bc\/?\s*furo\b/g, 'com furo')
    .replace(/\bfuro\s*cent(?:\.|ral)?/g, ' com furo ')
    .replace(/\b(?:2x4|4x2)\b/g, '4x2')
    .replace(/\b2\s*tom(?:adas?)?\b/g, 'duplo')
    .replace(/\b1\s*tec\b/g, '1 tecla')
    .replace(/\b2\s*p\s*\+\s*t\b/g, '2pt')
    .replace(/\b2p\s+t\b/g, '2pt')
    .replace(/\bnbr\d+\b/g, ' ')
    .replace(/\be-?14\b/g, 'e14')
    .replace(/\be-?27\b/g, 'e27')
    .replace(/\bc\/\s*(?:100|200|50|25|48|60|30|24|20|12|6)\b/g, ' ')
    .replace(/\s+c(?:20|48|60|30|24|6)\s*$/g, ' ')
    .replace(/\(\s*(?:pct|pt)\s*-?\s*\d+\s*\)/g, ' ');

  // Mercante uses "X" instead of "/" in fractional inches (e.g. "1X2" -> "1/2", "3X4" -> "3/4", "1.1X2" -> "1.1/2", "7X8" -> "7/8")
  if (!/\b(divisor|antena)\b/.test(s)) {
    s = s
      .replace(/\b(\d+)\.(1|3)[x×](2|4)\b/g, '$1.$2/$3')
      .replace(/(\d+(?:mm)?\s*[x×]\s*)(1|3|5|7)[x×](2|4|8)\b/g, '$1$2/$3')
      .replace(/\b(1|3|5|7)[x×](2|4|8)\b/g, '$1/$2');
  }

  // On fittings (joelho/curva), "90 X 100MM" / "45 X 075MM" / "90 X 3/4" is Angle × Diameter, NOT pipe reduction!
  if (/\b(joelho|curva)\b/.test(s)) {
    s = s.replace(
      /(^|\s)(45|90)\s*[x×]\s*(?=(?:dn\s*)?0*(?:20|25|32|40|50|75|100|150|\d+\/\d+)(?:mm|cm|")?\b)/g,
      '$1$2deg '
    );
  }

  return s;
}

interface ParsedSignature {
  coreTokens: string[];
  dimensions: string[];
  colors: string[];
  hasReducao: boolean;
  hasVisita: boolean;
  hasBuchaLatao: boolean;
  hasFlange: boolean;
  isCurto: boolean;
  isLongo: boolean;
  isEsgoto: boolean;
  isSoldavel: boolean;
  isRoscavel: boolean;
  isCega: boolean;
  hasFuro: boolean;
  isDuplo: boolean;
  lockType: '' | 'interna' | 'externo' | 'banheiro';
  isCorante: boolean;
  isEscada: boolean;
  isFitaIsolante: boolean;
  kelvinTemp: string;
}

function cleanNumStr(v: string): string {
  const s = v.replace(',', '.');
  if (s.includes('/')) return s;
  const n = parseFloat(s);
  return Number.isNaN(n) ? s : String(n);
}

function parseSignature(raw: string): ParsedSignature {
  let norm = preNormalizeText(raw);

  // Extract compound dimensions like "100mm x 50mm", "DN 100 x DN 50", "20 x 1/2", "19,0 mm x 5 m"
  const dimensions: string[] = [];

  // Fridge lamp: "15x127v" -> "15w 127v"
  norm = norm.replace(/\b0*(\d+)\s*[x×]\s*(127|220)v\b/g, (_m, w, v) => {
    dimensions.push(`${parseInt(w, 10)}w`);
    return ` ${v}v `;
  });

  // Replace compound "A x B" dimensions cleanly (preserving fractions like 1/2, 3/4, 1.1/2)
  norm = norm.replace(
    /\b(?:dn\s*)?0*(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*(mm|cm|m|mt|mts|")?\s*[x×]\s*(?:dn\s*)?0*(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*(mm|cm|m|mt|mts|")?/g,
    (_m, a, u1, b, u2) => {
      const unit = u2 || u1 || '';
      if (unit === 'cm' && !a.includes('/') && !b.includes('/')) {
        const aMm = Math.round(parseFloat(a.replace(',', '.')) * 10);
        const bMm = Math.round(parseFloat(b.replace(',', '.')) * 10);
        dimensions.push(`${aMm}x${bMm}`);
      } else {
        dimensions.push(`${cleanNumStr(a)}x${cleanNumStr(b)}`);
      }
      return ' ';
    }
  );

  // Electrical poles: "12 polos", "12p", "12p22cm"
  norm = norm.replace(/\b0*(\d+)\s*(?:polos|p(?=\s*\d*cm\b|\b))/g, (_m, n) => {
    dimensions.push(`${parseInt(n, 10)}polos`);
    return ' ';
  });

  // Step ladder count: "05 degraus", "6 deg"
  norm = norm.replace(/\b0*(\d+)\s*deg(?:rau|raus)?\b/g, (_m, n) => {
    dimensions.push(`${parseInt(n, 10)}degraus`);
    return ' degraus ';
  });

  // Sandpaper (lixa) grit: "gr 400", "gr1200", "g400", "g50"
  if (/\blixa\b/.test(norm)) {
    norm = norm.replace(/\b(?:gr\.?|g)\s*0*(\d+)\b/g, (_m, n) => {
      dimensions.push(`grit${parseInt(n, 10)}`);
      return ' ';
    });
  }

  // Electrical amperage & wattage: "63A", "40A", "040A", "20W", "020W", "50W"
  norm = norm.replace(/\b0*(\d+)\s*(a|w)\b/g, (_m, n, u) => {
    dimensions.push(`${parseInt(n, 10)}${u}`);
    return ' ';
  });

  // Color temperature (Kelvin): "3000K", "6000K", "6500K", "6,5K"
  let kelvinTemp = '';
  norm = norm.replace(/\b(\d+(?:[.,]\d+)?)\s*k\b/g, (_m, kRaw) => {
    const kVal = parseFloat(kRaw.replace(',', '.'));
    const normK = kVal < 100 ? Math.round(kVal * 1000) : Math.round(kVal);
    kelvinTemp = normK <= 3500 ? '3000k' : normK <= 4500 ? '4000k' : '6500k';
    return ' ';
  });

  // Single pipe/diameter/length/weight/volume measurements: "DN 50", "050MM", "50 MM", "175 GR", "300ML", "0,9L", "20M", "50MTS"
  norm = norm.replace(/\bdn\s*0*(\d+)\b/g, (_m, n) => {
    dimensions.push(`${parseInt(n, 10)}mm`);
    return ' ';
  });
  norm = norm.replace(/\b0*(\d+(?:[.,]\d+)?)\s*(mm|cm|ml|kg|mts|mt|gr|g|l|m)\b/g, (_m, n, unit) => {
    const uNorm = unit === 'mts' || unit === 'mt' ? 'm' : unit === 'gr' ? 'g' : unit;
    dimensions.push(`${cleanNumStr(n)}${uNorm}`);
    return ' ';
  });

  // Fractions like 1/2", 3/4", 1.1/2"
  norm = norm.replace(/\b(\d+(?:\.\d+)?\/\d+)\s*(?:"|'|pol)?/g, (_m, frac) => {
    dimensions.push(frac);
    return ' ';
  });

  // Whole inches like 1", 1', 2"
  norm = norm.replace(/\b0*(\d+)\s*(?:"|'|pol\b)/g, (_m, n) => {
    dimensions.push(`${parseInt(n, 10)}in`);
    return ' ';
  });

  // Angles like 90deg, 45deg, or "joelho 90" / "curva 90"
  norm = norm.replace(/\b(45|90)deg\b/g, (_m, deg) => {
    dimensions.push(`${deg}deg`);
    return ' ';
  });
  norm = norm.replace(/\b(joelho|curva)\s+(45|90)\b/g, (_m, fit, deg) => {
    dimensions.push(`${deg}deg`);
    return fit;
  });

  // Trowel (colher pedreiro) and brush (trincha) sizes: "n 07", "n07", "colher pedreiro 7", "trincha 700e 2"
  if (/\bcolher\b/.test(norm)) {
    norm = norm.replace(/\b(?:n\s*0*(\d+)|n0*(\d+))\b/g, (_m, a, b) => {
      dimensions.push(`n${parseInt(a || b, 10)}`);
      return ' ';
    });
    norm = norm.replace(/\b(5|6|7|8|9|10|11|12)\b/g, (_m, n) => {
      dimensions.push(`n${parseInt(n, 10)}`);
      return ' ';
    });
  }
  if (/\btrincha\b/.test(norm)) {
    norm = norm.replace(/\b(?:700e|[a-h])\b/g, ' ');
    norm = norm.replace(/\b(1|2|3|4)\b/g, (_m, n) => {
      dimensions.push(`${n}in`);
      return ' ';
    });
  }

  // Bracket (mão francesa) unitless sizes like "20 BR", "25 BR", "50 BR" -> 20cm, 25cm, 50cm
  const isMaoFrancesa = /\bmao\s+francesa\b/.test(norm) || /\bcanton(?:eira)?\b/.test(norm);

  // Tokenize remainder
  const rawTokens = norm
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const coreSet = new Set<string>();
  const colorSet = new Set<string>();

  for (const tok of rawTokens) {
    if (BRAND_WORDS.has(tok) || STOP_WORDS.has(tok)) continue;

    // Normalize numeric-only gauges
    if (/^(20|25|32|40|50|75|100|150)$/.test(tok)) {
      dimensions.push(isMaoFrancesa ? `${tok}cm` : `${tok}mm`);
      continue;
    }

    // Ignore pure 3+ digit manufacturer catalog/SKU codes (e.g. 330, 597, 659, 61336, 11581000510)
    if (/^\d{3,}$/.test(tok)) continue;

    const mapped = SYNONYM_MAP[tok] || tok;
    if (STOP_WORDS.has(mapped) || BRAND_WORDS.has(mapped)) continue;

    if (COLOR_TOKENS.has(mapped)) {
      colorSet.add(mapped);
      continue;
    }

    if (mapped.length >= 2) {
      coreSet.add(mapped);
    }
  }

  // If "tubo" appears together with fitting/adhesive nouns ("cap para tubos de esgoto", "cola tubo 175g"), keep core focused
  if (
    coreSet.has('tubo') &&
    (coreSet.has('cap') ||
      coreSet.has('luva') ||
      coreSet.has('joelho') ||
      coreSet.has('te') ||
      coreSet.has('adesivo'))
  ) {
    coreSet.delete('tubo');
  }

  // "CEGA C FURO" is a plate with center hole (furo), NOT a blind plate (cega)
  if (coreSet.has('cega') && coreSet.has('furo')) {
    coreSet.delete('cega');
  }

  // "ADAPTADOR SOLD CX DAGUA" == "ADAPT FLANGE": normalize "caixa" + "agua" on adaptador -> "flange"
  if (coreSet.has('adaptador') && coreSet.has('caixa') && coreSet.has('agua')) {
    coreSet.delete('caixa');
    coreSet.delete('agua');
    coreSet.add('flange');
  }

  // For trincha, strip handle/bristle descriptions ("preto", "cerda", "grisalha", "cabo") so Roma vs Condor match cleanly
  if (coreSet.has('trincha')) {
    colorSet.clear();
    coreSet.delete('cabo');
  }

  const lockType: '' | 'interna' | 'externo' | 'banheiro' = coreSet.has('fechadura')
    ? coreSet.has('banheiro')
      ? 'banheiro'
      : coreSet.has('externo')
        ? 'externo'
        : coreSet.has('interna')
          ? 'interna'
          : ''
    : '';

  const uniqueDims = [...new Set(dimensions)];
  return {
    coreTokens: [...coreSet],
    dimensions: uniqueDims,
    colors: [...colorSet],
    hasReducao: coreSet.has('reducao'),
    hasVisita: coreSet.has('visita'),
    hasBuchaLatao: coreSet.has('bucha') || coreSet.has('latao'),
    hasFlange: coreSet.has('flange'),
    isCurto: coreSet.has('curto'),
    isLongo: coreSet.has('longo'),
    isEsgoto: coreSet.has('esgoto'),
    isSoldavel: coreSet.has('soldavel'),
    isRoscavel: coreSet.has('roscavel'),
    isCega: coreSet.has('cega') && !coreSet.has('furo'),
    hasFuro: coreSet.has('furo'),
    isDuplo: coreSet.has('duplo'),
    lockType,
    isCorante: coreSet.has('corante'),
    isEscada: coreSet.has('escada'),
    isFitaIsolante: coreSet.has('fita') && coreSet.has('isolante'),
    kelvinTemp,
  };
}

function dimensionsCompatible(
  dimsA: string[],
  dimsB: string[],
  options: { allowMassVolumeEquiv?: boolean; isEscada?: boolean; isFitaIsolante?: boolean } = {}
): { compatible: boolean; overlapCount: number } {
  const { allowMassVolumeEquiv = false, isEscada = false, isFitaIsolante = false } = options;
  if (dimsA.length === 0 || dimsB.length === 0) {
    return { compatible: true, overlapCount: 0 };
  }

  // Normalize "100mm" vs "100", and when allowMassVolumeEquiv (e.g. Corante 50g vs 50ml), normalize "g"/"ml" -> "gv"
  const normDim = (d: string) => {
    const base = d.replace(/mm$/, '');
    return allowMassVolumeEquiv ? base.replace(/(ml|g)$/, 'gv') : base;
  };
  const setA = new Set(dimsA.map(normDim));
  const setB = new Set(dimsB.map(normDim));

  let overlap = 0;
  for (const d of setA) {
    if (setB.has(d)) overlap++;
  }

  // Check compound dimensions ("100x50", "25x50", "20x1/2") vs compound OR paired singles ("25mm - 50m")
  const compA = [...setA].filter((d) => d.includes('x'));
  const compB = [...setB].filter((d) => d.includes('x'));
  if (compA.length > 0 && compB.length > 0) {
    const sharesComp = compA.some((c) => compB.includes(c));
    if (!sharesComp) return { compatible: false, overlapCount: 0 };
  } else if (compA.length > 0 && compB.length === 0) {
    const [p1, p2] = compA[0].split('x');
    const flatB = [...setB].map((d) => d.replace(/(mm|cm|ml|kg|g|l|m)$/, ''));
    if (flatB.includes(p1) && flatB.includes(p2)) {
      return { compatible: true, overlapCount: 2 };
    }
    if (isFitaIsolante && p1 === '19' && flatB.includes(p2)) {
      return { compatible: true, overlapCount: 1 };
    }
    return { compatible: false, overlapCount: 0 };
  } else if (compB.length > 0 && compA.length === 0) {
    const [p1, p2] = compB[0].split('x');
    const flatA = [...setA].map((d) => d.replace(/(mm|cm|ml|kg|g|l|m)$/, ''));
    if (flatA.includes(p1) && flatA.includes(p2)) {
      return { compatible: true, overlapCount: 2 };
    }
    if (isFitaIsolante && p1 === '19' && flatA.includes(p2)) {
      return { compatible: true, overlapCount: 1 };
    }
    return { compatible: false, overlapCount: 0 };
  }

  // Check angle conflicts (90deg vs 45deg)
  const degA = [...setA].filter((d) => d.endsWith('deg'));
  const degB = [...setB].filter((d) => d.endsWith('deg'));
  if (degA.length > 0 && degB.length > 0 && !degA.some((d) => degB.includes(d))) {
    return { compatible: false, overlapCount: 0 };
  }

  // Check step count on Escadas (5degraus vs 6degraus vs 7degraus)
  const degrausA = [...setA].filter((d) => d.endsWith('degraus'));
  const degrausB = [...setB].filter((d) => d.endsWith('degraus'));
  if (degrausA.length > 0 && degrausB.length > 0 && !degrausA.some((d) => degrausB.includes(d))) {
    return { compatible: false, overlapCount: 0 };
  }

  // Check grit on Lixas (grit50 vs grit400 vs grit1200)
  const gritA = [...setA].filter((d) => d.startsWith('grit'));
  const gritB = [...setB].filter((d) => d.startsWith('grit'));
  if (gritA.length > 0 && gritB.length > 0 && !gritA.some((d) => gritB.includes(d))) {
    return { compatible: false, overlapCount: 0 };
  }

  // If both have dimensions and ZERO overlap, incompatible (e.g. 50mm vs 100mm, 5m vs 20m)
  if (overlap === 0) {
    return { compatible: false, overlapCount: 0 };
  }

  // Ensure matching physical units don't contradict (on Escadas with matching step count, skip nominal height rounding like 1.80m vs 1.84m)
  const unitsToCheck = allowMassVolumeEquiv
    ? [...(isEscada ? [] : ['m']), 'kg', 'l', 'w', 'a', 'polos', 'in']
    : [...(isEscada ? [] : ['m']), 'g', 'ml', 'kg', 'l', 'w', 'a', 'polos', 'in'];
  for (const unitSuffix of unitsToCheck) {
    const uA = dimsA.filter((d) => d.endsWith(unitSuffix) && !d.endsWith('mm') && !d.endsWith('cm'));
    const uB = dimsB.filter((d) => d.endsWith(unitSuffix) && !d.endsWith('mm') && !d.endsWith('cm'));
    if (uA.length > 0 && uB.length > 0 && !uA.some((u) => uB.includes(u))) {
      return { compatible: false, overlapCount: 0 };
    }
  }

  // Check mm values (e.g. 20mm vs 25mm, 50mm vs 100mm)
  const mmA = dimsA.filter((d) => d.endsWith('mm'));
  const mmB = dimsB.filter((d) => d.endsWith('mm'));
  if (mmA.length > 0 && mmB.length > 0 && !mmA.some((m) => mmB.includes(m))) {
    return { compatible: false, overlapCount: 0 };
  }

  return { compatible: true, overlapCount: overlap };
}

export function findBestProductMatch(
  candidateDesc: string,
  existingProducts: MatchCandidate[]
): string {
  const cleanCandidate = candidateDesc.toLowerCase().trim();
  if (!cleanCandidate || existingProducts.length === 0) return '';

  const sigA = parseSignature(candidateDesc);
  const nounsA = sigA.coreTokens.filter((t) => PRIMARY_NOUNS.has(t));

  let bestId = '';
  let bestScore = 0;

  for (const p of existingProducts) {
    const pLower = p.name.toLowerCase().trim();
    if (pLower === cleanCandidate) return p.id;

    const sigB = parseSignature(p.name);

    // Guard 1: Incompatible structural modifiers
    if (sigA.hasReducao !== sigB.hasReducao) continue;
    if (sigA.hasVisita !== sigB.hasVisita) continue;
    if (sigA.hasBuchaLatao !== sigB.hasBuchaLatao) continue;
    if (sigA.hasFlange !== sigB.hasFlange) continue;
    if (sigA.hasFuro !== sigB.hasFuro) continue;
    if (sigA.isDuplo !== sigB.isDuplo) continue;
    if ((sigA.isCega && sigB.hasFuro) || (sigB.isCega && sigA.hasFuro)) continue;
    if (sigA.lockType && sigB.lockType && sigA.lockType !== sigB.lockType) continue;
    if (sigA.kelvinTemp && sigB.kelvinTemp && sigA.kelvinTemp !== sigB.kelvinTemp) continue;
    if ((sigA.isCurto && sigB.isLongo) || (sigA.isLongo && sigB.isCurto)) continue;
    if (sigA.isEsgoto && (sigB.isSoldavel || sigB.isRoscavel)) continue;
    if (sigB.isEsgoto && (sigA.isSoldavel || sigA.isRoscavel)) continue;
    if (sigA.isRoscavel && sigB.isSoldavel && !sigA.isSoldavel && !sigB.isRoscavel) continue;
    if (sigB.isRoscavel && sigA.isSoldavel && !sigB.isSoldavel && !sigA.isRoscavel) continue;

    // Guard 2: Primary product noun conflict (e.g. Te vs Joelho vs Curva vs Luva vs Plug)
    const nounsB = sigB.coreTokens.filter((t) => PRIMARY_NOUNS.has(t));
    if (nounsA.length > 0 && nounsB.length > 0) {
      const sharesNoun = nounsA.some((n) => nounsB.includes(n));
      if (!sharesNoun) continue;
    }

    // Guard 3: Incompatible colors (when both explicitly state a color)
    const sameColorCount =
      sigA.colors.length > 0 && sigB.colors.length > 0
        ? sigA.colors.filter((c) => sigB.colors.includes(c)).length
        : 0;
    if (sigA.colors.length > 0 && sigB.colors.length > 0 && sameColorCount === 0) {
      continue;
    }

    // Guard 4: Incompatible dimensions/gauges
    const dimCheck = dimensionsCompatible(sigA.dimensions, sigB.dimensions, {
      allowMassVolumeEquiv: sigA.isCorante && sigB.isCorante,
      isEscada: sigA.isEscada && sigB.isEscada,
      isFitaIsolante: sigA.isFitaIsolante && sigB.isFitaIsolante,
    });
    if (!dimCheck.compatible) continue;

    if (sigA.coreTokens.length === 0 || sigB.coreTokens.length === 0) continue;

    const commonTokens = sigA.coreTokens.filter((t) => sigB.coreTokens.includes(t));
    if (commonTokens.length === 0) continue;

    const minLen = Math.min(sigA.coreTokens.length, sigB.coreTokens.length);
    const maxLen = Math.max(sigA.coreTokens.length, sigB.coreTokens.length);
    const containment = commonTokens.length / minLen;
    const jaccard =
      commonTokens.length / (sigA.coreTokens.length + sigB.coreTokens.length - commonTokens.length);

    // Special adhesive case: both are "adesivo" with same exact weight/volume (e.g. 175g) and no conflicting specialty words
    const adhesiveSpecialty = ['contato', 'silicone', 'epoxi', 'araldite', 'instantaneo', 'cianoacrilato'];
    const specA = sigA.coreTokens.filter((t) => adhesiveSpecialty.includes(t));
    const specB = sigB.coreTokens.filter((t) => adhesiveSpecialty.includes(t));
    const sameAdhesiveByWeight =
      commonTokens.includes('adesivo') &&
      dimCheck.overlapCount > 0 &&
      specA.length === 0 &&
      specB.length === 0 &&
      (sigA.dimensions.some((d) => /(?:g|ml|kg|l)$/.test(d)) || false);

    // Bonus for matching dimensions and matching color
    const dimScore = dimCheck.overlapCount > 0 ? 0.25 : 0;
    const colorScore = sameColorCount > 0 ? 0.1 : 0;
    const combinedScore = containment * 0.55 + jaccard * 0.35 + dimScore + colorScore;

    const effectiveCommon = commonTokens.length + (sameColorCount > 0 ? 1 : 0);
    const singlePrimaryNounWithDim =
      minLen === 1 &&
      maxLen <= 2 &&
      commonTokens.length === 1 &&
      PRIMARY_NOUNS.has(commonTokens[0]) &&
      dimCheck.overlapCount >= 1;
    const passesThreshold =
      sameAdhesiveByWeight ||
      singlePrimaryNounWithDim ||
      (effectiveCommon >= 2 && dimCheck.overlapCount > 0 && containment >= 0.5) ||
      (effectiveCommon >= 2 && containment >= 0.75 && jaccard >= 0.5) ||
      (effectiveCommon >= 3 && maxLen <= 5 && jaccard >= 0.55) ||
      (sigA.isCorante && sigB.isCorante && sameColorCount > 0 && dimCheck.compatible);

    if (passesThreshold && combinedScore > bestScore) {
      bestScore = combinedScore;
      bestId = p.id;
    }
  }

  return bestId;
}

const NON_DISPLAY_BRAND_WORDS = new Set([
  'dismatal',
  'ovd',
  'mercante',
  'opcao',
  'bartofil',
  'evoluir',
  'max',
  'nova',
  'real',
  'form',
  'heavy',
  'duty',
  'b01',
  'b07',
  'nv',
  'he',
  'tr',
  'bond',
  'tek',
  'cabos',
  'parana',
  'fox',
]);

const BRAND_DISPLAY_ALIASES: Record<string, string> = {
  mundialprim: 'MUNDIAL PRIME',
  mundialprime: 'MUNDIAL PRIME',
  thompso: 'THOMPSON',
  thompsom: 'THOMPSON',
  thompson: 'THOMPSON',
  qualit: 'QUALITEX',
  qualite: 'QUALITEX',
  qualitex: 'QUALITEX',
  paceta: 'PACETTA',
  pacetta: 'PACETTA',
  sopran: 'SOPRANO',
  soprano: 'SOPRANO',
  tramontin: 'TRAMONTINA',
  tramontina: 'TRAMONTINA',
  colorg: 'COLORGIN',
  colorgin: 'COLORGIN',
  decor: 'DECORLUX',
  decorl: 'DECORLUX',
  decorlux: 'DECORLUX',
  pluz: 'PLUZIE',
  pluzie: 'PLUZIE',
  acqu: 'ACQUAFLEX',
  acquaflex: 'ACQUAFLEX',
  avan: 'AVANT',
  avant: 'AVANT',
  elgi: 'ELGIN',
  elgin: 'ELGIN',
  higib: 'HIGIB',
  higi: 'HIGI',
  peguze: 'PEG & UZE',
  levuze: 'LEV & UZE',
  gard: 'GARDEN',
  garden: 'GARDEN',
  dryko: 'DRYKO',
  drykopox: 'DRYKO',
  sika: 'SIKA',
  sikadur: 'SIKA',
  sikadurepoxi: 'SIKA',
  tekbond: 'TEKBOND',
  foxlux: 'FOXLUX',
  docol: 'DOCOL',
  lorenzetti: 'LORENZETTI',
  hydra: 'HYDRA',
  xadrez: 'XADREZ',
  stanley: 'STANLEY',
  bosch: 'BOSCH',
  makita: 'MAKITA',
  dewalt: 'DEWALT',
  steelflex: 'STEELFLEX',
  cobrecom: 'COBRECOM',
  corfio: 'CORFIO',
  cral: 'CRAL',
  atlas: 'ATLAS',
  castor: 'CASTOR',
  vedacit: 'VEDACIT',
  suvinil: 'SUVINIL',
  coral: 'CORAL',
  univ: 'UNIVERSO',
  aguia: 'METAIS ÁGUIA',
};

export function extractProductBrand(
  text: string,
  fallbackBrand?: string
): string {
  const norm = (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(
      /(fortlev|amanco|krona|tigre|plastilit|multilit|vonder|tramontina|brascola|tekbond|botafogo|thompson|thompsom|thompso|condor|pluzie|luconi|bartofil|qualitex|foxlux|mundialprime|docol|lorenzetti|cortag|atlas|vedacit)/g,
      ' $1 '
    );

  if (/\bcabos\s+parana\b/.test(norm)) return 'CABOS PARANÁ';
  if (/\btek\s*bond\b/.test(norm)) return 'TEKBOND';
  if (/\bsika(?:dur)?\b/.test(norm)) return 'SIKA';
  if (/\bdryko(?:pox)?\b/.test(norm)) return 'DRYKO';
  if (/\bfortlev\b/.test(norm)) return 'FORTLEV';

  const tokens = norm
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Scan right-to-left because supplier descriptions usually place brand at the end
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tok = tokens[i];
    if (BRAND_DISPLAY_ALIASES[tok]) {
      return BRAND_DISPLAY_ALIASES[tok];
    }
    if (BRAND_WORDS.has(tok) && !NON_DISPLAY_BRAND_WORDS.has(tok)) {
      return tok.toUpperCase();
    }
  }

  const cleanFallback = (fallbackBrand || '').trim().replace(/^\*/, '').trim();
  if (
    cleanFallback &&
    !/^(n\/a|sem marca|outros?)$/i.test(cleanFallback)
  ) {
    const fbNorm = cleanFallback
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    return BRAND_DISPLAY_ALIASES[fbNorm] || cleanFallback.toUpperCase();
  }

  return '';
}

