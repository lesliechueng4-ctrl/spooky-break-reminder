import { render } from 'preact';
import en from '../i18n/locales/en.json';

// Vite sets BASE_URL to '/spooky-break-reminder/' in dev and in the build (Requirement 26.2).
const candleUrl = `${import.meta.env.BASE_URL}icons/candle.svg`;

function Placeholder() {
  return (
    <main class="placeholder">
      <img class="candle" src={candleUrl} alt={en['page.candleAlt']} width="128" height="128" />
      <h1>{en['app.name']}</h1>
      <p class="pitch">{en['app.pitch']}</p>
      <p class="status">{en['page.status']}</p>
    </main>
  );
}

const root = document.getElementById('app');
if (!root) {
  throw new Error('Missing #app mount element in index.html');
}
render(<Placeholder />, root);
