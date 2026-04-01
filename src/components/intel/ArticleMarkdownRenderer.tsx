import React, { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-3xl md:text-4xl font-bold text-foreground mt-10 mb-4 pb-3 border-b-2 border-primary/40">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-10 mb-4 pl-4 border-l-4 border-primary uppercase tracking-wide">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg md:text-xl font-medium text-muted-foreground mt-8 mb-3">
      {children}
    </h3>
  ),
  p: ({ children, node }) => {
    // Check if this paragraph contains only an image — if so, render without <p> wrapper
    const childArray = React.Children.toArray(children);
    if (childArray.length === 1 && React.isValidElement(childArray[0]) && (childArray[0] as React.ReactElement).type === 'img') {
      return <>{children}</>;
    }
    return (
      <p className="text-muted-foreground leading-[1.85] text-base md:text-lg mb-5">
        {children}
      </p>
    );
  },
  strong: ({ children }) => (
    <strong className="font-bold text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-muted-foreground/90">{children}</em>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-8 rounded-lg bg-muted/40 border-l-4 border-primary/60 px-6 py-4 italic text-muted-foreground text-lg">
      {children}
    </blockquote>
  ),
  hr: () => (
    <div className="my-10 flex items-center justify-center gap-2">
      <span className="h-1 w-1 rounded-full bg-primary/40" />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
      <span className="h-1 w-1 rounded-full bg-primary/40" />
    </div>
  ),
  ul: ({ children }) => (
    <ul className="my-4 ml-6 space-y-2 list-disc marker:text-primary/60 text-muted-foreground leading-relaxed">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-6 space-y-2 list-decimal marker:text-primary/60 text-muted-foreground leading-relaxed">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-muted-foreground">{children}</li>
  ),
  img: ({ src, alt }) => {
    // Use a data attribute trick: odd/even alternation handled by CSS nth-of-type
    return (
      <figure className="my-6 md:max-w-[45%] [&:nth-of-type(odd)]:md:float-left [&:nth-of-type(odd)]:md:mr-6 [&:nth-of-type(even)]:md:float-right [&:nth-of-type(even)]:md:ml-6 clear-none">
        <img
          src={src}
          alt={alt || ''}
          className="rounded-xl border border-border/40 shadow-md w-full object-cover"
          loading="lazy"
        />
        {alt && alt !== 'image' && (
          <figcaption className="text-center text-xs text-muted-foreground/60 mt-2 italic">
            {alt}
          </figcaption>
        )}
      </figure>
    );
  },
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border/40">
      <table className="w-full text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/50 text-foreground">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-foreground border-b border-border/40">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-muted-foreground border-b border-border/20">{children}</td>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className={`${className} text-sm`}>{children}</code>
      );
    }
    return (
      <code className="bg-muted/60 text-primary px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-6 rounded-lg bg-muted/40 border border-border/30 p-4 overflow-x-auto text-sm">
      {children}
    </pre>
  ),
};

interface ArticleContentProps {
  content: string;
  className?: string;
}

export function ArticleContent({ content, className = '' }: ArticleContentProps) {
  return (
    <div className={`max-w-none after:content-[''] after:clear-both after:table ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
      <div className="clear-both" />
    </div>
  );
}
