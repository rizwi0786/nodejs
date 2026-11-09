import { HashRouter } from 'react-router-dom';
import { ProgressProvider } from './context/ProgressContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppRoutes } from './routes/AppRoutes';

// HashRouter: deep links work on GitHub Pages and any static host without server rewrites.
export default function App() {
  return (
    <ThemeProvider>
      <ProgressProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ProgressProvider>
    </ThemeProvider>
  );
}
