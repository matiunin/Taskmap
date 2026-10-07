import React, { useEffect, useState, memo } from 'react';
import { fetchJiraMedia } from '../utils/jira/jiraMedia';
import './AdfRenderer.css';

type Attachment = { url: string; mime?: string; filename?: string };
type AttachmentMap = Record<string, Attachment>;

interface AdfRendererProps {
  node: any;
  attachments?: AttachmentMap;
  jiraBaseUrl?: string;
  fallbackText?: string;
}

interface AdfNodeProps {
  node: any;
  attachments?: AttachmentMap;
  jiraBaseUrl?: string;
  keyPath: string;
}

function renderMarks(children: React.ReactNode, marks: any[] | undefined, keyPath: string): React.ReactNode {
  if (!marks || marks.length === 0) return children;
  let result = children;
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    const mk = `${keyPath}-mk${i}`;
    switch (mark.type) {
      case 'strong':
        result = <strong key={mk}>{result}</strong>;
        break;
      case 'em':
        result = <em key={mk}>{result}</em>;
        break;
      case 'underline':
        result = <u key={mk}>{result}</u>;
        break;
      case 'strike':
        result = <s key={mk}>{result}</s>;
        break;
      case 'code':
        result = <code key={mk} className="adf-inline-code">{result}</code>;
        break;
      case 'subsup':
        result = mark.attrs?.type === 'sup'
          ? <sup key={mk}>{result}</sup>
          : <sub key={mk}>{result}</sub>;
        break;
      case 'textColor':
        result = <span key={mk} style={{ color: mark.attrs?.color }}>{result}</span>;
        break;
      case 'backgroundColor':
        result = <span key={mk} style={{ backgroundColor: mark.attrs?.color }}>{result}</span>;
        break;
      case 'link':
        result = (
          <a
            key={mk}
            href={mark.attrs?.href || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="adf-link"
          >
            {result}
          </a>
        );
        break;
      default:
        break;
    }
  }
  return result;
}

const AdfMedia: React.FC<{ node: any; attachments?: AttachmentMap }> = memo(({ node, attachments }) => {
  const attrs = node.attrs || {};
  const attachment = attrs.id && attachments ? attachments[String(attrs.id)] : undefined;
  const fileName = attachment?.filename || attrs.alt || 'attachment';
  const isImage = attachment?.mime?.startsWith('image/')
    || attrs.type === 'file' && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fileName)
    || attrs.type === 'external';

  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      try {
        if (attrs.type === 'external' && attrs.url) {
          if (!cancelled) setSrc(attrs.url);
          return;
        }
        if (!attachment?.url) {
          if (!cancelled) setFailed(true);
          return;
        }
        const blobUrl = await fetchJiraMedia(attachment.url);
        createdUrl = blobUrl;
        if (!cancelled) {
          setSrc(blobUrl);
        } else {
          URL.revokeObjectURL(blobUrl);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    if (isImage) load();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attrs.id, attrs.url, attrs.type, attachment?.url, isImage]);

  if (!isImage) {
    return (
      <a
        href={attachment?.url || '#'}
        className="adf-attachment-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        <i className="lni lni-paperclip" aria-hidden />
        <span>{fileName}</span>
      </a>
    );
  }

  if (failed) {
    return <div className="adf-media-fallback">🖼 {fileName}</div>;
  }

  if (!src) {
    return <div className="adf-media-loading" aria-label="Loading" />;
  }

  return <img src={src} alt={fileName} className="adf-media-image" loading="lazy" />;
});

