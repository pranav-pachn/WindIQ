# WindIQ Frontend

Enterprise analytics dashboard for UK Wind Generation forecast accuracy intelligence.

## Technology Stack

* **Core**: React 19, TypeScript 5.6, Vite 8
* **Styling**: Tailwind CSS 3.4, Lucide React
* **State & Data Fetching**: TanStack Query (React Query v5)
* **Visualization**: Recharts (diurnal heatmaps, multi-horizon bars, error quantiles, timeline brush)
* **Testing & Quality**: Vitest 5.1, React Testing Library, Oxlint

## Available Scripts

```bash
# Start local Vite development server
npm run dev

# Run TypeScript typecheck without emitting
npm run typecheck

# Run linter
npm run lint

# Run Vitest test suite
npm test

# Build optimized production bundle
npm run build
```

## Structure

* `src/pages/`: Main views (`overview-page.tsx`, `accuracy-page.tsx`, `forecast-page.tsx`)
* `src/components/`: Modular domain components (`dashboard/`, `accuracy/`, `forecasts/`, `charts/`, `layout/`, `ui/`)
* `src/hooks/`: Typed TanStack Query data hooks (`use-overview`, `use-accuracy`, `use-forecasts`, `use-api-health`)
* `src/lib/`: API client, date formatters, CSV export utilities, and theme tokens
* `src/test/`: Comprehensive unit and integration test suite
