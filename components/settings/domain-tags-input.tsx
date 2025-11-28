import { useState, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DomainTagsInputProps {
  domains: string[];
  onAdd: (domain: string) => void;
  onRemove: (domain: string) => void;
  placeholder?: string;
}

export function DomainTagsInput({
  domains,
  onAdd,
  onRemove,
  placeholder = 'Digite um domínio e pressione Enter...',
}: DomainTagsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      onAdd(inputValue.trim());
      setInputValue('');
    }
  };

  const normalizeDomain = (domain: string): string => {
    return domain
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('/')[0]; // Remove path
  };

  return (
    <div className="space-y-2">
      <Label>Domínios Bloqueados</Label>
      <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[50px] bg-background">
        {domains.map((domain) => (
          <Badge
            key={domain}
            variant="secondary"
            className="flex items-center gap-1 pr-1"
          >
            {domain}
            <button
              type="button"
              onClick={() => onRemove(domain)}
              className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={domains.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[200px] border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Digite um domínio (ex: youtube.com) e pressione Enter para adicionar à lista negra.
      </p>
    </div>
  );
}

