import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { purgePreviewCaches } from './lib/purgePreviewCaches'

purgePreviewCaches();

createRoot(document.getElementById("root")!).render(<App />);
