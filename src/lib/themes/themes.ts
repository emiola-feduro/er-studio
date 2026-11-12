export type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  canvas: string;
  grid: string;
  node: string;
  nodeHeader: string;
  nodeHeaderFg: string;
  nodeBorder: string;
  junctionHeader: string;
  junctionHeaderFg?: string;
  edge: string;
  edgeHl: string;
  pk: string;
  fk: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
};

export type Theme = {
  id: string;
  name: string;
  dark: boolean;
  pattern: 'dots' | 'lines' | 'cross' | 'none';
  radius: string;
  borderWidth: string;
  shadow: string;
  colors: ThemeColors;
  /** Extra CSS scoped by [data-theme="id"] for themes with a strong personality. */
  extraCss?: string;
};

const soft = '0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.06)';
const deep = '0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.3)';

export const THEMES: Theme[] = [
  {
    id: 'light', name: 'Claro', dark: false, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#f6f7f9', surface: '#ffffff', surface2: '#eef0f4', fg: '#1c2230', muted: '#5b6475', border: '#d9dde5',
      accent: '#3a5bd9', accentFg: '#ffffff', accentSoft: '#e6ebfb', canvas: '#f3f4f7', grid: '#cfd4de',
      node: '#ffffff', nodeHeader: '#eef1f8', nodeHeaderFg: '#1c2230', nodeBorder: '#c9cfdb', junctionHeader: '#f4eee2',
      edge: '#7a8396', edgeHl: '#3a5bd9', pk: '#9a6200', fk: '#3a5bd9', danger: '#c0362c', dangerSoft: '#fbe9e7',
      warning: '#8a5a00', warningSoft: '#fdf3dc', success: '#23784a',
    },
  },
  {
    id: 'dark', name: 'Oscuro', dark: true, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#16181d', surface: '#1d2026', surface2: '#262a32', fg: '#e3e6ec', muted: '#9aa2b1', border: '#333844',
      accent: '#8aa4f0', accentFg: '#10131a', accentSoft: '#262f4a', canvas: '#14161a', grid: '#2e333d',
      node: '#1f232a', nodeHeader: '#2a2f39', nodeHeaderFg: '#e3e6ec', nodeBorder: '#3a404c', junctionHeader: '#3a3328',
      edge: '#7d8597', edgeHl: '#8aa4f0', pk: '#e0b45c', fk: '#8aa4f0', danger: '#f08a80', dangerSoft: '#3b2222',
      warning: '#e7c06d', warningSoft: '#3a3020', success: '#7cc79a',
    },
  },
  {
    id: 'high-contrast', name: 'Alto contraste', dark: false, pattern: 'lines', radius: '2px', borderWidth: '2px', shadow: 'none',
    colors: {
      bg: '#ffffff', surface: '#ffffff', surface2: '#ececec', fg: '#000000', muted: '#1a1a1a', border: '#000000',
      accent: '#0000c8', accentFg: '#ffffff', accentSoft: '#dfe3ff', canvas: '#ffffff', grid: '#c4c4c4',
      node: '#ffffff', nodeHeader: '#000000', nodeHeaderFg: '#ffffff', nodeBorder: '#000000', junctionHeader: '#4a2c00',
      edge: '#000000', edgeHl: '#0000c8', pk: '#6b3e00', fk: '#0000c8', danger: '#a30000', dangerSoft: '#ffe0e0',
      warning: '#5c3b00', warningSoft: '#fff0c2', success: '#005a1e',
    },
  },
  {
    id: 'high-contrast-dark', name: 'Alto contraste oscuro', dark: true, pattern: 'lines', radius: '2px', borderWidth: '2px', shadow: 'none',
    colors: {
      bg: '#000000', surface: '#000000', surface2: '#1a1a1a', fg: '#ffffff', muted: '#f0f0f0', border: '#ffffff',
      accent: '#ffff00', accentFg: '#000000', accentSoft: '#333300', canvas: '#000000', grid: '#3a3a3a',
      node: '#000000', nodeHeader: '#ffffff', nodeHeaderFg: '#000000', nodeBorder: '#ffffff', junctionHeader: '#ffff00',
      edge: '#ffffff', edgeHl: '#ffff00', pk: '#ffff00', fk: '#00ffff', danger: '#ff6b6b', dangerSoft: '#330000',
      warning: '#ffff00', warningSoft: '#333300', success: '#00ff7f',
    },
  },
  {
    id: 'sepia', name: 'Sepia', dark: false, pattern: 'dots', radius: '6px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#f4ecd8', surface: '#fbf5e6', surface2: '#ede2c8', fg: '#3b2f1e', muted: '#6e5c43', border: '#d8c8a4',
      accent: '#8b4a1c', accentFg: '#fff8ec', accentSoft: '#f0dcc4', canvas: '#f1e7cf', grid: '#d4c39d',
      node: '#fdf8ec', nodeHeader: '#eadbb9', nodeHeaderFg: '#3b2f1e', nodeBorder: '#ccb98f', junctionHeader: '#e3cfb0',
      edge: '#8a7556', edgeHl: '#8b4a1c', pk: '#8b5a00', fk: '#7a3b14', danger: '#9e2b1e', dangerSoft: '#f5d9d0',
      warning: '#7a5200', warningSoft: '#f3e3b8', success: '#3f6b2a',
    },
  },
  {
    id: 'brutalist', name: 'Brutalista', dark: false, pattern: 'lines', radius: '0px', borderWidth: '2px', shadow: '4px 4px 0 #000000',
    colors: {
      bg: '#ffffff', surface: '#ffffff', surface2: '#f2f2f2', fg: '#000000', muted: '#2b2b2b', border: '#000000',
      accent: '#ff4f00', accentFg: '#000000', accentSoft: '#ffe14d', canvas: '#f5f5f0', grid: '#d6d6d0',
      node: '#ffffff', nodeHeader: '#ffe14d', nodeHeaderFg: '#000000', nodeBorder: '#000000', junctionHeader: '#9ad7ff',
      edge: '#000000', edgeHl: '#ff4f00', pk: '#000000', fk: '#b33600', danger: '#d40000', dangerSoft: '#ffd6d6',
      warning: '#6b4b00', warningSoft: '#fff2b3', success: '#006b2d',
    },
    extraCss: 'button, input, select, textarea { font-weight: 600; }',
  },
  {
    id: 'brutalist-dark', name: 'Brutalista oscuro', dark: true, pattern: 'lines', radius: '0px', borderWidth: '2px', shadow: '4px 4px 0 #f2f2ea',
    colors: {
      bg: '#111111', surface: '#161616', surface2: '#242424', fg: '#f2f2ea', muted: '#cfcfc6', border: '#f2f2ea',
      accent: '#ff5c1a', accentFg: '#000000', accentSoft: '#4a3d00', canvas: '#0c0c0c', grid: '#2c2c2c',
      node: '#161616', nodeHeader: '#ffe14d', nodeHeaderFg: '#000000', nodeBorder: '#f2f2ea', junctionHeader: '#5bc0ff',
      junctionHeaderFg: '#000000', edge: '#f2f2ea', edgeHl: '#ff5c1a', pk: '#ffe14d', fk: '#ff9a66',
      danger: '#ff6b6b', dangerSoft: '#3a1010', warning: '#ffe14d', warningSoft: '#3a3300', success: '#4ade80',
    },
    extraCss: 'button, input, select, textarea { font-weight: 600; }',
  },
  {
    id: 'brutalist-sepia', name: 'Brutalista sepia', dark: false, pattern: 'lines', radius: '0px', borderWidth: '2px', shadow: '4px 4px 0 #1f160b',
    colors: {
      bg: '#efe4c8', surface: '#f7efdc', surface2: '#e6d7b4', fg: '#1f160b', muted: '#4a3a24', border: '#1f160b',
      accent: '#b5400f', accentFg: '#ffffff', accentSoft: '#f2c14e', canvas: '#ece0c0', grid: '#cdbb92',
      node: '#f7efdc', nodeHeader: '#f2c14e', nodeHeaderFg: '#1f160b', nodeBorder: '#1f160b', junctionHeader: '#9cc5b0',
      edge: '#1f160b', edgeHl: '#b5400f', pk: '#6b3a00', fk: '#9a3412', danger: '#a3200f', dangerSoft: '#f5d0c0',
      warning: '#6b4800', warningSoft: '#f2deb0', success: '#2f5d20',
    },
    extraCss: 'button, input, select, textarea { font-weight: 600; }',
  },
  {
    id: 'brutalist-high-contrast', name: 'Brutalista alto contraste', dark: false, pattern: 'lines', radius: '0px', borderWidth: '3px', shadow: '5px 5px 0 #000000',
    colors: {
      bg: '#ffffff', surface: '#ffffff', surface2: '#ececec', fg: '#000000', muted: '#000000', border: '#000000',
      accent: '#0000d6', accentFg: '#ffffff', accentSoft: '#ffff00', canvas: '#ffffff', grid: '#b5b5b5',
      node: '#ffffff', nodeHeader: '#000000', nodeHeaderFg: '#ffffff', nodeBorder: '#000000', junctionHeader: '#0000d6',
      junctionHeaderFg: '#ffffff', edge: '#000000', edgeHl: '#0000d6', pk: '#000000', fk: '#0000d6',
      danger: '#b00000', dangerSoft: '#ffd9d9', warning: '#5a3b00', warningSoft: '#ffff99', success: '#005a1e',
    },
    extraCss: 'button, input, select, textarea { font-weight: 700; }',
  },
  {
    id: 'mono', name: 'Tinta', dark: false, pattern: 'dots', radius: '4px', borderWidth: '1px', shadow: 'none',
    colors: {
      bg: '#fafafa', surface: '#ffffff', surface2: '#f0f0f0', fg: '#161616', muted: '#555555', border: '#d4d4d4',
      accent: '#161616', accentFg: '#ffffff', accentSoft: '#e8e8e8', canvas: '#f7f7f7', grid: '#d0d0d0',
      node: '#ffffff', nodeHeader: '#161616', nodeHeaderFg: '#ffffff', nodeBorder: '#161616', junctionHeader: '#555555',
      junctionHeaderFg: '#ffffff', edge: '#444444', edgeHl: '#000000', pk: '#000000', fk: '#444444',
      danger: '#b00020', dangerSoft: '#fde7ea', warning: '#6b4f00', warningSoft: '#f7efd9', success: '#1f6b3a',
    },
  },
  {
    id: 'solarized', name: 'Solarizado', dark: false, pattern: 'dots', radius: '6px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#fdf6e3', surface: '#fffbef', surface2: '#eee8d5', fg: '#073642', muted: '#586e75', border: '#e0d8bf',
      accent: '#1f6fa8', accentFg: '#ffffff', accentSoft: '#dcebf5', canvas: '#f7f0dc', grid: '#ddd4ba',
      node: '#fffbef', nodeHeader: '#eee8d5', nodeHeaderFg: '#073642', nodeBorder: '#d6cdb1', junctionHeader: '#f3e3c3',
      edge: '#839496', edgeHl: '#1f6fa8', pk: '#8a6400', fk: '#1f6fa8', danger: '#c0302e', dangerSoft: '#f7dedb',
      warning: '#8a6100', warningSoft: '#f6e9c2', success: '#5e7a00',
    },
  },
  {
    id: 'graph-paper', name: 'Papel cuadriculado', dark: false, pattern: 'lines', radius: '4px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#fbfbf7', surface: '#ffffff', surface2: '#f1f2ec', fg: '#22313f', muted: '#55636f', border: '#cfd8dc',
      accent: '#b8322a', accentFg: '#ffffff', accentSoft: '#f8e3e0', canvas: '#fdfdf8', grid: '#b9d4e8',
      node: '#fffffa', nodeHeader: '#e9f1f7', nodeHeaderFg: '#22313f', nodeBorder: '#9fb7c9', junctionHeader: '#f6ecd2',
      edge: '#4a5d6e', edgeHl: '#b8322a', pk: '#9a6200', fk: '#2d5f8a', danger: '#b8322a', dangerSoft: '#f8e3e0',
      warning: '#7a5200', warningSoft: '#f6ecd2', success: '#2f6f3e',
    },
  },
  {
    id: 'forest', name: 'Bosque', dark: false, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#eef3ec', surface: '#f8fbf6', surface2: '#e1eadd', fg: '#1e2d22', muted: '#4c5f50', border: '#c7d6c2',
      accent: '#2f6b3a', accentFg: '#ffffff', accentSoft: '#d8e8d6', canvas: '#edf2ea', grid: '#c4d3be',
      node: '#fbfdf9', nodeHeader: '#d9e8d3', nodeHeaderFg: '#1e2d22', nodeBorder: '#a9c0a3', junctionHeader: '#eadfc4',
      edge: '#6b7f6d', edgeHl: '#2f6b3a', pk: '#8a5a00', fk: '#2f6b3a', danger: '#a83a2a', dangerSoft: '#f4dcd6',
      warning: '#7a5600', warningSoft: '#f0e4c0', success: '#2f6b3a',
    },
  },
  {
    id: 'sunset', name: 'Atardecer', dark: false, pattern: 'dots', radius: '10px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#fff3ea', surface: '#fffaf6', surface2: '#fbe4d6', fg: '#3a1f1a', muted: '#75514a', border: '#f0cbb8',
      accent: '#c2410c', accentFg: '#ffffff', accentSoft: '#fde0cf', canvas: '#fff1e6', grid: '#f0c8b2',
      node: '#fffaf6', nodeHeader: '#ffd8bf', nodeHeaderFg: '#3a1f1a', nodeBorder: '#e9b49a', junctionHeader: '#f7d1e0',
      edge: '#a0665a', edgeHl: '#c2410c', pk: '#9a5b00', fk: '#b0306a', danger: '#b42318', dangerSoft: '#fde2dd',
      warning: '#8a5300', warningSoft: '#fdebc8', success: '#2f7a4a',
    },
  },
  {
    id: 'candy', name: 'Caramelo', dark: false, pattern: 'dots', radius: '14px', borderWidth: '1px', shadow: soft,
    colors: {
      bg: '#fef6fb', surface: '#ffffff', surface2: '#f9e8f3', fg: '#3d2340', muted: '#6f5371', border: '#f1d3e6',
      accent: '#c2307f', accentFg: '#ffffff', accentSoft: '#fbe1ef', canvas: '#fff5fa', grid: '#f2cbe3',
      node: '#ffffff', nodeHeader: '#d9f0ff', nodeHeaderFg: '#3d2340', nodeBorder: '#e8bcd8', junctionHeader: '#fff0c7',
      edge: '#b07aa6', edgeHl: '#c2307f', pk: '#a35c00', fk: '#2f6fb3', danger: '#b4232f', dangerSoft: '#fde0e4',
      warning: '#8a5a00', warningSoft: '#fff0c7', success: '#2e7d5b',
    },
  },
  {
    id: 'vaporwave', name: 'Vaporwave', dark: false, pattern: 'lines', radius: '6px', borderWidth: '1px', shadow: '3px 3px 0 #e3a6d3',
    colors: {
      bg: '#fdf0f8', surface: '#fff7fc', surface2: '#f6e3f1', fg: '#2d1b3d', muted: '#6a4f7d', border: '#eac7e2',
      accent: '#7b3fe4', accentFg: '#ffffff', accentSoft: '#ece0fb', canvas: '#fbe9f5', grid: '#f0bfe0',
      node: '#ffffff', nodeHeader: '#c9f2f2', nodeHeaderFg: '#2d1b3d', nodeBorder: '#e3a6d3', junctionHeader: '#ffd9ec',
      edge: '#a05fb7', edgeHl: '#00a3a3', pk: '#a8590b', fk: '#7b3fe4', danger: '#c2185b', dangerSoft: '#fde0ec',
      warning: '#8a5a00', warningSoft: '#fff1cc', success: '#1b7f6b',
    },
  },
  {
    id: 'comic', name: 'Cómic', dark: false, pattern: 'dots', radius: '6px', borderWidth: '2px', shadow: '3px 3px 0 #111111',
    colors: {
      bg: '#fffbea', surface: '#ffffff', surface2: '#fff3c4', fg: '#111111', muted: '#3b3b3b', border: '#111111',
      accent: '#e2231a', accentFg: '#ffffff', accentSoft: '#ffe1de', canvas: '#fff7d6', grid: '#efc94c',
      node: '#ffffff', nodeHeader: '#59b4ff', nodeHeaderFg: '#111111', nodeBorder: '#111111', junctionHeader: '#ffd23f',
      edge: '#111111', edgeHl: '#e2231a', pk: '#b35900', fk: '#0b5cad', danger: '#c4160f', dangerSoft: '#ffe1de',
      warning: '#7a4f00', warningSoft: '#fff0b3', success: '#157a3a',
    },
  },
  {
    id: 'gameboy', name: 'Consola de bolsillo', dark: false, pattern: 'cross', radius: '0px', borderWidth: '2px', shadow: 'none',
    colors: {
      bg: '#8bac0f', surface: '#9bbc0f', surface2: '#8bac0f', fg: '#0f380f', muted: '#1f4a1f', border: '#306230',
      accent: '#0f380f', accentFg: '#9bbc0f', accentSoft: '#8bac0f', canvas: '#9bbc0f', grid: '#7d9c0d',
      node: '#9bbc0f', nodeHeader: '#306230', nodeHeaderFg: '#cfe86b', nodeBorder: '#0f380f', junctionHeader: '#0f380f',
      junctionHeaderFg: '#cfe86b', edge: '#0f380f', edgeHl: '#306230', pk: '#0f380f', fk: '#1f4a1f',
      danger: '#0f380f', dangerSoft: '#cfe86b', warning: '#0f380f', warningSoft: '#cfe86b', success: '#0f380f',
    },
  },
  {
    id: 'nord', name: 'Nórdico', dark: true, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#2e3440', surface: '#3b4252', surface2: '#434c5e', fg: '#eceff4', muted: '#c0c7d4', border: '#4c566a',
      accent: '#88c0d0', accentFg: '#2e3440', accentSoft: '#3e5563', canvas: '#2b303b', grid: '#3f4757',
      node: '#3b4252', nodeHeader: '#434c5e', nodeHeaderFg: '#eceff4', nodeBorder: '#56607a', junctionHeader: '#5a4f5f',
      edge: '#8f9bb3', edgeHl: '#88c0d0', pk: '#ebcb8b', fk: '#88c0d0', danger: '#e0959c', dangerSoft: '#4a3a42',
      warning: '#ebcb8b', warningSoft: '#4a4436', success: '#a3be8c',
    },
  },
  {
    id: 'dracula', name: 'Vampiro', dark: true, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#21222c', surface: '#282a36', surface2: '#343746', fg: '#f8f8f2', muted: '#bfc3dc', border: '#44475a',
      accent: '#bd93f9', accentFg: '#1e1f29', accentSoft: '#3b3552', canvas: '#1e1f29', grid: '#383b4c',
      node: '#282a36', nodeHeader: '#44475a', nodeHeaderFg: '#f8f8f2', nodeBorder: '#565a73', junctionHeader: '#5a3e5e',
      edge: '#8b8fa8', edgeHl: '#ff79c6', pk: '#f1fa8c', fk: '#8be9fd', danger: '#ff6e6e', dangerSoft: '#4a2a32',
      warning: '#ffb86c', warningSoft: '#4a3a2a', success: '#50fa7b',
    },
  },
  {
    id: 'ocean', name: 'Océano', dark: true, pattern: 'dots', radius: '10px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#0f1e2b', surface: '#142736', surface2: '#1b3245', fg: '#e2eef6', muted: '#a6bccb', border: '#284459',
      accent: '#5cc8d6', accentFg: '#0b1a24', accentSoft: '#1d3f4d', canvas: '#0d1a25', grid: '#1f384c',
      node: '#152a3a', nodeHeader: '#1d3a50', nodeHeaderFg: '#e2eef6', nodeBorder: '#2e5470', junctionHeader: '#3a3a55',
      edge: '#7aa3bd', edgeHl: '#5cc8d6', pk: '#f2c66d', fk: '#5cc8d6', danger: '#ff8a80', dangerSoft: '#3d2229',
      warning: '#f2c66d', warningSoft: '#3b3626', success: '#7fd6a6',
    },
  },
  {
    id: 'coffee', name: 'Café', dark: true, pattern: 'dots', radius: '8px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#2a201b', surface: '#33271f', surface2: '#3e3027', fg: '#f1e6da', muted: '#cbb8a5', border: '#54443a',
      accent: '#d9a066', accentFg: '#2a201b', accentSoft: '#4a3727', canvas: '#261d18', grid: '#3f3129',
      node: '#33271f', nodeHeader: '#4a382c', nodeHeaderFg: '#f1e6da', nodeBorder: '#6b5444', junctionHeader: '#3d3a2a',
      edge: '#a38b75', edgeHl: '#d9a066', pk: '#e8c37a', fk: '#9fc6b8', danger: '#f08a7a', dangerSoft: '#4a2a24',
      warning: '#e8c37a', warningSoft: '#4a3d26', success: '#9fc6a0',
    },
  },
  {
    id: 'midnight-gold', name: 'Medianoche dorada', dark: true, pattern: 'dots', radius: '6px', borderWidth: '1px', shadow: deep,
    colors: {
      bg: '#0e1220', surface: '#151a2c', surface2: '#1d2338', fg: '#ece6d6', muted: '#bdb59f', border: '#2c3350',
      accent: '#d4af37', accentFg: '#0e1220', accentSoft: '#3a3220', canvas: '#0b0f1b', grid: '#20273d',
      node: '#151a2c', nodeHeader: '#1f2640', nodeHeaderFg: '#e8cf7a', nodeBorder: '#b8942e', junctionHeader: '#2a2140',
      edge: '#a99860', edgeHl: '#f0d27a', pk: '#f0d27a', fk: '#9fb4e8', danger: '#f08a80', dangerSoft: '#3b2226',
      warning: '#f0d27a', warningSoft: '#3a3220', success: '#8fd1a8',
    },
  },
  {
    id: 'blueprint', name: 'Plano técnico', dark: true, pattern: 'lines', radius: '2px', borderWidth: '1px', shadow: 'none',
    colors: {
      bg: '#163d6b', surface: '#1b4677', surface2: '#22528a', fg: '#f0f6ff', muted: '#c4d8f2', border: '#3c6aa3',
      accent: '#ffffff', accentFg: '#163d6b', accentSoft: '#2a5d99', canvas: '#1d4e89', grid: '#3a6aa4',
      node: '#1d4e89', nodeHeader: '#245a9a', nodeHeaderFg: '#ffffff', nodeBorder: '#e6f0ff', junctionHeader: '#2e6b5e',
      edge: '#e6f0ff', edgeHl: '#ffd166', pk: '#ffd166', fk: '#a8e1ff', danger: '#ffadad', dangerSoft: '#4a2f4a',
      warning: '#ffd166', warningSoft: '#3b4a5a', success: '#a7f3c0',
    },
  },
  {
    id: 'terminal', name: 'Terminal fósforo', dark: true, pattern: 'lines', radius: '0px', borderWidth: '1px', shadow: 'none',
    colors: {
      bg: '#050b05', surface: '#081208', surface2: '#0e1c0e', fg: '#33ff66', muted: '#2bd957', border: '#1a4d1a',
      accent: '#33ff66', accentFg: '#021002', accentSoft: '#0f2e12', canvas: '#030803', grid: '#0f2a0f',
      node: '#061006', nodeHeader: '#0f2e12', nodeHeaderFg: '#66ff8c', nodeBorder: '#1f7a2c', junctionHeader: '#2a2a08',
      junctionHeaderFg: '#e6ff4d', edge: '#26c94b', edgeHl: '#b6ffc7', pk: '#e6ff4d', fk: '#66ffcc',
      danger: '#ff5c5c', dangerSoft: '#2a0d0d', warning: '#e6ff4d', warningSoft: '#262a08', success: '#33ff66',
    },
    extraCss: '.react-flow__node { text-shadow: 0 0 4px rgb(51 255 102 / 0.45); }',
  },
  {
    id: 'synthwave', name: 'Synthwave', dark: true, pattern: 'lines', radius: '6px', borderWidth: '1px', shadow: '0 0 0 1px #ff4fd855',
    colors: {
      bg: '#1a1033', surface: '#241446', surface2: '#2f1b5a', fg: '#f5e9ff', muted: '#cdb9ea', border: '#4a2d7a',
      accent: '#ff4fd8', accentFg: '#1a1033', accentSoft: '#4a1f5e', canvas: '#170d2e', grid: '#3d1f66',
      node: '#241446', nodeHeader: '#3a1f6b', nodeHeaderFg: '#fdf2ff', nodeBorder: '#7a3fb0', junctionHeader: '#1f4a6b',
      edge: '#36f9f6', edgeHl: '#fede5d', pk: '#fede5d', fk: '#36f9f6', danger: '#ff6b8b', dangerSoft: '#4a1a35',
      warning: '#fede5d', warningSoft: '#3d3020', success: '#72f1b8',
    },
  },
  {
    id: 'cyberpunk', name: 'Ciberpunk', dark: true, pattern: 'cross', radius: '0px', borderWidth: '1px', shadow: '0 0 0 1px #00f0ff44',
    colors: {
      bg: '#0b0c10', surface: '#12141a', surface2: '#1b1e27', fg: '#e8f1f2', muted: '#adbac0', border: '#2a2f3a',
      accent: '#fcee0a', accentFg: '#0b0c10', accentSoft: '#3a3712', canvas: '#090a0d', grid: '#222835',
      node: '#12141a', nodeHeader: '#1f2430', nodeHeaderFg: '#fcee0a', nodeBorder: '#00f0ff', junctionHeader: '#3a1030',
      junctionHeaderFg: '#ff7aa8', edge: '#00f0ff', edgeHl: '#ff2a6d', pk: '#fcee0a', fk: '#00f0ff',
      danger: '#ff2a6d', dangerSoft: '#3a1020', warning: '#fcee0a', warningSoft: '#3a3712', success: '#05ffa1',
    },
  },
];

export const DEFAULT_THEME_ID = 'light';

export const getTheme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

const toKebab = (key: string) => key.replace(/[A-Z0-9]/g, (m) => `-${m.toLowerCase()}`);

/** CSS custom properties for a theme, applied on the document root. */
export const themeVariables = (theme: Theme): Record<string, string> => {
  const vars: Record<string, string> = {};
  const colors = { ...theme.colors, junctionHeaderFg: theme.colors.junctionHeaderFg ?? theme.colors.nodeHeaderFg };
  for (const [key, value] of Object.entries(colors)) vars[`--c-${toKebab(key)}`] = value;
  vars['--radius'] = theme.radius;
  vars['--bw'] = theme.borderWidth;
  vars['--shadow'] = theme.shadow;
  return vars;
};
