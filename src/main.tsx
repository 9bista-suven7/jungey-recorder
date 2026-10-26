import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import './styles.css';
import App from './App';
import { compositor } from './engine/compositor';
import { useStore } from './store';

// Text on the board uses Caveat; redraw once it has loaded.
void document.fonts.load('600 48px Caveat').then(() => compositor.fontsVersion++);

// Handy for poking at the app from the devtools console while developing.
if (import.meta.env.DEV) Object.assign(window, { __jungey: { useStore, compositor } });

createRoot(document.getElementById('root')!).render(<App />);
