import Link from 'next/link';

export function HelpFooter() {
  return (
    <footer className="border-border bg-bg-subtle border-t">
      <div className="text-fg-muted container flex flex-col items-center justify-between gap-3 py-6 text-xs sm:flex-row">
        <span>© {new Date().getFullYear()} Kharis · KTask. Sistema de gestão de tarefas.</span>
        <div className="flex items-center gap-4">
          <Link href="/ajuda" className="hover:text-fg transition-colors">
            Ajuda
          </Link>
          <Link href="/ajuda/suporte" className="hover:text-fg transition-colors">
            Suporte
          </Link>
          <Link href="/" className="hover:text-fg transition-colors">
            Voltar ao app
          </Link>
        </div>
      </div>
    </footer>
  );
}
