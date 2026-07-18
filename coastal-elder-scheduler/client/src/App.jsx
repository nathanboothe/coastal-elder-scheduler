import ElderScheduling from './modules/ElderScheduling.jsx';
import AvailabilityManager from './modules/AvailabilityManager.jsx';

// As more modules get added (per the "one module per session" convention),
// this is where they'd get registered/routed. Just a plain path check for
// now, since two pages don't justify pulling in a routing library.
export default function App() {
  const isManagePage = window.location.pathname.startsWith('/manage');

  return (
    <div className="app-shell">
      {isManagePage ? <AvailabilityManager /> : <ElderScheduling />}
    </div>
  );
}
