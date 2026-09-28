"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ExternalLink, Search, X } from "lucide-react";
import { mapLinks } from "@/lib/schedule";

const MAX_SUGGESTIONS = 6;
const searchKey = (name: string) => name.trim().normalize("NFKC").toLocaleLowerCase("ja");

/** 候補を選んだ後も直接編集できる、予定用の自由入力コンボボックス。 */
export function ScheduleNameField({
  label, placeholder, value, options, maxLength, mapSearch = false, description, disabled, onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  maxLength: number;
  mapSearch?: boolean;
  description?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLButtonElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const names = [...new Set(options.map((name) => name.trim()).filter(Boolean))];
  const matches = names.filter((name) => !filtering || searchKey(name).includes(searchKey(value)));
  const suggestions = matches.slice(0, MAX_SUGGESTIONS);
  const trimmed = value.trim();
  const isNew = !!trimmed && !names.includes(trimmed);
  const maps = mapSearch ? mapLinks({ location: trimmed }) : null;
  const expanded = open && !disabled;
  const hasActiveOption = expanded && activeIndex >= 0 && activeIndex < suggestions.length;

  useEffect(() => {
    const option = activeOptionRef.current;
    const list = suggestionsRef.current;
    if (!open || activeIndex < 0 || !option || !list) return;
    // ページやモーダルを動かさず、候補リストの中だけをスクロールする。
    const offset = option.getBoundingClientRect().top - list.getBoundingClientRect().top;
    if (offset < 0) list.scrollTop += offset;
    else if (offset + option.offsetHeight > list.clientHeight) list.scrollTop += offset + option.offsetHeight - list.clientHeight;
  }, [open, activeIndex]);

  const select = (name: string) => {
    onChange(name);
    inputRef.current?.focus({ preventScroll: true });
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 日本語の変換確定で候補を選択したり、予定を送信したりしない。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!suggestions.length) return -1;
        if (!expanded || current < 0) return event.key === "ArrowDown" ? 0 : suggestions.length - 1;
        return (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(hasActiveOption ? suggestions[activeIndex] : trimmed);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="schedule-name-field" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }}>
      <label htmlFor={id}>{label} <span>任意</span></label>
      <div className="schedule-name-input">
        <Search size={17} aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-list` : undefined}
          aria-activedescendant={hasActiveOption ? `${id}-option-${activeIndex}` : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onFocus={() => { setFiltering(false); setActiveIndex(-1); setOpen(true); }}
          onClick={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setFiltering(true); setActiveIndex(-1); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {value && <button type="button" className="schedule-name-clear" aria-label={`${label}をクリア`} disabled={disabled} onPointerDown={(event) => event.preventDefault()} onClick={() => {
          onChange("");
          inputRef.current?.focus({ preventScroll: true });
          setFiltering(false);
          setActiveIndex(-1);
          setOpen(true);
        }}><X size={17} aria-hidden="true" /></button>}
      {expanded && (
        <div ref={suggestionsRef} className="schedule-name-suggestions">
          <div id={`${id}-list`} role="listbox" aria-label={`${label}の候補`}>
            {suggestions.map((name, index) => (
              <button
                  key={name}
                  ref={index === activeIndex ? activeOptionRef : undefined}
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === activeIndex}
                  className="schedule-name-option"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => select(name)}
              ><span>{name}</span>{name === trimmed && <Check size={16} aria-hidden="true" />}</button>
            ))}
          </div>
          {!suggestions.length && <p className="schedule-name-empty">{trimmed ? "一致する候補はありません。そのまま新しい名前を入力できます。" : "候補はまだありません。名前を入力してください。"}</p>}
          {matches.length > MAX_SUGGESTIONS && <p className="schedule-name-empty">ほか{matches.length - MAX_SUGGESTIONS}件あります。入力して絞り込めます。</p>}
        </div>
      )}
      </div>
      {/* <p id={`${id}-hint`} className="schedule-name-hint">
        {isNew ? "新しい名前です。予定を保存すると候補にも登録されます。" : trimmed ? "登録済みの名前です。そのまま入力して変更できます。" : "過去の候補を選ぶか、新しい名前を入力できます。"}
        {description && <span>{description}</span>}
      </p> */}
      {maps && <div className="schedule-map-links" aria-label="入力した場所を地図で検索">
        <a href={maps.google} target="_blank" rel="noopener noreferrer">Google マップで検索<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
        <a href={maps.apple} target="_blank" rel="noopener noreferrer">Apple マップで検索<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">（新しいタブで開く）</span></a>
      </div>}
    </div>
  );
}
