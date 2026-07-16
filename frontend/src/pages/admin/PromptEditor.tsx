import React, { useState, useEffect } from 'react';
import { Button, Input, message, Spin } from 'antd';
import { Save, FileCode } from 'lucide-react';

interface PromptEditorProps {
  templatePath: string;
}

export default function PromptEditor({ templatePath }: PromptEditorProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!templatePath) return;
    const fetchPrompt = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/prompts?path=${encodeURIComponent(templatePath)}`);
        if (res.ok) {
          const data = await res.json();
          setContent(data.content || '');
        } else {
          setContent('');
        }
      } catch (e) {
        console.error(e);
        message.error("Failed to load prompt");
      } finally {
        setLoading(false);
      }
    };
    fetchPrompt();
  }, [templatePath]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: templatePath, content })
      });
      if (res.ok) {
        message.success('Prompt saved successfully!');
      } else {
        message.error('Failed to save prompt');
      }
    } catch (e) {
      console.error(e);
      message.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!templatePath) return <div className="p-4 text-[var(--text-secondary)]">No template path provided.</div>;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg overflow-hidden">
      <div className="flex justify-between items-center bg-[var(--bg-panel)] px-4 py-2 border-b border-[var(--border-color)]">
        <div className="text-[var(--text-primary)] font-mono text-sm flex items-center gap-2">
          <FileCode size={16} className="text-[var(--accent-purple)]" />
          {templatePath}
        </div>
        <Button type="primary" size="small" icon={<Save size={14} />} onClick={handleSave} loading={saving}>
          Save
        </Button>
      </div>
      
      {loading ? (
        <div className="flex-1 flex justify-center items-center">
          <Spin />
        </div>
      ) : (
        <Input.TextArea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 w-full bg-transparent border-none text-[var(--text-primary)] font-mono p-4 focus:ring-0 resize-none rounded-none"
          style={{ minHeight: '400px' }}
        />
      )}
    </div>
  );
}
