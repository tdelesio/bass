import React, { useState, useEffect } from 'react';
import { Edit3, Eye, FileText } from 'lucide-react';

interface NoteWidgetProps {
  widgetId: string;
  initialData: {
    text?: string;
  };
  onSave: (data: { text: string }) => void;
}

export default function NoteWidget({ widgetId, initialData, onSave }: NoteWidgetProps) {
  const [text, setText] = useState(initialData.text || 'Write notes here...');
  const [isEditing, setIsEditing] = useState(!initialData.text || initialData.text === 'Write notes here...');

  useEffect(() => {
    if (initialData.text !== undefined) {
      setText(initialData.text);
    }
  }, [initialData]);

  const handleSave = () => {
    setIsEditing(false);
    onSave({ text });
  };

  // Basic renderer helper for styling bold/italic and lists without needing heavy markdown libraries
  const renderSimpleMarkdown = (input: string) => {
    if (!input) return null;

    const lines = input.split('\n');
    return lines.map((line, index) => {
      let trimmed = line.trim();

      // Headings
      if (trimmed.startsWith('### ')) {
        return <h4 key={index} style={{ fontSize: '1.15rem', color: 'var(--text-main)', marginTop: '0.8rem', marginBottom: '0.4rem' }}>{trimmed.slice(4)}</h4>;
      }
      if (trimmed.startsWith('## ')) {
        return <h3 key={index} style={{ fontSize: '1.3rem', color: 'var(--text-main)', marginTop: '1rem', marginBottom: '0.5rem' }}>{trimmed.slice(3)}</h3>;
      }

      // Bullet Lists
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        return (
          <ul key={index} style={{ marginLeft: '1.5rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
            <li>{renderInlines(trimmed.slice(2))}</li>
          </ul>
        );
      }

      // Paragraphs
      return (
        <p key={index} style={{ marginBottom: '0.6rem', color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.92rem' }}>
          {renderInlines(line)}
        </p>
      );
    });
  };

  // Render basic inlines: **bold**
  const renderInlines = (textStr: string) => {
    const parts = textStr.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} style={{ color: 'var(--primary)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="note-widget" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '0.25rem' }}>
        {isEditing ? (
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={handleSave}>
            <Eye size={12} /> Preview
          </button>
        ) : (
          <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setIsEditing(true)}>
            <Edit3 size={12} /> Edit Note
          </button>
        )}
      </div>

      {isEditing ? (
        <textarea
          className="input-field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type songs notes, chord guides, or tab strings here. Supported: ## Heading, * Bullets, and **Bold** text."
          style={{
            minHeight: '140px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: '1.4',
            resize: 'vertical',
            background: 'rgba(10, 12, 20, 0.4)'
          }}
        />
      ) : (
        <div style={{
          padding: '1rem',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.015)',
          border: '1px solid rgba(255, 255, 255, 0.02)',
          minHeight: '80px'
        }}>
          {renderSimpleMarkdown(text)}
        </div>
      )}
    </div>
  );
}
