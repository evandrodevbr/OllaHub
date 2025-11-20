'use client';

import { useState, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface McpJsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function McpJsonEditor({ value, onChange, placeholder, className }: McpJsonEditorProps) {
  const { theme, resolvedTheme } = useTheme();
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFormatted, setIsFormatted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightContainerRef = useRef<HTMLDivElement>(null);

  // Determine theme
  const isDark = resolvedTheme === 'dark' || theme === 'dark';
  const codeStyle = isDark ? vscDarkPlus : vs;

  // Validate JSON and update state
  const validateJson = (jsonString: string) => {
    if (!jsonString.trim()) {
      setIsValid(true);
      setErrorMessage(null);
      return;
    }

    try {
      JSON.parse(jsonString);
      setIsValid(true);
      setErrorMessage(null);
    } catch (e) {
      setIsValid(false);
      const error = e instanceof Error ? e.message : 'JSON inválido';
      setErrorMessage(error);
    }
  };

  // Format JSON
  const formatJson = () => {
    if (!value.trim()) return;

    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      onChange(formatted);
      setIsFormatted(true);
      setTimeout(() => setIsFormatted(false), 2000);
    } catch (e) {
      // If invalid, show error
      validateJson(value);
    }
  };

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    validateJson(newValue);
    setIsFormatted(false);
  };

  // Sync scroll between textarea and highlight
  const handleScroll = () => {
    if (textareaRef.current && highlightContainerRef.current) {
      const scrollTop = textareaRef.current.scrollTop;
      const scrollLeft = textareaRef.current.scrollLeft;
      
      const pre = highlightContainerRef.current.querySelector('pre');
      if (pre) {
        pre.scrollTop = scrollTop;
        pre.scrollLeft = scrollLeft;
      }
    }
  };

  // Validate on mount and when value changes externally
  useEffect(() => {
    validateJson(value);
  }, [value]);

  // Count lines for display
  const lineCount = value.split('\n').length;

  return (
    <div className={cn('relative flex flex-col h-full min-h-0', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={formatJson}
            disabled={!value.trim()}
            className="h-7 text-xs"
          >
            <Wand2 className="w-3 h-3 mr-1" />
            Formatar
          </Button>
          {isFormatted && (
            <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              Formatado
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {lineCount > 0 && <span>{lineCount} linha{lineCount !== 1 ? 's' : ''}</span>}
          {!isValid && errorMessage && (
            <div className="flex items-center gap-1 text-destructive">
              <AlertCircle className="w-3 h-3" />
              <span className="max-w-[200px] truncate">{errorMessage}</span>
            </div>
          )}
          {isValid && value.trim() && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3 h-3" />
              Válido
            </div>
          )}
        </div>
      </div>

      {/* Editor Container */}
      <div className="relative flex-1 min-h-[300px] border rounded-md overflow-hidden bg-background">
        {/* Syntax Highlighted Background */}
        <div ref={highlightContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
          <SyntaxHighlighter
            language="json"
            style={codeStyle}
            customStyle={{
              margin: 0,
              padding: '0.75rem',
              background: 'transparent',
              fontSize: '0.875rem',
              lineHeight: '1.5rem',
              overflow: 'hidden',
              height: '100%',
            }}
            PreTag="pre"
          >
            {value || placeholder || '{}'}
          </SyntaxHighlighter>
        </div>

        {/* Editable Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onScroll={handleScroll}
          placeholder={placeholder}
          className={cn(
            'relative w-full h-full min-h-[300px] p-3 font-mono text-sm leading-6',
            'bg-transparent text-transparent caret-foreground',
            'resize-none border-none outline-none',
            'selection:bg-primary/20',
            '[&::placeholder]:text-muted-foreground/50',
            !isValid && 'ring-1 ring-destructive'
          )}
          spellCheck={false}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            overflow: 'auto',
            overflowY: 'auto',
            overflowX: 'auto',
          }}
        />
      </div>
    </div>
  );
}

