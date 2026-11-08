/**
 * WindIQ Unified Analytical Chart Theme
 * Clean, restrained, financial-grade styling with consistent tokens.
 */

export const CHART_THEME = {
  colors: {
    forecast: '#35B9C8',          // Primary interactive accent
    actual: '#CBD5E1',            // Calm neutral light tone
    mae: '#35B9C8',               // Linear deviation (accent teal)
    rmse: '#E7AD4A',              // Root mean square error (restrained amber)
    positiveError: '#E7AD4A',     // Overforecast / positive bias
    negativeError: '#35B9C8',     // Underforecast / negative bias
    grid: '#1E2B3E',              // Subtle gridlines
    axis: '#718198',              // Muted axis labels
    axisLine: '#26364A',          // Border line
    zeroLine: '#374B63',          // Reference zero line
    surface: '#111C2D',           // Tooltip surface
    surfaceElevated: '#162337',   // Card surface
  },
  typography: {
    fontFamilyMono: 'JetBrains Mono, monospace',
    fontFamilySans: 'Inter, sans-serif',
    axisFontSize: 10,
    tooltipFontSize: 11,
  },
  grid: {
    strokeDasharray: '3 3',
    stroke: '#1E2B3E',
    vertical: false,
  },
  xAxis: {
    stroke: '#718198',
    fontSize: 10,
    tickLine: false,
    axisLine: { stroke: '#26364A' },
  },
  yAxis: {
    stroke: '#718198',
    fontSize: 10,
    tickLine: false,
    axisLine: { stroke: '#26364A' },
  },
  tooltipStyle: {
    backgroundColor: '#111C2D',
    borderColor: '#26364A',
    borderRadius: '6px',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
    color: '#E7EDF5',
  },
} as const

