import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, Plus, X } from 'lucide-react';
import { ProductItem } from '../types/quotation';
import { sortProductsAlphabetically } from '../utils/calculations';

interface SearchableProductSelectProps {
  value: string;
  options: ProductItem[];
  onChange: (newId: string) => void;
}

function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  value,
  options,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpwards: boolean;
  }>({ top: 0, left: 0, width: 320, maxHeight: 280, openUpwards: false });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const sortedOptions = useMemo(
    () => sortProductsAlphabetically(options),
    [options]
  );

  const selectedProduct = useMemo(
    () => sortedOptions.find((p) => p.id === value) || null,
    [sortedOptions, value]
  );

  const filteredOptions = useMemo(() => {
    const cleanQuery = normalizeSearch(query);
    if (!cleanQuery) return sortedOptions;
    const terms = cleanQuery.split(/\s+/).filter(Boolean);
    return sortedOptions.filter((p) => {
      const target = normalizeSearch(p.description);
      return terms.every((term) => target.includes(term));
    });
  }, [sortedOptions, query]);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popoverWidth = Math.max(320, rect.width);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpwards = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableHeight = openUpwards ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(180, Math.min(340, availableHeight));
    const left = Math.max(
      12,
      Math.min(rect.right - popoverWidth, window.innerWidth - popoverWidth - 12)
    );
    const top = openUpwards ? rect.top - 4 : rect.bottom + 4;

    setCoords({
      top,
      left,
      width: popoverWidth,
      maxHeight,
      openUpwards,
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = (e: Event) => {
      // Keep open when scrolling inside the popover's own list
      if (popoverRef.current?.contains(e.target as Node)) return;
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!isOpen) {
            setQuery('');
            updatePosition();
          }
          setIsOpen((prev) => !prev);
        }}
        title={
          selectedProduct
            ? `Mesma linha de: ${selectedProduct.description}`
            : 'Criar nova linha no mapa'
        }
        className={`w-52 max-w-full flex items-center justify-between gap-1.5 text-[11px] rounded-md px-2 py-1 border text-left transition-colors cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-slate-900 ${
          selectedProduct
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold hover:bg-emerald-100/70'
            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
        }`}
      >
        <span className="truncate">
          {selectedProduct ? `✓ ${selectedProduct.description}` : '+ Novo produto (criar linha)'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
              transform: coords.openUpwards ? 'translateY(-100%)' : undefined,
            }}
            className="z-[90] bg-white border border-slate-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Campo de Pesquisa */}
            <div className="p-2 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredOptions.length === 1) {
                      e.preventDefault();
                      handleSelect(filteredOptions[0].id);
                    }
                  }}
                  placeholder="Pesquisar produto no mapa..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpar pesquisa"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Opções em ordem alfabética */}
            <div className="overflow-y-auto flex-1 py-1">
              <button
                type="button"
                onClick={() => handleSelect('')}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                  value === ''
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Novo produto (criar linha)</span>
              </button>

              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                  Nenhum produto encontrado para &ldquo;{query}&rdquo;
                </div>
              ) : (
                filteredOptions.map((product) => {
                  const isSelected = product.id === value;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleSelect(product.id)}
                      className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white font-semibold'
                          : 'text-slate-800 hover:bg-emerald-50'
                      }`}
                    >
                      <Check
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? 'opacity-100' : 'opacity-40 text-emerald-700'
                        }`}
                      />
                      <span className="truncate" title={product.description}>
                        {product.description}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