const AdfNode: React.FC<AdfNodeProps> = ({ node, attachments, jiraBaseUrl, keyPath }) => {
  if (!node) return null;

  // Array of nodes (root ADF sometimes)
  if (Array.isArray(node)) {
    return (
      <>
        {node.map((child, i) => (
          <AdfNode key={`${keyPath}-${i}`} node={child} attachments={attachments} jiraBaseUrl={jiraBaseUrl} keyPath={`${keyPath}-${i}`} />
        ))}
      </>
    );
  }

  const renderChildren = () => {
    if (!Array.isArray(node.content)) return null;
    return node.content.map((child: any, i: number) => (
      <AdfNode
        key={`${keyPath}-c${i}`}
        node={child}
        attachments={attachments}
        jiraBaseUrl={jiraBaseUrl}
        keyPath={`${keyPath}-c${i}`}
      />
    ));
  };

  switch (node.type) {
    case 'doc':
      return <div className="adf-doc">{renderChildren()}</div>;

    case 'paragraph': {
      const children = renderChildren();
      if (!children || (Array.isArray(children) && children.length === 0)) {
        return <p className="adf-paragraph">&nbsp;</p>;
      }
      return <p className="adf-paragraph">{children}</p>;
    }

    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level || 1));
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag className={`adf-heading adf-heading-${level}`}>{renderChildren()}</Tag>;
    }

    case 'bulletList':
      return <ul className="adf-bullet-list">{renderChildren()}</ul>;

    case 'orderedList':
      return <ol className="adf-ordered-list" start={node.attrs?.order || 1}>{renderChildren()}</ol>;

    case 'listItem':
      return <li className="adf-list-item">{renderChildren()}</li>;

    case 'taskList':
      return <ul className="adf-task-list">{renderChildren()}</ul>;

    case 'taskItem': {
      const checked = node.attrs?.state === 'DONE';
      return (
        <li className="adf-task-item">
          <input type="checkbox" checked={checked} readOnly className="adf-task-checkbox" />
          <span className={checked ? 'adf-task-done' : ''}>{renderChildren()}</span>
        </li>
      );
    }

    case 'blockquote':
      return <blockquote className="adf-blockquote">{renderChildren()}</blockquote>;

    case 'codeBlock': {
      const lang = node.attrs?.language;
      const text = Array.isArray(node.content)
        ? node.content.map((c: any) => (c?.type === 'text' ? c.text : '')).join('')
        : '';
      return (
        <pre className="adf-code-block" data-language={lang || undefined}>
          <code>{text}</code>
        </pre>
      );
    }

    case 'rule':
      return <hr className="adf-rule" />;

    case 'panel': {
      const type = node.attrs?.panelType || 'info';
      const icons: Record<string, string> = {
        info: 'lni-information',
        note: 'lni-pencil-alt',
        warning: 'lni-warning',
        success: 'lni-checkmark-circle',
        error: 'lni-cross-circle',
      };
      return (
        <div className={`adf-panel adf-panel-${type}`}>
          <i className={`lni ${icons[type] || icons.info} adf-panel-icon`} aria-hidden />
          <div className="adf-panel-content">{renderChildren()}</div>
        </div>
      );
    }

    case 'expand':
    case 'nestedExpand':
      return (
        <details className="adf-expand">
          <summary className="adf-expand-title">{node.attrs?.title || '…'}</summary>
          <div className="adf-expand-content">{renderChildren()}</div>
        </details>
      );

    case 'table':
      return (
        <div className="adf-table-wrapper">
          <table className="adf-table"><tbody>{renderChildren()}</tbody></table>
        </div>
      );

    case 'tableRow':
      return <tr>{renderChildren()}</tr>;

    case 'tableHeader':
      return (
        <th
          className="adf-table-header"
          colSpan={node.attrs?.colspan || 1}
          rowSpan={node.attrs?.rowspan || 1}
          style={node.attrs?.background ? { background: node.attrs.background } : undefined}
        >
          {renderChildren()}
        </th>
      );

    case 'tableCell':
      return (
        <td
          className="adf-table-cell"
          colSpan={node.attrs?.colspan || 1}
          rowSpan={node.attrs?.rowspan || 1}
          style={node.attrs?.background ? { background: node.attrs.background } : undefined}
        >
          {renderChildren()}
        </td>
      );

    case 'mediaSingle':
    case 'mediaGroup':
      return <div className={`adf-media-${node.type === 'mediaSingle' ? 'single' : 'group'}`}>{renderChildren()}</div>;

    case 'media':
      return <AdfMedia node={node} attachments={attachments} />;

    case 'text':
      return <>{renderMarks(node.text || '', node.marks, keyPath)}</>;

    case 'hardBreak':
      return <br />;

    case 'mention':
      return <span className="adf-mention">@{node.attrs?.text?.replace(/^@/, '') || 'user'}</span>;

    case 'emoji':
      return <span className="adf-emoji" title={node.attrs?.shortName}>{node.attrs?.text || node.attrs?.shortName || ''}</span>;

    case 'date': {
      const ts = parseInt(node.attrs?.timestamp, 10);
      const label = Number.isFinite(ts) ? new Date(ts).toLocaleDateString() : '';
      return <span className="adf-date">{label}</span>;
    }

    case 'status': {
      const color = node.attrs?.color || 'neutral';
      return <span className={`adf-status adf-status-${color}`}>{node.attrs?.text || ''}</span>;
    }

    case 'inlineCard':
    case 'blockCard': {
      const url = node.attrs?.url || node.attrs?.data?.url || '#';
      let label = url;
      const browseMatch = url.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
      if (browseMatch) label = browseMatch[1];
      return (
        <a href={url} className="adf-inline-card" target="_blank" rel="noopener noreferrer">
          <i className="lni lni-link-angular-right" aria-hidden />
          <span>{label}</span>
        </a>
      );
    }

    default:
      // Unknown — render children if present
      if (Array.isArray(node.content)) return <>{renderChildren()}</>;
      return null;
  }
};

export const AdfRenderer: React.FC<AdfRendererProps> = ({ node, attachments, jiraBaseUrl, fallbackText }) => {
  if (!node || typeof node !== 'object') {
    if (fallbackText) {
      return <div className="adf-fallback-text">{fallbackText}</div>;
    }
    return null;
  }
  return (
    <div className="adf-renderer">
      <AdfNode node={node} attachments={attachments} jiraBaseUrl={jiraBaseUrl} keyPath="root" />
    </div>
  );
};
