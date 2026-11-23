import { useStore } from '../store';

/** Навигация по страницам без роутера. */
export function useNavigate() {
  const setActivePage = useStore((s) => s.setActivePage);
  return (page: string) => setActivePage(page);
}
