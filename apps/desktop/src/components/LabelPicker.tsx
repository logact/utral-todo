import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getAllLabels } from '../db/labels';
import type { Label } from '../types';

interface LabelPickerProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function LabelPicker({ tags, onChange, placeholder = 'Type and press Enter...' }: LabelPickerProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Label[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllLabels().then(setSuggestions);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = inputValue.trim()
    ? suggestions.filter(
        (s) =>
          s.name.toLowerCase().includes(inputValue.toLowerCase()) &&
          !tags.includes(s.name)
      )
    : suggestions.filter((s) => !tags.includes(s.name)).slice(0, 8);

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInputValue('');
    setShowSuggestions(false);
    setSelectedIndex(-1);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filtered.length) {
        addTag(filtered[selectedIndex].name);
      } else {
        addTag(inputValue);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.endsWith(',')) {
      addTag(val.slice(0, -1));
    } else {
      setInputValue(val);
      setShowSuggestions(true);
      setSelectedIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="w-full min-h-[2.75rem] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-indigo-900 dark:hover:text-indigo-200"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] text-sm bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((suggestion, idx) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => addTag(suggestion.name)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors ${
                idx === selectedIndex
                  ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>{suggestion.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {suggestion.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
