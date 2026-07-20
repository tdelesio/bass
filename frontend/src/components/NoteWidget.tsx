import React, { useState, useEffect } from 'react';
import { Edit3, Eye, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface NoteWidgetProps {
  widgetId: string;
  initialData: {
    text?: string;
  };
  onSave: (data: { text: string }) => void;
  isPlayMode?: boolean;
}

export default function NoteWidget({ widgetId, initialData, onSave, isPlayMode }: NoteWidgetProps) {
  const [text, setText] = useState(initialData.text || 'Write notes here...');
  const [isEditing, setIsEditing] = useState(isPlayMode ? false : (!initialData.text || initialData.text === 'Write notes here...'));
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  useEffect(() => {
    if (initialData.text !== undefined) {
      setText(initialData.text);
      setSaveStatus('saved');
    }
  }, [initialData]);

  useEffect(() => {
    if (isPlayMode) {
      setIsEditing(false);
    }
  }, [isPlayMode]);

  const triggerSave = async (textToSave: string) => {
    setSaveStatus('saving');
    try {
      await onSave({ text: textToSave });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to autosave notes:', err);
      setSaveStatus('dirty');
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    setSaveStatus('dirty');
  };

  const handleBlur = () => {
    if (saveStatus === 'dirty') {
      triggerSave(text);
    }
  };

  const handleSaveAndPreview = () => {
    setIsEditing(false);
    triggerSave(text);
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
      {!isPlayMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
          {/* Autosave Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
            {saveStatus === 'saved' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-green)', opacity: 0.8 }}>
                <CheckCircle2 size={12} /> Autosaved
              </span>
            )}
            {saveStatus === 'saving' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--secondary)' }}>
                <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Saving...
              </span>
            )}
            {saveStatus === 'dirty' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#f59e0b', opacity: 0.9 }}>
                <AlertCircle size={12} /> Unsaved changes (autosaves on blur)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isEditing ? (
              <button 
                className="btn btn-primary" 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} 
                onClick={handleSaveAndPreview}
              >
                <Eye size={12} /> Save & Preview
              </button>
            ) : (
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} 
                onClick={() => setIsEditing(true)}
              >
                <Edit3 size={12} /> Edit Note
              </button>
            )}
          </div>
        </div>
      )}

      {isEditing ? (
        <textarea
          className="input-field"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
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
