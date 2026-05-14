import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export function HelpMarkdown({ source }: { source: string }) {
  return (
    <article className="prose prose-sm sm:prose-base prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:text-fg prose-h1:hidden prose-h2:mt-10 prose-h2:text-xl prose-h3:mt-8 prose-h3:text-lg prose-p:text-fg prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-fg prose-code:rounded prose-code:bg-bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-pre:rounded-lg prose-pre:bg-bg-emphasis prose-pre:text-fg prose-img:rounded-lg prose-img:border prose-img:border-border prose-li:text-fg prose-li:marker:text-fg-subtle prose-blockquote:border-l-primary prose-blockquote:bg-bg-subtle prose-blockquote:not-italic prose-blockquote:text-fg-muted prose-hr:border-border prose-table:text-sm prose-th:text-fg prose-td:text-fg max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]]}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
