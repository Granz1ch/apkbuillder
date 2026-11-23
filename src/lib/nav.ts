import { useStore } from '../store';

/** Page navigation without a router. */
export function useNavigate() {
  const setActivePage = useStore((s) => s.setActivePage);
  return (page: string) => setActivePage(page);
}
