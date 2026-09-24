import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Teal ramp (Tailwind teal scale) — index 5 = #14b8a6 is the youthful primary.
const brand: MantineColorsTuple = [
  '#f0fdfa',
  '#ccfbf1',
  '#99f6e4',
  '#5eead4',
  '#2dd4bf',
  '#14b8a6',
  '#0d9488',
  '#0f766e',
  '#115e59',
  '#134e4a',
];

// Lime ramp used as the secondary/accent pop color.
const lime: MantineColorsTuple = [
  '#f7fee7',
  '#ecfccb',
  '#d9f99d',
  '#bef264',
  '#a3e635',
  '#84cc16',
  '#65a30d',
  '#4d7c0f',
  '#3f6212',
  '#365314',
];

export const mantineTheme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 5, dark: 4 },
  colors: { brand, lime },
  fontFamily:
    "-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Button: { defaultProps: { autoContrast: true } },
    Badge: { defaultProps: { autoContrast: true } },
  },
});
