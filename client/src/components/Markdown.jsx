import { Check, Copy } from 'lucide-react';
import { memo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { useCopy } from '../hooks/useCopy';

function CodeBlock({ children, node: _node, ...props }) {
  const preRef = useRef(null);
  const { copied, copy } = useCopy();
  const codeElement = Array.isArray(children) ? children[0] : children;
  const language = /language-([\w+#.-]+)/.exec(codeElement?.props?.className ?? '')?.[1];

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-(--code-bg)">
      <div className="flex items-center justify-between border-b border-line py-1 pl-3.5 pr-1.5 text-xs text-faint">
        <span>{language ?? 'Code'}</span>
        <button
          type="button"
          onClick={() => copy(preRef.current?.innerText ?? '')}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-sunken hover:text-ink"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy code'}
        </button>
      </div>
      <pre ref={preRef} className="overflow-x-auto px-4 py-3" {...props}>
        {children}
      </pre>
    </div>
  );
}

const components = {
  pre: CodeBlock,
  table: ({ node: _node, ...props }) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
};

const remarkPlugins = [remarkGfm];
const highlightPlugins = [[rehypeHighlight, { detect: false }]];

/**
 * Renders a reply as Markdown. Syntax highlighting is skipped while the
 * reply is still streaming to keep every frame cheap.
 */
export const Markdown = memo(function Markdown({ content, streaming }) {
  return (
    <div className={`md ${streaming ? 'is-streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={streaming ? undefined : highlightPlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
